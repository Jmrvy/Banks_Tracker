import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PiggyBank, Plus, TrendingUp, TrendingDown, Target, Calendar, CreditCard } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSavingsGoals, SavingsGoal } from "@/hooks/useSavingsGoals";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { usePeriod } from "@/contexts/PeriodContext";
import { NewSavingsGoalModal } from "@/components/NewSavingsGoalModal";
import { EditSavingsGoalModal } from "@/components/EditSavingsGoalModal";
import { SavingsTransactionsList } from "@/components/SavingsTransactionsList";
import { differenceInDays, format, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { useTranslation } from "react-i18next";
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
  const { transactions, categories, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { goals, isLoading: goalsLoading } = useSavingsGoals();
  const { installmentPayments, loading: installmentsLoading } = useInstallmentPayments();
  const { dateRange, periodLabel } = usePeriod();
  const { t } = useTranslation();

  const [showNewGoalModal, setShowNewGoalModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);

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
      const transactionDate = new Date(tx.transaction_date);
      return isWithinInterval(transactionDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [transactions, reimbursementInstallmentIds, dateRange]);

  const reimbursementStats = useMemo(() => {
    const total = reimbursementTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    return { total, count: reimbursementTransactions.length };
  }, [reimbursementTransactions]);

  // Find investment category
  const investmentCategory = useMemo(() => {
    return categories.find(cat =>
      cat.name.toLowerCase().includes('investissement') ||
      cat.name.toLowerCase().includes('investment')
    );
  }, [categories]);

  // Filter transactions by selected period
  const periodTransactions = useMemo(() => {
    if (!investmentCategory) return [];
    return transactions.filter(tx => {
      const transactionDate = new Date(tx.transaction_date);
      return tx.category?.id === investmentCategory.id &&
             isWithinInterval(transactionDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [transactions, investmentCategory, dateRange]);

  // Calculate investment statistics for the selected period
  const investmentStats = useMemo(() => {
    const hasInvestments = investmentCategory && periodTransactions.length > 0;
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
        date: new Date(tx.transaction_date),
        amount: tx.type === 'expense' ? tx.amount : -tx.amount,
      })),
      ...reimbursementTransactions.map(tx => ({
        date: new Date(tx.transaction_date),
        amount: tx.amount,
      }))
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let cumulative = 0;
    const trendData = allSavingsTransactions.map(tx => {
      cumulative += tx.amount;
      return { date: format(tx.date, 'dd/MM', { locale: fr }), total: cumulative };
    });

    return { totalSaved: netTotal, transactionCount: periodTransactions.length + reimbursementTransactions.length, trendData, incomeTotal, expenseTotal, netTotal };
  }, [periodTransactions, investmentCategory, reimbursementTransactions, reimbursementStats.total]);

  // Calculate monthly average based on weighted recent months (more weight to recent)
  const allTimeStats = useMemo(() => {
    if (!investmentCategory) return { monthlyAverage: 0 };

    const allInvestmentTransactions = transactions.filter(tx =>
      tx.category?.id === investmentCategory.id
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
          const d = new Date(tx.transaction_date);
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
  }, [transactions, investmentCategory]);

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

    const targetDate = new Date(goal.target_date);
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
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p>{t('common.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
                <PiggyBank className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
                <span className="truncate">{t('savings.pageTitle')}</span>
              </h1>
              <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                <Calendar className="h-3 w-3" />
                <span className="capitalize">{periodLabel}</span>
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 hidden sm:block">
              {t('savings.pageSubtitle')}
            </p>
          </div>
          <Button
            onClick={() => setShowNewGoalModal(true)}
            size="sm"
            className="h-8 sm:h-9 px-2 sm:px-4 flex-shrink-0"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('savings.newGoal')}</span>
          </Button>
        </div>

        {/* Investment Statistics for Period */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <PiggyBank className="h-4 w-4 text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">{t('savings.netSavings')}</span>
              </div>
              <p className={`text-lg sm:text-2xl font-bold ${investmentStats.netTotal >= 0 ? 'text-success' : 'text-destructive'}`}>
                {investmentStats.netTotal >= 0 ? '+' : ''}{formatCurrency(investmentStats.netTotal)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-4 w-4 text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">{t('savings.deposits')}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-success">
                +{formatCurrency(investmentStats.expenseTotal)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-destructive" />
                <span className="text-xs sm:text-sm text-muted-foreground">{t('savings.withdrawals')}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-destructive">
                -{formatCurrency(investmentStats.incomeTotal)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-success">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-success" />
                <span className="text-xs sm:text-sm text-muted-foreground">{t('savings.reimbursements')}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-success">
                +{formatCurrency(reimbursementStats.total)}
              </p>
              <p className="text-xs text-muted-foreground">
                {reimbursementStats.count} transaction{reimbursementStats.count > 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">{t('savings.transactions')}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold">
                {investmentStats.transactionCount}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Evolution Chart */}
        {investmentStats.trendData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base sm:text-lg">
                {t('savings.evolutionTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={investmentStats.trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transactions List with Running Balance */}
        <SavingsTransactionsList
          transactions={[...periodTransactions, ...reimbursementTransactions]}
          startDate={dateRange.start}
          endDate={dateRange.end}
        />

        {/* Reimbursement Installments */}
        {reimbursementInstallments.length > 0 && (
          <div>
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
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
                  <Card key={installment.id} className="border-l-4 border-l-success">
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base sm:text-lg truncate">{installment.description}</h3>
                          <Badge variant={installment.is_active ? "default" : "secondary"} className="text-xs mt-1">
                            {installment.is_active ? t('savings.inProgress') : t('savings.completed')}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-muted-foreground">{t('savings.progress')}</span>
                          <span className="font-medium">{Math.min(progress, 100).toFixed(0)}%</span>
                        </div>
                        <Progress value={Math.min(progress, 100)} className="h-2" />
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="font-medium text-success">+{formatCurrency(amountReceived)}</span>
                          <span className="text-muted-foreground">/ {formatCurrency(installment.total_amount)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground pt-1">
                          <span>{t('savings.monthly')}: {formatCurrency(installment.installment_amount)}</span>
                          <span>{t('savings.remaining')}: {formatCurrency(installment.remaining_amount)}</span>
                        </div>
                        {installment.is_active && (
                          <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/50 mt-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Prochain: {format(new Date(installment.next_payment_date), 'dd/MM/yyyy', { locale: fr })}
                            </span>
                            {installment.installment_amount > 0 && (
                              <span>
                                ~{Math.ceil(installment.remaining_amount / installment.installment_amount)} échéances
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Savings Goals */}
        <div>
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
            {t('savings.goalsTitle')} ({goals.length})
          </h2>

          {goals.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-4">
                  {t('savings.noGoals')}
                </p>
                <Button onClick={() => setShowNewGoalModal(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('savings.createGoal')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {goals.map((goal) => {
                const projection = calculateProjection(goal);
                const progressPct = Math.min(projection.progress, 100);
                const isComplete = goal.current_amount >= goal.target_amount;

                return (
                  <Card
                    key={goal.id}
                    className="glass-hover transition-colors cursor-pointer"
                    onClick={() => setSelectedGoal(goal)}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-base sm:text-lg truncate">{goal.name}</h3>
                            {isComplete && (
                              <Badge variant="default" className="text-[10px] bg-success text-white flex-shrink-0">
                                {t('savings.goalReached')}
                              </Badge>
                            )}
                          </div>
                          {goal.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {goal.description}
                            </p>
                          )}
                        </div>
                        <div
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: goal.color || 'hsl(var(--primary))' }}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-muted-foreground">{t('savings.progress')}</span>
                          <span className="font-medium">{progressPct.toFixed(0)}%</span>
                        </div>
                        <Progress value={progressPct} className="h-2" />
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="font-medium">{formatCurrency(goal.current_amount)}</span>
                          <span className="text-muted-foreground">/ {formatCurrency(goal.target_amount)}</span>
                        </div>
                      </div>

                      {/* Projection footer */}
                      {!isComplete && (
                        <div className="mt-3 pt-3 border-t border-border space-y-1">
                          {/* Months-to-goal estimate (always show if we have average) */}
                          {projection.monthsToGoal !== null && projection.monthsToGoal > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">
                                {t('savings.monthsToGoal', { count: projection.monthsToGoal })}
                              </span>
                              {projection.onTrack !== null && (
                                <Badge variant="outline" className={`text-[10px] ${projection.onTrack ? 'border-success text-success' : 'border-destructive text-destructive'}`}>
                                  {projection.onTrack ? t('savings.onTrack') : t('savings.behind')}
                                </Badge>
                              )}
                            </div>
                          )}
                          {/* Days remaining + monthly required (only if target_date set) */}
                          {goal.target_date && projection.remainingDays !== null && projection.remainingDays > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">
                                {t('savings.daysRemaining', { count: projection.remainingDays })}
                              </span>
                              <span className={projection.onTrack ? 'text-success' : 'text-destructive'}>
                                {t('savings.monthlyRequired', { amount: formatCurrency(projection.monthlyRequired) })}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
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

      {selectedGoal && (
        <EditSavingsGoalModal
          isOpen={!!selectedGoal}
          onClose={() => setSelectedGoal(null)}
          goal={selectedGoal}
        />
      )}
    </div>
  );
};

export default Savings;
