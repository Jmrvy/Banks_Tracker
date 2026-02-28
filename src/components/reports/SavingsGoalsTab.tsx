import { useState, useMemo } from 'react';
import { Plus, TrendingUp, Calendar, PiggyBank, TrendingDown, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSavingsGoals } from '@/hooks/useSavingsGoals';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useFinancialData, type Transaction } from '@/hooks/useFinancialData';
import { NewSavingsGoalModal } from '@/components/NewSavingsGoalModal';
import { EditSavingsGoalModal } from '@/components/EditSavingsGoalModal';
import type { SavingsGoal } from '@/hooks/useSavingsGoals';
import type { ReportsPeriod } from '@/hooks/useReportsData';
import { differenceInDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useTranslation } from 'react-i18next';

interface SavingsGoalsTabProps {
  transactions: Transaction[];
  period: ReportsPeriod;
}

export const SavingsGoalsTab = ({ transactions, period }: SavingsGoalsTabProps) => {
  const { goals, isLoading } = useSavingsGoals();
  const { formatCurrency } = useUserPreferences();
  const { categories } = useFinancialData();
  const { t } = useTranslation();
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);

  // Calculate investment statistics
  const investmentStats = useMemo(() => {
    const investmentCategory = categories.find(cat =>
      cat.name.toLowerCase() === 'investissements' ||
      cat.name.toLowerCase() === 'investissement' ||
      cat.name.toLowerCase() === 'épargne'
    );

    if (!investmentCategory) {
      return { total: 0, monthlyAverage: 0, monthlyData: [], evolutionData: [], trend: 0, count: 0 };
    }

    const investmentTransactions = transactions.filter(
      t => t.type === 'expense' && t.category?.id === investmentCategory.id
    );

    const total = investmentTransactions.reduce((sum, t) => sum + t.amount, 0);
    const count = investmentTransactions.length;

    // Calculate monthly breakdown
    const monthlyMap = new Map<string, number>();
    investmentTransactions.forEach(t => {
      const month = format(new Date(t.value_date), 'yyyy-MM');
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + t.amount);
    });

    const monthlyData = Array.from(monthlyMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const monthlyAverage = monthlyData.length > 0 ? total / monthlyData.length : 0;

    // Weighted monthly average (recent months count more)
    const recentMonths = monthlyData.slice(-6);
    const weights = [0.5, 1, 1.5, 2, 2.5, 3];
    let weightedSum = 0;
    let weightTotal = 0;
    recentMonths.forEach((d, i) => {
      const w = weights[weights.length - recentMonths.length + i];
      weightedSum += d.amount * w;
      weightTotal += w;
    });
    const weightedAverage = weightTotal > 0 ? weightedSum / weightTotal : monthlyAverage;

    // Calculate trend (comparing first half vs second half)
    const halfPoint = Math.floor(monthlyData.length / 2);
    const firstHalfAvg = monthlyData.slice(0, halfPoint).reduce((sum, d) => sum + d.amount, 0) / halfPoint || 0;
    const secondHalfAvg = monthlyData.slice(halfPoint).reduce((sum, d) => sum + d.amount, 0) / (monthlyData.length - halfPoint) || 0;
    const trend = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

    // Calculate evolution data (cumulative)
    const evolutionData: Array<{ date: string; amount: number; cumulative: number }> = [];
    let cumulative = 0;

    const sortedTransactions = [...investmentTransactions].sort(
      (a, b) => new Date(a.value_date).getTime() - new Date(b.value_date).getTime()
    );

    sortedTransactions.forEach(t => {
      cumulative += t.amount;
      evolutionData.push({
        date: format(new Date(t.value_date), 'dd/MM/yyyy'),
        amount: t.amount,
        cumulative
      });
    });

    return { total, monthlyAverage, weightedAverage, monthlyData, evolutionData, trend, count };
  }, [transactions, categories]);

  const calculateProjection = (goal: SavingsGoal) => {
    const progress = (goal.current_amount / goal.target_amount) * 100;
    const remainingAmount = goal.target_amount - goal.current_amount;

    const monthsToGoal = (investmentStats.weightedAverage || investmentStats.monthlyAverage) > 0
      ? Math.ceil(remainingAmount / (investmentStats.weightedAverage || investmentStats.monthlyAverage))
      : null;

    if (!goal.target_date) {
      return { progress, monthsToGoal, onTrack: null, daysRemaining: 0, monthlyRequired: 0, dailyRequired: 0 };
    }

    const today = new Date();
    const targetDate = new Date(goal.target_date);
    const daysRemaining = differenceInDays(targetDate, today);

    if (daysRemaining <= 0) {
      return { progress, monthsToGoal, onTrack: goal.current_amount >= goal.target_amount, daysRemaining: 0, monthlyRequired: 0, dailyRequired: 0 };
    }

    const dailyRequired = remainingAmount / daysRemaining;
    const monthlyRequired = dailyRequired * 30;
    const avg = investmentStats.weightedAverage || investmentStats.monthlyAverage;

    return {
      progress,
      daysRemaining,
      monthlyRequired,
      dailyRequired,
      monthsToGoal,
      onTrack: avg > 0 ? monthlyRequired <= avg : null
    };
  };

  if (isLoading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Investment Statistics Section */}
      <Card className="p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <PiggyBank className="w-5 h-5 text-primary" />
                {t('savings.accumulatedSavings')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('savings.totalInvestmentsOn', { period: period.label })}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="w-4 h-4" />
                  {t('savings.totalSaved')}
                </div>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(investmentStats.total)}
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-accent/5 border-accent/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  {t('savings.monthlyAverage')}
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {formatCurrency(investmentStats.monthlyAverage)}
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-secondary/5 border-secondary/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="w-4 h-4" />
                  {t('savings.transactions')}
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {investmentStats.count}
                </div>
              </div>
            </Card>

            <Card className={`p-4 ${investmentStats.trend >= 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {investmentStats.trend >= 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {t('savings.trend')}
                </div>
                <div className={`text-2xl font-bold ${investmentStats.trend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {investmentStats.trend >= 0 ? '+' : ''}{investmentStats.trend.toFixed(1)}%
                </div>
              </div>
            </Card>
          </div>

          {/* Evolution Chart */}
          {investmentStats.evolutionData.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-4">{t('savings.cumulativeEvolution')}</h4>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={investmentStats.evolutionData}>
                    <defs>
                      <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [formatCurrency(value), t('savings.cumulativeSavings')]}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#colorCumulative)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Monthly Breakdown */}
          {investmentStats.monthlyData.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-3">{t('savings.monthlyBreakdown')}</h4>
              <div className="space-y-2">
                {investmentStats.monthlyData.slice(-6).map(({ month, amount }) => (
                  <div key={month} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground min-w-[80px]">
                      {format(new Date(month + '-01'), 'MMM yyyy', { locale: fr })}
                    </span>
                    <div className="flex-1">
                      <Progress
                        value={(amount / Math.max(...investmentStats.monthlyData.map(d => d.amount))) * 100}
                        className="h-2"
                      />
                    </div>
                    <span className="text-sm font-medium min-w-[100px] text-right">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Savings Goals Section */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{t('savings.goalsTitle')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('savings.trackGoals')}
          </p>
        </div>
        <Button onClick={() => setIsNewModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('savings.newGoal')}
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">
            {t('savings.noGoals')}
          </p>
          <Button onClick={() => setIsNewModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t('savings.createFirstGoal')}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal) => {
            const projection = calculateProjection(goal);
            const isComplete = goal.current_amount >= goal.target_amount;

            return (
              <Card
                key={goal.id}
                className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setEditingGoal(goal)}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: goal.color }}
                        />
                        <h4 className="font-semibold">{goal.name}</h4>
                        {isComplete && (
                          <Badge variant="default" className="text-[10px] bg-success text-white">
                            {t('savings.goalReached')}
                          </Badge>
                        )}
                      </div>
                      {goal.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {goal.description}
                        </p>
                      )}
                      {goal.category && (
                        <span className="inline-block mt-2 text-xs bg-secondary px-2 py-1 rounded">
                          {goal.category}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('savings.progress')}</span>
                      <span className="font-medium">{Math.min(projection.progress, 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={Math.min(projection.progress, 100)} />
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        {formatCurrency(goal.current_amount)}
                      </span>
                      <span className="text-muted-foreground">
                        {t('savings.of', { amount: formatCurrency(goal.target_amount) })}
                      </span>
                    </div>
                  </div>

                  {!isComplete && (
                    <div className="pt-3 border-t space-y-2">
                      {/* Months to goal estimate */}
                      {projection.monthsToGoal !== null && projection.monthsToGoal > 0 && (
                        <div className="flex justify-between items-center text-sm">
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
                      {/* Target date details */}
                      {goal.target_date && (
                        <>
                          <div className="text-sm text-muted-foreground">
                            {t('savings.deadlineOn', { date: format(new Date(goal.target_date), 'dd MMMM yyyy', { locale: fr }) })}
                          </div>
                          {projection.daysRemaining > 0 && (
                            <div className="text-sm space-y-1">
                              <div className="text-muted-foreground">
                                {t('savings.daysRemaining', { count: projection.daysRemaining })}
                              </div>
                              <div className="font-medium text-primary">
                                {t('savings.monthlyRequiredLabel', { amount: formatCurrency(projection.monthlyRequired) })}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t('savings.dailyRequired', { amount: formatCurrency(projection.dailyRequired) })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewSavingsGoalModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
      />

      {editingGoal && (
        <EditSavingsGoalModal
          goal={editingGoal}
          isOpen={!!editingGoal}
          onClose={() => setEditingGoal(null)}
        />
      )}
    </div>
  );
};
