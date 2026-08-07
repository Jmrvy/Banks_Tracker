import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PiggyBank, Plus, TrendingUp, TrendingDown, Target, Calendar, CreditCard, SlidersHorizontal, User } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSavingsGoals, SavingsGoal } from "@/hooks/useSavingsGoals";
import { SavingsCategoriesModal } from "@/components/SavingsCategoriesModal";
import { useInstallmentPayments, InstallmentPayment } from "@/hooks/useInstallmentPayments";
import { useSpecialBudgets, type SpecialBudget } from "@/hooks/useSpecialBudgets";
import { SpecialBudgetDetailModal } from "@/components/SpecialBudgetDetailModal";
import { SpecialBudgetModal } from "@/components/SpecialBudgetModal";
import { Wallet } from "lucide-react";
import { usePeriod } from "@/contexts/PeriodContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { NewSavingsGoalModal } from "@/components/NewSavingsGoalModal";
import { EditSavingsGoalModal } from "@/components/EditSavingsGoalModal";
import { ReimbursementDetailModal } from "@/components/ReimbursementDetailModal";
import { SavingsTransactionsList } from "@/components/SavingsTransactionsList";
import { differenceInDays, format, isWithinInterval } from "date-fns";
import { parseLocalDate, getTxDate } from "@/lib/dateUtils";
import { netIncomeAmount, netExpenseAmount, type EngineTx } from "@/lib/reportsEngine";
import { fr, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Segmented } from "@/components/ui/segmented";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type SavingsSection = 'goals' | 'history' | 'reimbursements';

