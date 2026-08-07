import { useState, useMemo } from 'react';
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
      // Mirror the budget aggregation: special-budget (event/trip) rows
      // live in their own envelope and don't count toward the category
      // budget, so they're excluded from this drill-down too.
      // Settling an advance is not spending either — same predicate as
      // computeCategoryNets, so this list sums to the figure on the row
      // that opened it.
      .filter(t => t.type === 'expense' && t.category?.name === selectedCategory
        && t.include_in_stats !== false && !t.special_budget_id
        && !t.repayment_of_transaction_id)
      .map(t => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        // Signed, matching netExpenseAmount: an over-refund is money back.
        netAmount: t.amount - (t.refunded_amount || 0),
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

  // Tinted 1px border on the normal elevated surface — no colour wash. The
  // band has to read as a note beside the hero, not louder than it.
  const renderBand = (
    items: typeof alerts,
    tone: 'neg' | 'warn',
    title: string,
    detail: string,
  ) => (
    <div
      // Kept from the shadcn <Alert> this replaced: a budget-exceeded warning
      // has to reach a screen reader, and the card that took its place is a
      // plain div.
      role="alert"
      className="ft-card flex items-start gap-3.5"
      style={{
        padding: 18,
        borderColor: tone === 'neg' ? 'hsl(var(--neg-soft))' : 'hsl(var(--warn-soft))',
      }}
    >
      <div className={`ft-kpi-icon ${tone}`}>
        <AlertTriangle className="h-[15px] w-[15px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-[650]">
          {title}
          {selectedPeriod !== '1m' && (
            <span className="font-normal text-fg-mute"> ({periodLabel})</span>
          )}
        </div>
        <div className="text-[12.5px] text-fg-mute mt-[3px]">{detail}</div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {items.map(a => (
            <button
              key={a.name}
              type="button"
              onClick={() => handleCategoryClick(a.name)}
              className={`ft-tag ${tone} hover:opacity-80 transition-opacity`}
            >
              {a.name} · {Math.round(a.percent)}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const overBy = exceeded.reduce((s, a) => s + (a.spent - a.budget), 0);
  const leftBefore = approaching.reduce((s, a) => s + (a.budget - a.spent), 0);

  // Two siblings, not a wrapper: the dashboard's alert band is a grid, and
  // each card has to be able to take its own cell in it.
  return (
    <>
      {exceeded.length > 0 &&
        renderBand(
          exceeded,
          'neg',
          t('budgetAlerts.exceeded', { count: exceeded.length }),
          t('budgetAlerts.overByTotal', {
            defaultValue: '{{names}} — {{amount}} over in total.',
            names: exceeded.map(a => a.name).join(', '),
            amount: formatCurrency(overBy),
          }),
        )}

      {approaching.length > 0 &&
        renderBand(
          approaching,
          'warn',
          t('budgetAlerts.approaching', { count: approaching.length }),
          t('budgetAlerts.leftBeforeLimit', {
            defaultValue: '{{names}} — {{amount}} left before the limit.',
            names: approaching.map(a => a.name).join(', '),
            amount: formatCurrency(leftBefore),
          }),
        )}

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
