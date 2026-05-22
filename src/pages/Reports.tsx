import { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth } from "date-fns";
import { Activity, ArrowLeftRight, Clock, Download } from "lucide-react";
import { useReportsData } from "@/hooks/useReportsData";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useDebts } from "@/hooks/useDebts";
import { supabase } from "@/integrations/supabase/client";
import { PeriodSelector } from "@/components/reports/PeriodSelector";
import { AnalysisHero } from "@/components/reports/AnalysisHero";
import { AnalysisToolbar } from "@/components/reports/AnalysisToolbar";
import { OverTimeTab } from "@/components/reports/OverTimeTab";
import { CategoriesTab } from "@/components/reports/CategoriesTab";
import { RecurringTab } from "@/components/reports/RecurringTab";
import { IncomeTab } from "@/components/reports/IncomeTab";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";
import { ReportWizard } from "@/components/ReportWizard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useTranslation } from "react-i18next";

const Reports = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [periodType, setPeriodType] = useState<"month" | "year" | "custom">("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [useSpendingPatterns] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Page-level toolbar state (hoisted out of tabs)
  const [includeUpcoming, setIncludeUpcoming] = useState(false);
  const [dateType, setDateType] = useState<'accounting' | 'value'>(() => {
    try {
      const saved = localStorage.getItem('userPreferences');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.dateType === 'value') return 'value';
      }
    } catch { /* ignore */ }
    return 'accounting';
  });
  const [compareTo, setCompareTo] = useState<'prior' | '3mo' | 'yearAgo'>('prior');

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

  const { debts, payments: debtPayments } = useDebts();
  const debtInfos = useMemo(() =>
    debts.map(d => ({
      id: d.id, description: d.description, total_amount: d.total_amount,
      remaining_amount: d.remaining_amount, payment_amount: d.payment_amount, status: d.status,
    })), [debts]);
  const debtPaymentInfos = useMemo(() =>
    debtPayments.map(dp => ({ debt_id: dp.debt_id, payment_date: dp.payment_date, amount: dp.amount })),
    [debtPayments]);
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

  // Page-level date type drives the primary view (hero + over time + flows).
  // Evolution tab still uses accounting for the chart internals.
  const {
    loading,
    period,
    priorPeriod,
    priorStats,
    sparklineData,
    stats,
    balanceEvolutionData,
    recurringData,
    spendingPatternsData,
    accounts,
    filteredTransactions,
    categoryChartData,
    incomeAnalysis,
  } = useReportsData(
    periodType,
    selectedDate,
    dateRange,
    useSpendingPatterns,
    dateType,
    installmentPaymentInfos,
    undefined,
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
            <h1 className="ft-page-title">
              {t('reports.analysis.title', { defaultValue: 'Financial overview' })}
            </h1>
            <div className="ft-page-sub">
              {t('reports.analysis.subtitle', {
                count: accounts.length,
                txCount: filteredTransactions.length,
                defaultValue: '{{count}} accounts · {{txCount}} transactions',
              })}{' '}
              · {period.label}
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setShowExportModal(true)}
            className="h-9 px-3.5 gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('reports.generateReport', { defaultValue: 'Generate report' })}</span>
            <span className="sm:hidden">{t('reports.generate', { defaultValue: 'Generate' })}</span>
          </Button>
        </div>

        {/* Period selector */}
        <PeriodSelector
          periodType={periodType}
          setPeriodType={setPeriodType}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          dateRange={dateRange}
          setDateRange={setDateRange}
        />

        {/* Hoisted page-level toolbar */}
        <AnalysisToolbar
          includeUpcoming={includeUpcoming}
          setIncludeUpcoming={setIncludeUpcoming}
          dateType={dateType}
          setDateType={setDateType}
          compareTo={compareTo}
          setCompareTo={setCompareTo}
          priorPeriodLabel={priorPeriod.label}
        />

        {/* Hero — Net as headline */}
        <AnalysisHero
          stats={stats}
          priorStats={priorStats}
          period={period}
          priorPeriodLabel={priorPeriod.label}
          sparkline={sparklineData}
          onIncomeClick={() => setShowIncomeModal(true)}
          onExpensesClick={() => setShowExpensesModal(true)}
        />

        {/* 3-tab structure: Over time / Flows (in+out) / What's coming */}
        <Tabs defaultValue="overtime" className="space-y-3 w-full">
          <TabsList className="w-full grid grid-cols-3 h-9 sm:h-10 p-0.5 sm:p-1">
            <TabsTrigger value="overtime" className="text-xs sm:text-sm gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              {t('reports.analysis.tabOverTime', { defaultValue: 'Over time' })}
            </TabsTrigger>
            <TabsTrigger value="flows" className="text-xs sm:text-sm gap-1.5">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {t('reports.analysis.tabFlows', { defaultValue: 'Flows' })}
            </TabsTrigger>
            <TabsTrigger value="coming" className="text-xs sm:text-sm gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {t('reports.analysis.tabComing', { defaultValue: "What's coming" })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overtime" className="mt-3">
            <OverTimeTab
              balanceEvolutionData={balanceEvolutionData}
              stats={stats}
              recurringData={recurringData}
              period={period}
            />
          </TabsContent>

          <TabsContent value="flows" className="mt-3 space-y-3">
            {/* Income + Expenses unified — two columns on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="min-w-0">
                <IncomeTab
                  incomeAnalysis={incomeAnalysis}
                  totalIncome={stats.income}
                  includeUpcoming={includeUpcoming}
                  upcomingItems={recurringData.periodItems.filter(pi => pi.effectiveType === 'income')}
                  projectedIncome={recurringData.periodIncome}
                />
              </div>
              <div className="min-w-0">
                <CategoriesTab
                  categoryChartData={categoryChartData}
                  transactions={filteredTransactions}
                  periodStart={period.from}
                  periodEnd={period.to}
                  includeUpcoming={includeUpcoming}
                  upcomingItems={recurringData.periodItems.filter(pi => pi.effectiveType === 'expense')}
                  projectedExpenses={recurringData.periodExpenses}
                  dateType={dateType}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="coming" className="mt-3">
            <RecurringTab
              recurringData={recurringData}
              spendingPatternsData={spendingPatternsData}
              period={period}
              useSpendingPatterns={useSpendingPatterns}
              setUseSpendingPatterns={() => { /* noop — patterns hoisted out */ }}
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

      <ReportWizard open={showExportModal} onOpenChange={setShowExportModal} />
    </div>
  );
};

export default Reports;