const Savings = () => {
  const { transactions, categories, loading, refetch } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { goals, isLoading: goalsLoading } = useSavingsGoals();
  const { specialBudgets } = useSpecialBudgets();
  const specialBudgetByGoalId = useMemo(() => {
    const m = new Map<string, SpecialBudget>();
    specialBudgets.forEach((b) => {
      if (b.savings_goal_id) m.set(b.savings_goal_id, b);
    });
    return m;
  }, [specialBudgets]);
  const { installmentPayments, loading: installmentsLoading } = useInstallmentPayments();
  const { dateRange, periodLabel, selectedPeriod, setSelectedPeriod } = usePeriod();
  const { isPrivacyMode } = usePrivacy();
  const { t, i18n } = useTranslation();
  // Month names and day/month order follow the UI language — pinned to `fr`,
  // the axis read "janv./févr." to English users.
  const dateLocale = i18n.language === "fr" ? fr : enUS;

  // Same period presets the dashboard head offers, so the two heads switch
  // the same global window with the same control.
  const periods = [
    { label: "1M", value: "1m" as const },
    { label: "3M", value: "3m" as const },
    { label: "YTD", value: "ytd" as const },
    { label: "1Y", value: "1y" as const },
  ];

  const [showNewGoalModal, setShowNewGoalModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  // Which of the three peer views the page is showing.
  const [section, setSection] = useState<SavingsSection>('goals');
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [selectedReimbursement, setSelectedReimbursement] = useState<InstallmentPayment | null>(null);
  const [openSpecialBudget, setOpenSpecialBudget] = useState<SpecialBudget | null>(null);
  const [newSpecialBudgetForGoal, setNewSpecialBudgetForGoal] = useState<string | null>(null);

  // Get reimbursement installments (these count as savings)
  const reimbursementInstallments = useMemo(() => {
    return installmentPayments.filter(ip => ip.payment_type === 'reimbursement');
  }, [installmentPayments]);

  const reimbursementInstallmentIds = useMemo(() => {
    return new Set(reimbursementInstallments.map(ip => ip.id));
  }, [reimbursementInstallments]);

  const reimbursementTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (!tx.installment_payment_id) return false;
      if (!reimbursementInstallmentIds.has(tx.installment_payment_id)) return false;
      const transactionDate = parseLocalDate(tx.transaction_date);
      return isWithinInterval(transactionDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [transactions, reimbursementInstallmentIds, dateRange]);

  const reimbursementStats = useMemo(() => {
    const total = reimbursementTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    return { total, count: reimbursementTransactions.length };
  }, [reimbursementTransactions]);

  // The categories this page counts, chosen in the selector rather than
  // guessed from their names. Both sides belong here: money put away is an
  // expense, money taken back out is income, and the stats below net them.
  const investmentCategoryIds = useMemo(
    () => new Set(categories.filter(cat => cat.counts_as_savings).map(cat => cat.id)),
    [categories],
  );

  const isInvestment = useCallback(
    (tx: { category?: { id: string } | null }) => !!tx.category && investmentCategoryIds.has(tx.category.id),
    [investmentCategoryIds],
  );

  // Filter transactions by selected period.
  //
  // Same row rules as everywhere else: excluded rows stay excluded, a trip's
  // envelope is not savings, and neither leg of a refund/repayment link is a
  // contribution — the pair nets to nothing, but counting only the leg that
  // falls inside the window made the total drift. Honours the value-date
  // preference too; it used to always window on transaction_date, so a
  // deposit could sit in a different month here than in Reports.
  const periodTransactions = useMemo(() => {
    if (investmentCategoryIds.size === 0) return [];
    return transactions.filter(tx => {
      if (!isInvestment(tx)) return false;
      if (tx.include_in_stats === false) return false;
      if (tx.special_budget_id) return false;
      if (tx.repayment_of_transaction_id || tx.refund_of_transaction_id) return false;
      return isWithinInterval(getTxDate(tx, preferences.dateType), {
        start: dateRange.start,
        end: dateRange.end,
      });
    });
  }, [transactions, investmentCategoryIds, isInvestment, dateRange, preferences.dateType]);

  // ALL savings-related transactions (no date filter) for running balance calculation
  const allSavingsTransactions = useMemo(() => {
    const investmentTxs = investmentCategoryIds.size
      ? transactions.filter(isInvestment)
      : [];
    const reimbursementTxs = transactions.filter(tx =>
      tx.installment_payment_id && reimbursementInstallmentIds.has(tx.installment_payment_id)
    );
    // Deduplicate (a tx could match both filters in theory)
    const seen = new Set<string>();
    return [...investmentTxs, ...reimbursementTxs].filter(tx => {
      if (seen.has(tx.id)) return false;
      seen.add(tx.id);
      return true;
    });
  }, [transactions, investmentCategoryIds, isInvestment, reimbursementInstallmentIds]);

  // Calculate investment statistics for the selected period
  const investmentStats = useMemo(() => {
    const hasInvestments = investmentCategoryIds.size > 0 && periodTransactions.length > 0;
    const hasReimbursements = reimbursementTransactions.length > 0;

    if (!hasInvestments && !hasReimbursements) {
      return { totalSaved: 0, transactionCount: 0, trendData: [], incomeTotal: 0, expenseTotal: 0, netTotal: 0 };
    }

    // Net, not gross: a withdrawal since partly repaid was never that big a
    // withdrawal, and a contribution that was refunded never fully left.
    const incomeTotal = periodTransactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + netIncomeAmount(tx as any), 0);

    const expenseTotal = periodTransactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + netExpenseAmount(tx as any), 0);

    const investmentNet = expenseTotal - incomeTotal;
    const netTotal = investmentNet + reimbursementStats.total;

    const allSavingsTransactions = [
      ...periodTransactions.map(tx => ({
        date: getTxDate(tx, preferences.dateType),
        amount: tx.type === 'expense' ? netExpenseAmount(tx as any) : -netIncomeAmount(tx as any),
      })),
      ...reimbursementTransactions.map(tx => ({
        date: parseLocalDate(tx.transaction_date),
        amount: tx.amount,
      }))
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let cumulative = 0;
    const trendData = allSavingsTransactions.map(tx => {
      cumulative += tx.amount;
      return { date: format(tx.date, 'dd/MM', { locale: dateLocale }), total: cumulative };
    });

    return { totalSaved: netTotal, transactionCount: periodTransactions.length + reimbursementTransactions.length, trendData, incomeTotal, expenseTotal, netTotal };
  }, [periodTransactions, investmentCategoryIds, reimbursementTransactions, reimbursementStats.total]);

  // Calculate monthly average based on weighted recent months (more weight to recent)
  const allTimeStats = useMemo(() => {
    if (investmentCategoryIds.size === 0) return { monthlyAverage: 0 };

    const allInvestmentTransactions = transactions.filter(tx =>
      isInvestment(tx)
    );

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Group by month for weighted average
    const monthlyTotals: number[] = [];
    for (let i = 0; i < 6; i++) {
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - i - 1);
      monthStart.setDate(1);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);

      const monthTotal = allInvestmentTransactions
        .filter(tx => {
          const d = parseLocalDate(tx.transaction_date);
          return d >= monthStart && d <= monthEnd;
        })
        .reduce((sum, tx) => {
          if (tx.type === 'expense') return sum + tx.amount;
          if (tx.type === 'income') return sum - tx.amount;
          return sum;
        }, 0);

      monthlyTotals.push(monthTotal);
    }

    // Weighted average: recent months count more (weights: 3, 2.5, 2, 1.5, 1, 0.5)
    const weights = [3, 2.5, 2, 1.5, 1, 0.5];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedSum = monthlyTotals.reduce((sum, val, i) => sum + val * weights[i], 0);
    const weightedAverage = weightedSum / totalWeight;

    return { monthlyAverage: weightedAverage };
  }, [transactions, investmentCategoryIds, isInvestment]);

  // Presentation-level folds of figures the page already holds — nothing new
  // is computed, the same rows are simply grouped by month for the breakdown
  // panel and summed for the context row.
  const monthlyFlows = useMemo(() => {
    const byMonth = new Map<string, { label: string; deposits: number; withdrawals: number }>();
    for (const tx of periodTransactions) {
      const d = getTxDate(tx, preferences.dateType);
      const key = format(d, 'yyyy-MM');
      const entry = byMonth.get(key) ?? { label: format(d, 'MMM', { locale: dateLocale }), deposits: 0, withdrawals: 0 };
      if (tx.type === 'expense') entry.deposits += netExpenseAmount(tx as EngineTx);
      else if (tx.type === 'income') entry.withdrawals += netIncomeAmount(tx as EngineTx);
      byMonth.set(key, entry);
    }
    const rows = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
    const peak = rows.reduce((m, r) => Math.max(m, r.deposits, r.withdrawals), 0) || 1;
    return { rows, peak };
  }, [periodTransactions, preferences.dateType]);

  const goalTotals = useMemo(() => ({
    current: goals.reduce((s, g) => s + g.current_amount, 0),
    target: goals.reduce((s, g) => s + g.target_amount, 0),
  }), [goals]);

  const reimbursementRemaining = useMemo(
    () => reimbursementInstallments.reduce((s, ip) => s + ip.remaining_amount, 0),
    [reimbursementInstallments],
  );

  const calculateProjection = (goal: SavingsGoal) => {
    const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
    const remainingAmount = goal.target_amount - goal.current_amount;

    // Calculate months to goal based on monthly average
    const monthsToGoal = allTimeStats.monthlyAverage > 0
      ? Math.ceil(remainingAmount / allTimeStats.monthlyAverage)
      : null;

    if (!goal.target_date) {
      return { progress, monthsToGoal, onTrack: null, remainingDays: null, monthlyRequired: 0, dailyRequired: 0 };
    }

    const targetDate = parseLocalDate(goal.target_date);
    const today = new Date();
    const remainingDays = differenceInDays(targetDate, today);

    if (remainingDays <= 0) {
      return { progress, monthsToGoal, onTrack: goal.current_amount >= goal.target_amount, remainingDays: 0, monthlyRequired: 0, dailyRequired: 0 };
    }

    const dailyRequired = remainingAmount / remainingDays;
    const monthlyRequired = dailyRequired * 30;

    return {
      progress,
      remainingDays,
      dailyRequired,
      monthlyRequired,
      monthsToGoal,
      onTrack: allTimeStats.monthlyAverage > 0 ? monthlyRequired <= allTimeStats.monthlyAverage : null
    };
  };

  if (loading || goalsLoading || installmentsLoading) {
    return <LoadingSpinner text="Chargement..." />;
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head — the period switch leads the action row, as in the
            design, rather than sitting in the subtitle as a read-only badge. */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.savings')}</div>
            <h1 className="ft-page-title">{t('savings.pageTitle')}</h1>
            <div className="ft-page-sub">{t('savings.pageSubtitle')}</div>
          </div>
          <div className="flex items-center gap-[9px] flex-wrap">
            <div className="ft-seg" role="group" aria-label={t('reports.period', { defaultValue: 'Period' })}>
              {periods.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={selectedPeriod === p.value ? "active" : ""}
                  aria-pressed={selectedPeriod === p.value}
                  onClick={() => setSelectedPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <span className="ft-chip capitalize">
              <Calendar className="h-3 w-3" />
              {periodLabel}
            </span>
            <Button
              onClick={() => setShowCategoriesModal(true)}
              size="sm"
              variant="outline"
              className="h-8 px-3 gap-1.5"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t('savings.categoriesAction', { defaultValue: 'Categories' })}
              </span>
            </Button>
            <Button
              onClick={() => setShowNewGoalModal(true)}
              size="sm"
              className="h-8 px-3 gap-1.5 font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('savings.newGoal')}</span>
            </Button>
          </div>
        </div>

        {/* Investment statistics for the period — four across, the widest row
            the system has, every tile carrying its context in a foot line. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon acc"><PiggyBank className="h-4 w-4" /></div>
              <span className="ft-kpi-label truncate">{t('savings.netSavings')}</span>
            </div>
            <div className={cn(
              'ft-kpi-value truncate',
              investmentStats.netTotal >= 0 ? 'text-pos' : 'text-neg',
              isPrivacyMode && 'blur-md select-none',
            )}>
              {investmentStats.netTotal >= 0 ? '+' : ''}{formatCurrency(investmentStats.netTotal)}
            </div>
            <div className="ft-kpi-foot truncate">
              {t('savings.kpiNetFoot', {
                defaultValue: '{{n}} movements this period',
                n: investmentStats.transactionCount,
              })}
            </div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon pos"><TrendingDown className="h-4 w-4" /></div>
              <span className="ft-kpi-label truncate">{t('savings.deposits')}</span>
            </div>
            <div className={cn('ft-kpi-value truncate text-pos', isPrivacyMode && 'blur-md select-none')}>
              +{formatCurrency(investmentStats.expenseTotal)}
            </div>
            <div className="ft-kpi-foot truncate">
              {t('savings.kpiMonthlyAvgFoot', {
                defaultValue: 'avg. {{amount}}/month',
                amount: formatCurrency(allTimeStats.monthlyAverage),
              })}
            </div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon"><TrendingUp className="h-4 w-4 text-muted-foreground" /></div>
              <span className="ft-kpi-label truncate">{t('savings.withdrawals')}</span>
            </div>
            <div className={cn('ft-kpi-value truncate text-neg', isPrivacyMode && 'blur-md select-none')}>
              -{formatCurrency(investmentStats.incomeTotal)}
            </div>
            <div className="ft-kpi-foot truncate capitalize">{periodLabel}</div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon pos"><CreditCard className="h-4 w-4" /></div>
              <span className="ft-kpi-label truncate">{t('savings.reimbursements')}</span>
            </div>
            <div className={cn('ft-kpi-value truncate text-pos', isPrivacyMode && 'blur-md select-none')}>
              +{formatCurrency(reimbursementStats.total)}
            </div>
            <div className="ft-kpi-foot truncate">
              {t('savings.kpiReimbFoot', {
                defaultValue: '{{n}} plans · {{amount}} remaining',
                n: reimbursementInstallments.length,
                amount: formatCurrency(reimbursementRemaining),
              })}
            </div>
          </div>
        </div>

        {/* Context row — three categorical figures the KPI strip doesn't
            carry: what the goals hold, the running monthly pace, and what the
            reimbursement plans still owe. */}
        <div className="ft-g3">
          <div className="ft-card p-5">
            <div className="flex items-center gap-2">
              <i className="ft-swatch" style={{ background: 'hsl(var(--chart-2))' }} />
              <span className="ft-kpi-label">{t('savings.goalsTitle')}</span>
            </div>
            <div className={cn(
              'font-mono text-[26px] font-medium tracking-[-0.03em] leading-none mt-2.5 mb-1',
              isPrivacyMode && 'blur-md select-none',
            )}>
              {formatCurrency(goalTotals.current)}
            </div>
            <div className="text-[12px] text-fg-dim">
              {t('savings.ofTarget', {
                defaultValue: 'of {{amount}} targeted',
                amount: formatCurrency(goalTotals.target),
              })}
            </div>
          </div>
          <div className="ft-card p-5">
            <div className="flex items-center gap-2">
              <i className="ft-swatch" style={{ background: 'hsl(var(--chart-1))' }} />
              <span className="ft-kpi-label">
                {t('savings.monthlyAverage', { defaultValue: 'Monthly average' })}
              </span>
            </div>
            <div className={cn(
              'font-mono text-[26px] font-medium tracking-[-0.03em] leading-none mt-2.5 mb-1',
              isPrivacyMode && 'blur-md select-none',
            )}>
              {formatCurrency(allTimeStats.monthlyAverage)}
            </div>
            <div className="text-[12px] text-fg-dim">
              {t('savings.monthlyAverageSub', { defaultValue: 'Weighted over the last 6 months' })}
            </div>
          </div>
          <div className="ft-card p-5">
            <div className="flex items-center gap-2">
              <i className="ft-swatch" style={{ background: 'hsl(var(--chart-4))' }} />
              <span className="ft-kpi-label">{t('savings.reimbursements')}</span>
            </div>
            <div className={cn(
              'font-mono text-[26px] font-medium tracking-[-0.03em] leading-none mt-2.5 mb-1',
              isPrivacyMode && 'blur-md select-none',
            )}>
              {formatCurrency(reimbursementRemaining)}
            </div>
            <div className="text-[12px] text-fg-dim">
              {t('savings.reimbRemainingSub', {
                defaultValue: 'still to come back across {{n}} plans',
                n: reimbursementInstallments.length,
              })}
            </div>
          </div>
        </div>

        {/* Charts never sit alone at full page width in this system: the
            cumulative curve pairs with the month-by-month breakdown. */}
        {investmentStats.trendData.length > 0 && (
          <div className="ft-g2 [&>*]:min-w-0">
            <div className="ft-card">
              <div className="ft-card-head">
                <div>
                  <h3 className="ft-card-title">{t('savings.evolutionTitle')}</h3>
                  <p className="ft-card-sub">
                    {t('savings.evolutionSub', { defaultValue: 'Cumulative savings over the period' })}
                  </p>
                </div>
              </div>
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={investmentStats.trendData}>
                    <CartesianGrid stroke="hsl(var(--grid))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--fg-dim))' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--fg-dim))' }} tickLine={false} axisLine={false} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: 'hsl(var(--fg-onink))', opacity: 0.65 }}
                      itemStyle={{ color: 'hsl(var(--fg-onink))' }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--bg-ink))',
                        color: 'hsl(var(--fg-onink))',
                        border: 'none',
                        borderRadius: '10px',
                        boxShadow: 'var(--sh-2)',
                      }}
                    />
                    {/* Moss, not apricot: the accent is reserved for actions. */}
                    <Area type="monotone" dataKey="total" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2) / 0.26)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="ft-card">
              <div className="ft-card-head">
                <div>
                  <h3 className="ft-card-title">
                    {t('savings.monthlyBreakdown', { defaultValue: 'Monthly breakdown' })}
                  </h3>
                  <p className="ft-card-sub">
                    {t('savings.monthlyBreakdownSub', { defaultValue: 'Deposits and withdrawals over the period' })}
                  </p>
                </div>
                <div className="ft-legend">
                  <span>
                    <i className="ft-swatch" style={{ background: 'hsl(var(--chart-2))' }} />
                    {t('savings.deposits')}
                  </span>
                  <span>
                    <i className="ft-swatch bg-neg" />
                    {t('savings.withdrawals')}
                  </span>
                </div>
              </div>
              {monthlyFlows.rows.length === 0 ? (
                <div className="ft-empty py-8">
                  <p className="text-sm text-muted-foreground">
                    {t('savings.noMovements', { defaultValue: 'No savings movements in this period.' })}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-[11px] mt-1.5">
                  {monthlyFlows.rows.map((m, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-[54px] text-[12px] font-semibold text-fg-dim capitalize flex-shrink-0">
                        {m.label}
                      </span>
                      <div className="flex-1 flex gap-[3px] min-w-0">
                        <div
                          className="h-[9px] rounded-[5px]"
                          style={{ width: `${(m.deposits / monthlyFlows.peak) * 100}%`, background: 'hsl(var(--chart-2))' }}
                        />
                        {m.withdrawals > 0 && (
                          <div
                            className="h-[9px] rounded-[5px] bg-neg"
                            style={{ width: `${(m.withdrawals / monthlyFlows.peak) * 100}%` }}
                          />
                        )}
                      </div>
                      <span className={cn(
                        'font-mono text-[12.5px] font-medium text-right w-[78px] flex-shrink-0',
                        isPrivacyMode && 'blur-md select-none',
                      )}>
                        {m.deposits - m.withdrawals >= 0 ? '+' : ''}
                        {formatCurrency(m.deposits - m.withdrawals)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Goals, history and repayments are peer views of the same money —
            the deck switches between them rather than stacking all three into
            one long scroll. Every section is still here, one tap apart. */}
        <Segmented<SavingsSection>
          label={t('navigation.savings')}
          value={section}
          onChange={setSection}
          options={[
            { value: 'goals', label: t('savings.goalsTitle'), count: goals.length },
            { value: 'history', label: t('transactions.history', { defaultValue: 'History' }) },
            {
              value: 'reimbursements',
              label: t('savings.reimbursementInstallments'),
              count: reimbursementInstallments.length,
            },
          ]}
        />

        {/* Transactions List with Running Balance */}
        {section === 'history' && (
          <SavingsTransactionsList
            transactions={allSavingsTransactions}
            startDate={dateRange.start}
            endDate={dateRange.end}
          />
        )}

        {/* Reimbursement Installments */}
        {section === 'reimbursements' && (
          reimbursementInstallments.length === 0 ? (
            <div className="ft-card p-8 sm:p-12 text-center">
              <div className="h-14 w-14 rounded-2xl bg-bg-subtle mx-auto mb-3 grid place-items-center">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t('savings.reimbursementDesc')}</p>
            </div>
          ) : (
          /* One flush card of scannable rows — the design compresses a plan to
             a single line rather than repeating it across a tall tile. */
          <div className="ft-card-flush">
            <div className="ft-card-head">
              <div>
                <h3 className="ft-card-title">{t('savings.reimbursementInstallments')}</h3>
                <p className="ft-card-sub">{t('savings.reimbursementDesc')}</p>
              </div>
            </div>
            <div>
              {reimbursementInstallments.map((installment) => {
                const progress = installment.total_amount > 0 ? Math.min(100, Math.round(((installment.total_amount - installment.remaining_amount) / installment.total_amount) * 1000) / 10) : 0;
                const doneCount = installment.installment_amount > 0
                  ? Math.round((installment.total_amount - installment.remaining_amount) / installment.installment_amount)
                  : 0;
                const totalCount = installment.installment_amount > 0
                  ? Math.ceil(installment.total_amount / installment.installment_amount)
                  : 0;

                return (
                  <button
                    key={installment.id}
                    type="button"
                    className="ft-list-row md:grid-cols-[34px_1fr_160px_110px_auto]"
                    onClick={() => setSelectedReimbursement(installment)}
                  >
                    <div className="ft-glyph sq">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="ft-row-title truncate">{installment.description}</div>
                      <div className="ft-row-sub truncate">
                        {t('savings.monthly')} {formatCurrency(installment.installment_amount)}
                        {installment.is_active && (
                          <>
                            {' · '}
                            {format(parseLocalDate(installment.next_payment_date), 'dd/MM/yyyy', { locale: dateLocale })}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="hidden md:block ft-progress-track">
                      <div className="ft-progress-fill bg-pos" style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>
                    <span className="hidden md:block font-mono text-[12.5px] text-fg-dim">
                      {t('savings.doneOfTotal', {
                        defaultValue: '{{done}}/{{total}} instalments',
                        done: doneCount,
                        total: totalCount,
                      })}
                    </span>
                    {/* Amount and status share the trailing cell so the row
                        still collapses to glyph / name / value on a phone. */}
                    <div className="flex items-center gap-2.5 justify-end">
                      <span className={cn('ft-row-amt text-pos', isPrivacyMode && 'blur-md select-none')}>
                        {formatCurrency(installment.remaining_amount)}
                      </span>
                      <span className={cn('ft-tag flex-shrink-0', installment.is_active && 'pos')}>
                        {installment.is_active ? t('savings.inProgress') : t('savings.completed')}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          )
        )}

        {/* Savings Goals */}
        {section === 'goals' && (
        <div>
          {goals.length === 0 ? (
            <div className="ft-card p-8 sm:p-12 text-center">
              <div className="h-14 w-14 rounded-2xl bg-bg-subtle mx-auto mb-3 grid place-items-center">
                <Target className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {t('savings.noGoals')}
              </p>
              <Button onClick={() => setShowNewGoalModal(true)} size="sm" className="h-8 text-sm gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {t('savings.createGoal')}
              </Button>
            </div>
          ) : (
            <div data-tour="goal-card" className="ft-g3 sm:grid-cols-2 wide:grid-cols-3">
              {goals.map((goal) => {
                const projection = calculateProjection(goal);
                const progressPct = Math.min(projection.progress, 100);
                const isComplete = goal.current_amount >= goal.target_amount;
                const goalColor = goal.color || 'hsl(var(--primary))';
                const remaining = Math.max(0, goal.target_amount - goal.current_amount);
                const linkedBudget = specialBudgetByGoalId.get(goal.id);
                // The status pill is always present in the design; "behind"
                // reads warn, everything else pos.
                const behind = !isComplete && projection.onTrack === false;

                return (
                  <div
                    key={goal.id}
                    className="ft-card p-5 text-left flex flex-col hover:border-line-strong transition-colors"
                  >
                    {/* Head: tinted colour tile, name, scope, status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-[11px] min-w-0">
                        <div
                          className="h-[38px] w-[38px] rounded-[13px] grid place-items-center flex-shrink-0"
                          style={{
                            background: `color-mix(in oklab, ${goalColor} 16%, transparent)`,
                            color: goalColor,
                          }}
                        >
                          <Target className="h-[18px] w-[18px]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[14.5px] font-[650] truncate">{goal.name}</div>
                          <div className="ft-card-sub truncate">
                            {goal.target_date
                              ? t('savings.dueOn', {
                                  defaultValue: 'due {{date}}',
                                  date: format(parseLocalDate(goal.target_date), 'dd/MM/yyyy', { locale: dateLocale }),
                                })
                              : goal.description || t('savings.noDeadline', { defaultValue: 'no deadline' })}
                          </div>
                        </div>
                      </div>
                      <span className={cn('ft-tag flex-shrink-0', isComplete ? 'pos' : behind ? 'warn' : 'pos')}>
                        {isComplete
                          ? t('savings.goalReached')
                          : behind
                          ? t('savings.behind')
                          : t('savings.onTrack')}
                      </span>
                    </div>

                    {/* Headline figure */}
                    <div className="flex items-baseline gap-2 flex-wrap mt-4">
                      <span className={cn(
                        'font-mono text-[25px] font-medium tracking-[-0.03em] leading-none',
                        isPrivacyMode && 'blur-md select-none',
                      )}>
                        {formatCurrency(goal.current_amount)}
                      </span>
                      <span className={cn('text-fg-mute text-[12.5px]', isPrivacyMode && 'blur-md select-none')}>
                        {t('savings.outOfTarget', {
                          defaultValue: 'of {{amount}}',
                          amount: formatCurrency(goal.target_amount),
                        })}
                      </span>
                    </div>

                    <div className="ft-progress-track tall mt-3.5">
                      <div className="ft-progress-fill" style={{ width: `${progressPct}%`, background: goalColor }} />
                    </div>
                    <div className="flex justify-between gap-2 text-[11.5px] text-fg-dim mt-[7px]">
                      <span>{progressPct.toFixed(0)}%</span>
                      <span className={cn(isPrivacyMode && 'blur-md select-none')}>
                        {t('savings.amountRemaining', {
                          defaultValue: '{{amount}} to go',
                          amount: formatCurrency(remaining),
                        })}
                      </span>
                    </div>

                    {/* Projection table — a sunk panel of label/value rows,
                        the last one coloured by whether the pace holds. */}
                    {!isComplete && (
                      <div className="ft-card ft-card-sunk mt-4 p-0 text-[12px] overflow-hidden">
                        {goal.target_date && projection.monthlyRequired > 0 && (
                          <div className="flex items-center justify-between gap-2 px-[13px] py-[9px]">
                            <span className="text-fg-mute">
                              {t('savings.requiredToHold', { defaultValue: 'Needed to hit the date' })}
                            </span>
                            <b className={cn('font-mono font-medium', isPrivacyMode && 'blur-md select-none')}>
                              {t('savings.perMonth', {
                                defaultValue: '{{amount}} / month',
                                amount: formatCurrency(projection.monthlyRequired),
                              })}
                            </b>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 px-[13px] py-[9px] border-t border-line-soft first:border-t-0">
                          <span className="text-fg-mute">
                            {t('savings.currentPace', { defaultValue: 'Your current pace' })}
                          </span>
                          <b className={cn('font-mono font-medium', isPrivacyMode && 'blur-md select-none')}>
                            {t('savings.perMonth', {
                              defaultValue: '{{amount}} / month',
                              amount: formatCurrency(allTimeStats.monthlyAverage),
                            })}
                          </b>
                        </div>
                        {projection.remainingDays !== null && projection.remainingDays > 0 && (
                          <div className="flex items-center justify-between gap-2 px-[13px] py-[9px] border-t border-line-soft">
                            <span className="text-fg-mute">
                              {t('savings.daysLeftLabel', { defaultValue: 'Days remaining' })}
                            </span>
                            <b className="font-mono font-medium">
                              {t('savings.nDays', { defaultValue: '{{n}} d', n: projection.remainingDays })}
                            </b>
                          </div>
                        )}
                        {projection.monthsToGoal !== null && projection.monthsToGoal > 0 && (
                          <div className="flex items-center justify-between gap-2 px-[13px] py-[9px] border-t border-line-soft">
                            <span className="text-fg-mute">
                              {t('savings.projectionAtPace', { defaultValue: 'Projection at your pace' })}
                            </span>
                            <b className={cn('font-mono font-medium', behind ? 'text-warn' : 'text-pos')}>
                              {t('savings.nMonths', { defaultValue: '~{{n}} months', n: projection.monthsToGoal })}
                            </b>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Linked special budget */}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-fg-dim border-t border-line-soft mt-4 pt-3">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <Wallet className="h-3 w-3 flex-shrink-0" />
                        {linkedBudget
                          ? t('specialBudgets.linkedBudget', {
                              defaultValue: 'Budget: {{n}}',
                              n: linkedBudget.name,
                            })
                          : t('specialBudgets.noLinkedBudget', {
                              defaultValue: 'No linked special budget',
                            })}
                      </span>
                      <button
                        type="button"
                        className="ft-link text-[11px] flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (linkedBudget) setOpenSpecialBudget(linkedBudget);
                          else setNewSpecialBudgetForGoal(goal.id);
                        }}
                      >
                        {linkedBudget
                          ? t('specialBudgets.open', { defaultValue: 'Open' })
                          : t('specialBudgets.add', { defaultValue: 'Add' })}
                      </button>
                    </div>

                    {/* Actions — the design's primary + overflow pair. */}
                    <div className="flex items-center gap-2 mt-3.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 gap-1.5"
                        onClick={() => setSelectedGoal(goal)}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {/* This opens EditSavingsGoalModal — which also holds
                            delete — so "Add funds" undersold it, and once the
                            card stopped being a button it was the only way in. */}
                        {t('savings.manageGoal', { defaultValue: 'Manage goal' })}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      <NewSavingsGoalModal
        isOpen={showNewGoalModal}
        onClose={() => setShowNewGoalModal(false)}
      />

      <SavingsCategoriesModal
        open={showCategoriesModal}
        onOpenChange={setShowCategoriesModal}
        categories={categories}
        onSaved={refetch}
      />

      {selectedGoal && (
        <EditSavingsGoalModal
          isOpen={!!selectedGoal}
          onClose={() => setSelectedGoal(null)}
          goal={selectedGoal}
        />
      )}

      {selectedReimbursement && (
        <ReimbursementDetailModal
          open={!!selectedReimbursement}
          onOpenChange={(open) => !open && setSelectedReimbursement(null)}
          installment={selectedReimbursement}
        />
      )}

      <SpecialBudgetDetailModal
        isOpen={!!openSpecialBudget}
        onClose={() => setOpenSpecialBudget(null)}
        budget={openSpecialBudget}
      />
      <SpecialBudgetModal
        isOpen={!!newSpecialBudgetForGoal}
        onClose={() => setNewSpecialBudgetForGoal(null)}
        defaultSavingsGoalId={newSpecialBudgetForGoal}
      />
    </div>
  );
};

export default Savings;
