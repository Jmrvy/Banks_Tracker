import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PiggyBank, Plus, TrendingUp, TrendingDown, Target, Calendar, CreditCard, SlidersHorizontal } from "lucide-react";
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
import { NewSavingsGoalModal } from "@/components/NewSavingsGoalModal";
import { EditSavingsGoalModal } from "@/components/EditSavingsGoalModal";
import { ReimbursementDetailModal } from "@/components/ReimbursementDetailModal";
import { SavingsTransactionsList } from "@/components/SavingsTransactionsList";
import { differenceInDays, format, isWithinInterval } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { fr } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const Savings = () => {
  const { transactions, categories, loading, refetch } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
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
  const { dateRange, periodLabel } = usePeriod();
  const { t } = useTranslation();

  const [showNewGoalModal, setShowNewGoalModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
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

  // Filter transactions by selected period
  const periodTransactions = useMemo(() => {
    if (investmentCategoryIds.size === 0) return [];
    return transactions.filter(tx => {
      const transactionDate = parseLocalDate(tx.transaction_date);
      return isInvestment(tx) &&
             isWithinInterval(transactionDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [transactions, investmentCategoryIds, isInvestment, dateRange]);

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

    const incomeTotal = periodTransactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const expenseTotal = periodTransactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const investmentNet = expenseTotal - incomeTotal;
    const netTotal = investmentNet + reimbursementStats.total;

    const allSavingsTransactions = [
      ...periodTransactions.map(tx => ({
        date: parseLocalDate(tx.transaction_date),
        amount: tx.type === 'expense' ? tx.amount : -tx.amount,
      })),
      ...reimbursementTransactions.map(tx => ({
        date: parseLocalDate(tx.transaction_date),
        amount: tx.amount,
      }))
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let cumulative = 0;
    const trendData = allSavingsTransactions.map(tx => {
      cumulative += tx.amount;
      return { date: format(tx.date, 'dd/MM', { locale: fr }), total: cumulative };
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
        {/* Page head */}
        <div className="ft-page-head">
          <div>
            <div className="ft-eyebrow">{t('navigation.savings')}</div>
            <h1 className="ft-page-title">{t('savings.pageTitle')}</h1>
            <div className="ft-page-sub flex items-center gap-2">
              <span>{t('savings.pageSubtitle')}</span>
              <Badge variant="secondary" className="flex items-center gap-1 text-[11px] h-5">
                <Calendar className="h-3 w-3" />
                <span className="capitalize">{periodLabel}</span>
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Investment Statistics for Period */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon acc"><PiggyBank className="h-4 w-4" /></div>
              <span className="ft-kpi-label truncate">{t('savings.netSavings')}</span>
            </div>
            <div className={`ft-kpi-value truncate ${investmentStats.netTotal >= 0 ? 'text-pos' : 'text-destructive'}`}>
              {investmentStats.netTotal >= 0 ? '+' : ''}{formatCurrency(investmentStats.netTotal)}
            </div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon pos"><TrendingDown className="h-4 w-4" /></div>
              <span className="ft-kpi-label truncate">{t('savings.deposits')}</span>
            </div>
            <div className="ft-kpi-value truncate text-pos">+{formatCurrency(investmentStats.expenseTotal)}</div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon neg"><TrendingUp className="h-4 w-4" /></div>
              <span className="ft-kpi-label truncate">{t('savings.withdrawals')}</span>
            </div>
            <div className="ft-kpi-value truncate text-destructive">-{formatCurrency(investmentStats.incomeTotal)}</div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon pos"><CreditCard className="h-4 w-4" /></div>
              <span className="ft-kpi-label truncate">{t('savings.reimbursements')}</span>
            </div>
            <div className="ft-kpi-value truncate text-pos">+{formatCurrency(reimbursementStats.total)}</div>
            <div className="text-xs text-muted-foreground">{reimbursementStats.count} tx</div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon acc"><Target className="h-4 w-4" /></div>
              <span className="ft-kpi-label truncate">{t('savings.transactions')}</span>
            </div>
            <div className="ft-kpi-value">{investmentStats.transactionCount}</div>
          </div>
        </div>

        {/* Evolution Chart */}
        {investmentStats.trendData.length > 0 && (
          <div className="ft-card p-5 sm:p-6">
            <h3 className="ft-card-title text-base sm:text-lg mb-3">
              {t('savings.evolutionTitle')}
            </h3>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={investmentStats.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" opacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--line))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Transactions List with Running Balance */}
        <SavingsTransactionsList
          transactions={allSavingsTransactions}
          startDate={dateRange.start}
          endDate={dateRange.end}
        />

        {/* Reimbursement Installments */}
        {reimbursementInstallments.length > 0 && (
          <div>
            <h2 className="ft-eyebrow flex items-center gap-2 mb-2">
              <CreditCard className="h-3.5 w-3.5 text-pos" />
              {t('savings.reimbursementInstallments')} ({reimbursementInstallments.length})
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              {t('savings.reimbursementDesc')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {reimbursementInstallments.map((installment) => {
                const progress = installment.total_amount > 0 ? Math.min(100, Math.round(((installment.total_amount - installment.remaining_amount) / installment.total_amount) * 1000) / 10) : 0;
                const amountReceived = installment.total_amount - installment.remaining_amount;

                return (
                  <button
                    key={installment.id}
                    type="button"
                    className="ft-card p-4 sm:p-5 text-left flex flex-col gap-2.5 hover:border-line-strong transition-colors"
                    onClick={() => setSelectedReimbursement(installment)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">{installment.description}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium mt-1 ${installment.is_active ? 'bg-pos/12 text-pos' : 'bg-bg-subtle text-muted-foreground'}`}>
                          {installment.is_active ? t('savings.inProgress') : t('savings.completed')}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{Math.min(progress, 100).toFixed(0)}%</span>
                    </div>
                    <div className="ft-progress-track">
                      <div className="ft-progress-fill bg-pos" style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-mono font-medium text-pos">+{formatCurrency(amountReceived)}</span>
                      <span className="font-mono text-muted-foreground">/ {formatCurrency(installment.total_amount)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-fg-dim">
                      <span>{t('savings.monthly')}: <span className="font-mono">{formatCurrency(installment.installment_amount)}</span></span>
                      <span>{t('savings.remaining')}: <span className="font-mono">{formatCurrency(installment.remaining_amount)}</span></span>
                    </div>
                    {installment.is_active && (
                      <div className="flex justify-between text-[11px] text-fg-dim pt-2 border-t border-line">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(parseLocalDate(installment.next_payment_date), 'dd/MM/yyyy', { locale: fr })}
                        </span>
                        {installment.installment_amount > 0 && (
                          <span>~{Math.ceil(installment.remaining_amount / installment.installment_amount)} {t('savings.installments', { defaultValue: 'left' })}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Savings Goals */}
        <div>
          <h2 className="ft-eyebrow flex items-center gap-2 mb-3">
            <Target className="h-3.5 w-3.5 text-primary" />
            {t('savings.goalsTitle')} ({goals.length})
          </h2>

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
            <div data-tour="goal-card" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {goals.map((goal) => {
                const projection = calculateProjection(goal);
                const progressPct = Math.min(projection.progress, 100);
                const isComplete = goal.current_amount >= goal.target_amount;
                const goalColor = goal.color || 'hsl(var(--primary))';

                return (
                  <button
                    key={goal.id}
                    type="button"
                    className="ft-card p-4 sm:p-5 text-left flex flex-col gap-3 hover:border-line-strong transition-colors"
                    onClick={() => setSelectedGoal(goal)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-base truncate">{goal.name}</h3>
                          {isComplete && (
                            <span className="ft-tag pos">{t('savings.goalReached')}</span>
                          )}
                        </div>
                        {goal.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {goal.description}
                          </p>
                        )}
                      </div>
                      <div
                        className="h-2.5 w-2.5 rounded-sm flex-shrink-0 mt-1"
                        style={{ backgroundColor: goalColor }}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-muted-foreground">{t('savings.progress')}</span>
                        <span className="font-mono font-medium">{progressPct.toFixed(0)}%</span>
                      </div>
                      <div className="ft-progress-track">
                        <div className="ft-progress-fill" style={{ width: `${progressPct}%`, background: goalColor }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-mono font-medium">{formatCurrency(goal.current_amount)}</span>
                        <span className="font-mono text-muted-foreground">/ {formatCurrency(goal.target_amount)}</span>
                      </div>
                    </div>

                    {(() => {
                      const linkedBudget = specialBudgetByGoalId.get(goal.id);
                      return (
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground border-t border-line pt-2 -mb-1">
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
                          <span
                            role="button"
                            tabIndex={0}
                            className="ft-link text-[11px] flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (linkedBudget) setOpenSpecialBudget(linkedBudget);
                              else setNewSpecialBudgetForGoal(goal.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (linkedBudget) setOpenSpecialBudget(linkedBudget);
                                else setNewSpecialBudgetForGoal(goal.id);
                              }
                            }}
                          >
                            {linkedBudget
                              ? t('specialBudgets.open', { defaultValue: 'Open' })
                              : t('specialBudgets.add', { defaultValue: 'Add' })}
                          </span>
                        </div>
                      );
                    })()}

                    {!isComplete && (
                      <div className="flex flex-col gap-1 pt-3 border-t border-line">
                        {projection.monthsToGoal !== null && projection.monthsToGoal > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              {t('savings.monthsToGoal', { count: projection.monthsToGoal })}
                            </span>
                            {projection.onTrack !== null && (
                              <span className={`ft-tag ${projection.onTrack ? 'pos' : 'neg'}`}>
                                {projection.onTrack ? t('savings.onTrack') : t('savings.behind')}
                              </span>
                            )}
                          </div>
                        )}
                        {goal.target_date && projection.remainingDays !== null && projection.remainingDays > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              {t('savings.daysRemaining', { count: projection.remainingDays })}
                            </span>
                            <span className={`font-mono ${projection.onTrack ? 'text-pos' : 'text-destructive'}`}>
                              {t('savings.monthlyRequired', { amount: formatCurrency(projection.monthlyRequired) })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
