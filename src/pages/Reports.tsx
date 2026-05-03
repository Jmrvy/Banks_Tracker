import { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth } from "date-fns";
import { BarChart3, Calendar, CalendarCheck, Download, Clock } from "lucide-react";
import { useReportsData } from "@/hooks/useReportsData";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useDebts } from "@/hooks/useDebts";
import { supabase } from "@/integrations/supabase/client";
import { PeriodSelector } from "@/components/reports/PeriodSelector";
import { StatsCards } from "@/components/reports/StatsCards";
import { EvolutionTab } from "@/components/reports/EvolutionTab";
import { CategoriesTab } from "@/components/reports/CategoriesTab";
import { RecurringTab } from "@/components/reports/RecurringTab";
import { IncomeTab } from "@/components/reports/IncomeTab";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";
import { ReportWizard } from "@/components/ReportWizard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PeriodRecurringItem } from "@/hooks/useReportsData";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useTranslation } from "react-i18next";

const Reports = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [periodType, setPeriodType] = useState<"month" | "year" | "custom">("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [useSpendingPatterns, setUseSpendingPatterns] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [includeUpcoming, setIncludeUpcoming] = useState(false);
  const [incomeExpenseDateType, setIncomeExpenseDateType] = useState<'accounting' | 'value'>(() => {
    try {
      const saved = localStorage.getItem('userPreferences');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.dateType === 'value') return 'value';
      }
    } catch {}
    return 'accounting';
  });

  // Installment payments data for capping recurring occurrence projections
  const { installmentPayments } = useInstallmentPayments();
  const installmentPaymentInfos = useMemo(() =>
    installmentPayments.map(ip => ({
      id: ip.id,
      remaining_amount: ip.remaining_amount,
      installment_amount: ip.installment_amount,
      is_active: ip.is_active,
    })),
    [installmentPayments]
  );

  // Debt data for recurring transaction amount resolution
  const { debts, payments: debtPayments } = useDebts();
  const debtInfos = useMemo(() =>
    debts.map(d => ({
      id: d.id,
      description: d.description,
      total_amount: d.total_amount,
      remaining_amount: d.remaining_amount,
      payment_amount: d.payment_amount,
      status: d.status,
    })),
    [debts]
  );
  const debtPaymentInfos = useMemo(() =>
    debtPayments.map(dp => ({
      debt_id: dp.debt_id,
      payment_date: dp.payment_date,
      amount: dp.amount,
    })),
    [debtPayments]
  );
  const [scheduledDebtPaymentInfos, setScheduledDebtPaymentInfos] = useState<any[]>([]);
  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('scheduled_debt_payments')
        .select('debt_id, scheduled_date, scheduled_amount, is_paid')
        .eq('user_id', user.id)
        .order('scheduled_date', { ascending: true });
      setScheduledDebtPaymentInfos(data || []);
    };
    fetch();
  }, [user]);

  // Single hook call: evolution/recurring always use accounting date (primary),
  // income/expense tabs use user-selected date type (secondary).
  const {
    loading,
    period,
    stats,
    balanceEvolutionData,
    recurringData,
    spendingPatternsData,
    accounts,
    filteredTransactions,
    secondaryStats: incomeExpenseStats,
    secondaryCategoryChartData: categoryChartData,
    secondaryIncomeAnalysis: incomeAnalysis,
    secondaryFilteredTransactions: incomeExpenseTransactions,
  } = useReportsData(
    periodType,
    selectedDate,
    dateRange,
    useSpendingPatterns,
    'accounting',
    installmentPaymentInfos,
    { secondaryDateType: incomeExpenseDateType },
    debtInfos,
    scheduledDebtPaymentInfos,
    debtPaymentInfos,
  );

  if (loading) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12 overflow-x-hidden">
      <div className="ft-page w-full overflow-hidden">
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.analyse')}</div>
            <h1 className="ft-page-title">{t('reports.pageTitle', { defaultValue: 'Financial analysis' })}</h1>
            <div className="ft-page-sub">
              {t('reports.subtitle', { defaultValue: 'Deep insights across categories, merchants, and time' })} · {period.label}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExportModal(true)}
            className="h-8 px-3 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('common.export', { defaultValue: 'Export PDF' })}</span>
          </Button>
        </div>

        {/* Filtres de période */}
        <PeriodSelector
          periodType={periodType}
          setPeriodType={setPeriodType}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          dateRange={dateRange}
          setDateRange={setDateRange}
        />

        {/* Résumé des soldes */}
        <StatsCards 
          stats={stats} 
          accountsCount={accounts.length}
          onIncomeClick={() => setShowIncomeModal(true)}
          onExpensesClick={() => setShowExpensesModal(true)}
        />

        {/* Graphiques et analyses */}
        <Tabs defaultValue="evolution" className="space-y-3 w-full">
          <TabsList className="w-full grid grid-cols-4 h-9 sm:h-10 p-0.5 sm:p-1">
            <TabsTrigger value="evolution" className="text-xs sm:text-xs lg:text-sm px-1 sm:px-3 h-8 sm:h-8">
              {t('reports.evolutionTab')}
            </TabsTrigger>
            <TabsTrigger value="income" className="text-xs sm:text-xs lg:text-sm px-1 sm:px-3 h-8 sm:h-8">
              {t('reports.incomeTab')}
            </TabsTrigger>
            <TabsTrigger value="categories" className="text-xs sm:text-xs lg:text-sm px-1 sm:px-3 h-8 sm:h-8">
              {t('reports.expensesTab')}
            </TabsTrigger>
            <TabsTrigger value="recurring" className="text-xs sm:text-xs lg:text-sm px-1 sm:px-3 h-8 sm:h-8">
              {t('reports.recurringTab')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="evolution" className="mt-3">
            <EvolutionTab
              balanceEvolutionData={balanceEvolutionData}
              stats={stats}
              recurringData={recurringData}
            />
          </TabsContent>

          <TabsContent value="income" className="mt-3 space-y-3">
            {/* Sélecteurs pour Revenus */}
            <div className="flex items-center justify-between gap-2  flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="upcoming-income"
                  checked={includeUpcoming}
                  onCheckedChange={setIncludeUpcoming}
                  className="scale-75"
                />
                <Label htmlFor="upcoming-income" className="text-xs sm:text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
                  <Clock className="h-3 w-3" />
                  À venir
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Date :</span>
                <ToggleGroup 
                  type="single" 
                  value={incomeExpenseDateType} 
                  onValueChange={(value) => value && setIncomeExpenseDateType(value as 'accounting' | 'value')}
                  className="h-8"
                >
                  <ToggleGroupItem value="accounting" className="text-xs h-7 px-2 gap-1">
                    <Calendar className="h-3 w-3" />
                    Comptable
                  </ToggleGroupItem>
                  <ToggleGroupItem value="value" className="text-xs h-7 px-2 gap-1">
                    <CalendarCheck className="h-3 w-3" />
                    Valeur
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            <IncomeTab 
              incomeAnalysis={incomeAnalysis}
              totalIncome={incomeExpenseStats.income}
              includeUpcoming={includeUpcoming}
              upcomingItems={recurringData.periodItems.filter(pi => pi.effectiveType === 'income')}
              projectedIncome={recurringData.periodIncome}
            />
          </TabsContent>

          <TabsContent value="categories" className="mt-3 space-y-3">
            {/* Sélecteurs pour Dépenses */}
            <div className="flex items-center justify-between gap-2  flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="upcoming-expenses"
                  checked={includeUpcoming}
                  onCheckedChange={setIncludeUpcoming}
                  className="scale-75"
                />
                <Label htmlFor="upcoming-expenses" className="text-xs sm:text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
                  <Clock className="h-3 w-3" />
                  À venir
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Date :</span>
                <ToggleGroup
                  type="single"
                  value={incomeExpenseDateType}
                  onValueChange={(value) => value && setIncomeExpenseDateType(value as 'accounting' | 'value')}
                  className="h-8"
                >
                  <ToggleGroupItem value="accounting" className="text-xs h-7 px-2 gap-1">
                    <Calendar className="h-3 w-3" />
                    Comptable
                  </ToggleGroupItem>
                  <ToggleGroupItem value="value" className="text-xs h-7 px-2 gap-1">
                    <CalendarCheck className="h-3 w-3" />
                    Valeur
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            <CategoriesTab
              categoryChartData={categoryChartData}
              transactions={incomeExpenseTransactions}
              periodStart={period.from}
              periodEnd={period.to}
              includeUpcoming={includeUpcoming}
              upcomingItems={recurringData.periodItems.filter(pi => pi.effectiveType === 'expense')}
              projectedExpenses={recurringData.periodExpenses}
              dateType={incomeExpenseDateType}
            />
          </TabsContent>

          <TabsContent value="recurring" className="mt-3">
            <RecurringTab
              recurringData={recurringData}
              spendingPatternsData={spendingPatternsData}
              period={period}
              useSpendingPatterns={useSpendingPatterns}
              setUseSpendingPatterns={setUseSpendingPatterns}
            />
          </TabsContent>
        </Tabs>
      </div>

      <TransactionTypeModal
        open={showIncomeModal}
        onOpenChange={setShowIncomeModal}
        transactions={filteredTransactions.filter(t => t.type === 'income')}
        type="income"
        period={period.label}
      />

      <TransactionTypeModal
        open={showExpensesModal}
        onOpenChange={setShowExpensesModal}
        transactions={filteredTransactions.filter(t => t.type === 'expense')}
        type="expense"
        period={period.label}
      />

      <ReportWizard
        open={showExportModal}
        onOpenChange={setShowExportModal}
      />
    </div>
  );
};

export default Reports;