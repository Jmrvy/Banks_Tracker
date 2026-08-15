import { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth } from "date-fns";
import { Book } from "lucide-react";
import { useReportsData, type ScheduledDebtPaymentInfo } from "@/hooks/useReportsData";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useDebts } from "@/hooks/useDebts";
import { supabase } from "@/integrations/supabase/client";
import { PeriodSelector } from "@/components/reports/PeriodSelector";
import { AnalysisHero } from "@/components/reports/AnalysisHero";
import { AnalysisToolbar } from "@/components/reports/AnalysisToolbar";
import { OverTimeTab } from "@/components/reports/OverTimeTab";
import { FlowsTab } from "@/components/reports/FlowsTab";
import { ComingTab } from "@/components/reports/ComingTab";
import { CategoriesTab } from "@/components/reports/CategoriesTab";
import { RecurringTab } from "@/components/reports/RecurringTab";
import { TransactionTypeModal } from "@/components/TransactionTypeModal";
import { ReportWizard } from "@/components/ReportWizard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { parseLocalDate, getTxDate } from "@/lib/dateUtils";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import type { Transaction } from "@/hooks/useFinancialData";

type AnalysisTab = "overtime" | "flows" | "categories" | "recurring" | "coming";

const Reports = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overtime");
  const [periodType, setPeriodType] = useState<"month" | "year" | "custom">("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  // The setter is wired now that the Recurring tab is rendered — it owns the
  // toggle between declared recurrences and detected spending patterns.
  const [useSpendingPatterns, setUseSpendingPatterns] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Page-level toolbar state (hoisted out of tabs)
  const [includeUpcoming, setIncludeUpcoming] = useState(false);
  const { preferences } = useUserPreferences();
  const [dateType, setDateType] = useState<'accounting' | 'value'>(preferences.dateType);
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
  const [scheduledDebtPaymentInfos, setScheduledDebtPaymentInfos] = useState<ScheduledDebtPaymentInfo[]>([]);
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
    threeMoAvgStats,
    yearAgoStats,
    yearAgoPeriod,
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

  // Resolve compare-to selection into a single comparisonStats object + label
  const { comparisonStats, comparisonLabel } = useMemo(() => {
    if (compareTo === '3mo') {
      return {
        comparisonStats: threeMoAvgStats,
        comparisonLabel: t('reports.analysis.threeMoAvg', { defaultValue: '3-mo avg' }),
      };
    }
    if (compareTo === 'yearAgo') {
      return {
        comparisonStats: yearAgoStats,
        comparisonLabel: yearAgoPeriod.label,
      };
    }
    return { comparisonStats: priorStats, comparisonLabel: priorPeriod.label };
  }, [compareTo, priorStats, threeMoAvgStats, yearAgoStats, priorPeriod.label, yearAgoPeriod.label, t]);

  // Include-upcoming: fold future recurring occurrences into stats
  const upcomingTotals = useMemo(() => {
    let income = 0, expenses = 0;
    for (const pi of recurringData.periodItems) {
      const futureSum = (pi.occurrenceDetails || [])
        .filter(d => d.isFuture)
        .reduce((s, d) => s + d.amount, 0);
      if (pi.effectiveType === 'income') income += futureSum;
      else expenses += futureSum;
    }
    return { income, expenses };
  }, [recurringData.periodItems]);

  const effectiveStats = useMemo(() => {
    if (!includeUpcoming) return stats;
    const income = stats.income + upcomingTotals.income;
    const expenses = stats.expenses + upcomingTotals.expenses;
    const netPeriodBalance = income - expenses;
    return {
      ...stats,
      income,
      expenses,
      netPeriodBalance,
      finalBalance: stats.initialBalance + netPeriodBalance,
    };
  }, [includeUpcoming, stats, upcomingTotals]);

  const projectedTransactions = useMemo<Transaction[]>(() => {
    if (!includeUpcoming) return [];

    const interpolate = (desc: string, isoDate: string): string => {
      if (!desc) return desc;
      const d = parseLocalDate(isoDate);
      const m = d.getMonth() + 1;
      const yyyy = String(d.getFullYear());
      const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';
      const monthName = new Intl.DateTimeFormat(locale, { month: 'long' }).format(d);
      const map: Record<string, string> = {
        MM: String(m).padStart(2, '0'),
        M: String(m),
        YY: yyyy.slice(-2),
        YYYY: yyyy,
        YEAR: yyyy,
        ANNEE: yyyy,
        MOIS: monthName,
        MONTH: monthName,
        DD: String(d.getDate()).padStart(2, '0'),
        D: String(d.getDate()),
      };
      return desc.replace(/\{([A-Za-z]+)\}/g, (_, k) => map[k.toUpperCase()] ?? '');
    };

    return recurringData.periodItems.flatMap((item) =>
      (item.occurrenceDetails || [])
        .filter((detail) => detail.isFuture)
        .map((detail) => ({
          id: `projection-${item.recurring.id}-${detail.date}`,
          account_id: item.recurring.account_id,
          description: interpolate(item.recurring.description, detail.date),
          amount: detail.amount,
          type: item.effectiveType,
          transaction_date: detail.date,
          value_date: detail.date,
          include_in_stats: true,
          account: item.recurring.account ?? {
            name: t('common.unknownAccount', { defaultValue: 'Unknown account' }),
            bank: 'other',
          },
          category: item.recurring.category,
          transfer_to_account_id: undefined,
          transfer_to_account: undefined,
          transfer_fee: undefined,
          refund_of_transaction_id: null,
          refunded_amount: 0,
          refund_of_transaction: null,
          installment_payment_id: item.recurring.installment_payment_id,
          recurring_transaction_id: item.recurring.id,
          isProjection: true,
          projectedSource: item.recurring.debt_id
            ? 'debt'
            : item.recurring.installment_payment_id
              ? 'installment'
              : 'recurring',
        } satisfies Transaction))
    );
  }, [includeUpcoming, recurringData.periodItems, t]);

  const incomeModalTransactions = useMemo(() => {
    const realTransactions = filteredTransactions.filter(tx => tx.type === 'income' && tx.include_in_stats !== false && !tx.refund_of_transaction_id);
    const combined = includeUpcoming
      ? [...realTransactions, ...projectedTransactions.filter(tx => tx.type === 'income')]
      : realTransactions;

    return [...combined].sort((a, b) => getTxDate(b, dateType).getTime() - getTxDate(a, dateType).getTime());
  }, [dateType, filteredTransactions, includeUpcoming, projectedTransactions]);

  const expenseModalTransactions = useMemo(() => {
    const realTransactions = filteredTransactions.filter(tx => tx.type === 'expense' && tx.include_in_stats !== false);
    const combined = includeUpcoming
      ? [...realTransactions, ...projectedTransactions.filter(tx => tx.type === 'expense')]
      : realTransactions;

    return [...combined].sort((a, b) => getTxDate(b, dateType).getTime() - getTxDate(a, dateType).getTime());
  }, [dateType, filteredTransactions, includeUpcoming, projectedTransactions]);


  // The pack's five views of one period, in its order. Labels reuse the
  // existing tab keys; the strip is the shared Segmented control.
  const tabOptions: { value: AnalysisTab; label: string }[] = [
    { value: 'overtime', label: t('reports.analysis.tabOverTime', { defaultValue: 'Over time' }) },
    { value: 'flows', label: t('reports.analysis.tabFlows', { defaultValue: 'Flows' }) },
    { value: 'categories', label: t('reports.analysis.tabCategories', { defaultValue: 'Categories' }) },
    { value: 'recurring', label: t('reports.analysis.tabRecurring', { defaultValue: 'Recurring' }) },
    { value: 'coming', label: t('reports.analysis.tabComing', { defaultValue: "What's coming" }) },
  ];

  if (loading) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head — nav group in the eyebrow, page name as the title. */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.tools')}</div>
            <h1 className="ft-page-title">{t('navigation.analyse')}</h1>
            <div className="ft-page-sub">
              {t('reports.analysis.title', { defaultValue: 'Financial overview' })} ·{' '}
              {t('reports.analysis.subtitle', {
                count: accounts.length,
                txCount: filteredTransactions.length,
                defaultValue: '{{count}} accounts · {{txCount}} transactions',
              })}{' '}
              · {period.label}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <PeriodSelector
              periodType={periodType}
              setPeriodType={setPeriodType}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              dateRange={dateRange}
              setDateRange={setDateRange}
            />
            <Button
              variant="outline"
              onClick={() => setShowExportModal(true)}
              className="h-[29px] rounded-[9px] px-2.5 gap-1.5 text-[12px] font-550 border-line-strong [&_svg]:size-[14px]"
            >
              <Book />
              <span className="hidden sm:inline">{t('reports.generateReport', { defaultValue: 'Generate report' })}</span>
              <span className="sm:hidden">{t('reports.generate', { defaultValue: 'Generate' })}</span>
            </Button>
          </div>
        </div>

        {/* Four peer KPIs: money in / money out / net / savings rate. */}
        <AnalysisHero
          stats={effectiveStats}
          priorStats={comparisonStats}
          priorPeriodLabel={comparisonLabel}
          sparkline={sparklineData}
          onIncomeClick={() => setShowIncomeModal(true)}
          onExpensesClick={() => setShowExpensesModal(true)}
        />

        {/* The pack's five views of one period, in its order: Over time /
            Flows / Categories / Recurring / What's coming. Categories and
            Recurring were built but never mounted, so the page had been
            showing three. The view modifiers ride the same row, flushed
            right. */}
        <Tabs value={activeTab} className="w-full flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5">
            {/* The five views ride the shared Segmented control, whose own
                scroller (overflow-x-auto, hidden bar) keeps all five labels
                reachable by swipe on a phone instead of clipping flat. */}
            <div data-tour="reports-tabs" className="min-w-0 max-w-full">
              <Segmented
                options={tabOptions}
                value={activeTab}
                onChange={(v) => setActiveTab(v)}
                className="mx-0 px-0"
                label={t('reports.analysis.tabsLabel', { defaultValue: 'Analysis views' })}
              />
            </div>

            <div className="flex-1" />

            <AnalysisToolbar
              includeUpcoming={includeUpcoming}
              setIncludeUpcoming={setIncludeUpcoming}
              dateType={dateType}
              setDateType={setDateType}
              compareTo={compareTo}
              setCompareTo={setCompareTo}
              priorPeriodLabel={priorPeriod.label}
            />
          </div>

          <TabsContent value="overtime" className="mt-0">
            <OverTimeTab
              balanceEvolutionData={balanceEvolutionData}
              stats={effectiveStats}
              recurringData={recurringData}
              period={period}
              dateType={dateType}
            />
          </TabsContent>

          <TabsContent value="flows" className="mt-0">
            <FlowsTab
              stats={effectiveStats}
              comparisonStats={comparisonStats}
              comparisonLabel={comparisonLabel}
              filteredTransactions={filteredTransactions}
              categoryChartData={categoryChartData}
              incomeAnalysis={incomeAnalysis}
              recurringData={recurringData}
              includeUpcoming={includeUpcoming}
              onIncomeClick={() => setShowIncomeModal(true)}
              onExpensesClick={() => setShowExpensesModal(true)}
            />

          </TabsContent>


          <TabsContent value="categories" className="mt-0">
            <CategoriesTab
              categoryChartData={categoryChartData}
              transactions={filteredTransactions}
              periodStart={period.from}
              periodEnd={period.to}
              includeUpcoming={includeUpcoming}
              upcomingItems={recurringData.periodItems}
              dateType={dateType}
            />
          </TabsContent>

          <TabsContent value="recurring" className="mt-0">
            <RecurringTab
              recurringData={recurringData}
              spendingPatternsData={spendingPatternsData}
              period={period}
              useSpendingPatterns={useSpendingPatterns}
              setUseSpendingPatterns={setUseSpendingPatterns}
            />
          </TabsContent>

          <TabsContent value="coming" className="mt-0">
            <ComingTab recurringData={recurringData} period={period} />
          </TabsContent>
        </Tabs>
      </div>

      <TransactionTypeModal
        open={showIncomeModal}
        onOpenChange={setShowIncomeModal}
        transactions={incomeModalTransactions}
        type="income"
        period={period.label}
        dateType={dateType}
      />

      <TransactionTypeModal
        open={showExpensesModal}
        onOpenChange={setShowExpensesModal}
        transactions={expenseModalTransactions}
        type="expense"
        period={period.label}
        dateType={dateType}
      />


      <ReportWizard open={showExportModal} onOpenChange={setShowExportModal} />
    </div>
  );
};

export default Reports;
