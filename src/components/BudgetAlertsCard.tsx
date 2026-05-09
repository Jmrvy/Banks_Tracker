import { useState, useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle } from 'lucide-react';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useReportsData, type CategoryData } from '@/hooks/useReportsData';
import { CategoryTransactionsModal, type CategoryTransaction } from '@/components/CategoryTransactionsModal';
import { usePeriod } from '@/contexts/PeriodContext';
import { useTranslation } from 'react-i18next';
import { parseLocalDate } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const BudgetAlertsCard = () => {
  const { transactions } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { selectedPeriod, dateRange, periodLabel } = usePeriod();
  const { t } = useTranslation();

  const now = useMemo(() => new Date(), []);

  const reportsPeriodType = selectedPeriod === '1m' ? 'month' as const : 'custom' as const;
  const reportsDateRange = useMemo(() => ({
    from: dateRange.start,
    to: dateRange.end,
  }), [dateRange]);

  const { categoryChartData, filteredTransactions, period } = useReportsData(
    reportsPeriodType,
    now,
    reportsDateRange,
    false,
    undefined,
    undefined,
    { skipHeavyComputations: true },
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const alerts = useMemo(() => {
    return categoryChartData
      .filter(c => c.budget > 0)
      .map(c => ({
        ...c,
        percent: (c.spent / c.budget) * 100,
      }))
      // Exactly-at-budget (100%) is on-target, not a breach — exclude it so
      // fixed monthlies like rent don't permanently sit in this card.
      .filter(c => c.percent >= 80 && c.percent !== 100)
      .sort((a, b) => b.percent - a.percent);
  }, [categoryChartData]);

  const exceeded = alerts.filter(a => a.percent > 100);
  const approaching = alerts.filter(a => a.percent < 100);

  const handleCategoryClick = (catName: string) => {
    setSelectedCategory(catName);
    setModalOpen(true);
  };

  const modalCategoryData = useMemo(() => {
    if (!selectedCategory) return undefined;
    return categoryChartData.find(c => c.name === selectedCategory);
  }, [selectedCategory, categoryChartData]);

  const modalTransactions = useMemo<CategoryTransaction[]>(() => {
    if (!selectedCategory) return [];
    const dateType = preferences.dateType;
    return filteredTransactions
      .filter(t => t.type === 'expense' && t.category?.name === selectedCategory && t.include_in_stats !== false)
      .map(t => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        netAmount: Math.max(0, t.amount - (t.refunded_amount || 0)),
        refundedAmount: t.refunded_amount || 0,
        hasRefund: (t.refunded_amount || 0) > 0,
        isFullyRefunded: (t.refunded_amount || 0) >= t.amount,
        bank: t.account?.bank || '',
        date: t.transaction_date,
        valueDate: t.value_date,
        type: t.type,
      }))
      .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
  }, [selectedCategory, filteredTransactions, preferences.dateType]);

  if (alerts.length === 0) return null;

  const renderItems = (items: typeof alerts, isExceeded: boolean) => (
    <div className="space-y-2">
      {items.map(a => (
        <button
          key={a.name}
          onClick={() => handleCategoryClick(a.name)}
          className="w-full text-left space-y-1 hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
              <span className="font-medium">{a.name}</span>
            </div>
            <span className={`font-medium ${isExceeded ? 'text-destructive' : 'text-orange-600 dark:text-orange-400'}`}>
              {formatCurrency(a.spent)} / {formatCurrency(a.budget)}
              {!isExceeded && ` (${Math.round(a.percent)}%)`}
            </span>
          </div>
          <Progress value={Math.min(100, a.percent)} className="h-1.5" />
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="space-y-2">
        {exceeded.length > 0 && (
          <Alert className="border-destructive/50 bg-destructive/10 dark:border-destructive/30 dark:bg-destructive/5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-foreground">
              <p className="text-xs sm:text-sm font-medium mb-2">
                {t('budgetAlerts.exceeded', { count: exceeded.length })}
                {selectedPeriod !== '1m' && (
                  <span className="font-normal text-destructive/80"> ({periodLabel})</span>
                )}
              </p>
              {renderItems(exceeded, true)}
            </AlertDescription>
          </Alert>
        )}

        {approaching.length > 0 && (
          <Alert className="border-orange-500/50 bg-orange-500/10 dark:border-orange-500/30 dark:bg-orange-500/5">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <AlertDescription className="text-foreground">
              <p className="text-xs sm:text-sm font-medium mb-2">
                {t('budgetAlerts.approaching', { count: approaching.length })}
                {selectedPeriod !== '1m' && (
                  <span className="font-normal text-orange-600/80 dark:text-orange-400/80"> ({periodLabel})</span>
                )}
              </p>
              {renderItems(approaching, false)}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {selectedCategory && modalCategoryData && (
        <CategoryTransactionsModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          categoryName={selectedCategory}
          transactions={modalTransactions}
          categoryData={modalCategoryData}
          allTransactions={transactions}
          periodStart={period.from}
          periodEnd={period.to}
          dateType={preferences.dateType}
        />
      )}
    </>
  );
};
