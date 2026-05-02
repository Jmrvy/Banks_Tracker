import { useState, useMemo } from 'react';
import { Plus, TrendingUp, Calendar, PiggyBank, TrendingDown, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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
import { parseLocalDate } from '@/lib/dateUtils';
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
      return { total: 0, monthlyAverage: 0, weightedAverage: 0, monthlyData: [], evolutionData: [], trend: 0, count: 0 };
    }

    const investmentTransactions = transactions.filter(
      tx => tx.type === 'expense' && tx.category?.id === investmentCategory.id
    );

    const total = investmentTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    const count = investmentTransactions.length;

    // Calculate monthly breakdown
    const monthlyMap = new Map<string, number>();
    investmentTransactions.forEach(tx => {
      const month = format(parseLocalDate(tx.value_date), 'yyyy-MM');
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + tx.amount);
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
      (a, b) => parseLocalDate(a.value_date).getTime() - parseLocalDate(b.value_date).getTime()
    );

    sortedTransactions.forEach(tx => {
      cumulative += tx.amount;
      evolutionData.push({
        date: format(parseLocalDate(tx.value_date), 'dd/MM/yyyy'),
        amount: tx.amount,
        cumulative
      });
    });

    return { total, monthlyAverage, weightedAverage, monthlyData, evolutionData, trend, count };
  }, [transactions, categories]);

  const calculateProjection = (goal: SavingsGoal) => {
    const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
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
    <div className="space-y-3 sm:space-y-4">
      {/* Investment Statistics Section */}
      <Card className="animate-glass-fade-in">
        <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2">
                <div className="icon-badge icon-badge-sm bg-primary/10">
                  <PiggyBank className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                {t('savings.accumulatedSavings')}
              </h3>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                {t('savings.totalInvestmentsOn', { period: period.label })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card className="glass-hover">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="icon-badge icon-badge-sm bg-primary/10">
                    <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{t('savings.totalSaved')}</span>
                </div>
                <p className="text-sm sm:text-base font-bold text-primary">
                  {formatCurrency(investmentStats.total)}
                </p>
              </CardContent>
            </Card>

            <Card className="glass-hover">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="icon-badge icon-badge-sm bg-muted/50">
                    <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{t('savings.monthlyAverage')}</span>
                </div>
                <p className="text-sm sm:text-base font-bold">
                  {formatCurrency(investmentStats.monthlyAverage)}
                </p>
              </CardContent>
            </Card>

            <Card className="glass-hover">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="icon-badge icon-badge-sm bg-muted/50">
                    <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{t('savings.transactions')}</span>
                </div>
                <p className="text-sm sm:text-base font-bold">
                  {investmentStats.count}
                </p>
              </CardContent>
            </Card>

            <Card className="glass-hover">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn("icon-badge icon-badge-sm", investmentStats.trend >= 0 ? "bg-success/10" : "bg-destructive/10")}>
                    {investmentStats.trend >= 0 ? (
                      <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-success" />
                    ) : (
                      <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-destructive" />
                    )}
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{t('savings.trend')}</span>
                </div>
                <p className={cn("text-sm sm:text-base font-bold", investmentStats.trend >= 0 ? 'text-success' : 'text-destructive')}>
                  {investmentStats.trend >= 0 ? '+' : ''}{investmentStats.trend.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Evolution Chart */}
          {investmentStats.evolutionData.length > 0 && (
            <div className="pt-3 border-t border-white/[0.06]">
              <h4 className="text-xs sm:text-sm font-medium mb-3">{t('savings.cumulativeEvolution')}</h4>
              <div className="h-[200px] sm:h-[280px]">
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
            <div className="pt-3 border-t border-white/[0.06]">
              <h4 className="text-xs sm:text-sm font-medium mb-3">{t('savings.monthlyBreakdown')}</h4>
              <div className="space-y-2">
                {investmentStats.monthlyData.slice(-6).map(({ month, amount }) => (
                  <div key={month} className="flex items-center gap-2 sm:gap-3 p-1.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                    <span className="text-[10px] sm:text-xs text-muted-foreground min-w-[60px] sm:min-w-[80px]">
                      {format(new Date(month + '-01'), 'MMM yyyy', { locale: fr })}
                    </span>
                    <div className="flex-1">
                      <Progress
                        value={(amount / Math.max(...investmentStats.monthlyData.map(d => d.amount))) * 100}
                        className="h-1.5"
                      />
                    </div>
                    <span className="text-[10px] sm:text-xs font-medium min-w-[70px] sm:min-w-[100px] text-right">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Savings Goals Section */}
      <div className="flex justify-between items-center animate-glass-fade-in">
        <div>
          <h3 className="text-sm sm:text-base font-semibold">{t('savings.goalsTitle')}</h3>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            {t('savings.trackGoals')}
          </p>
        </div>
        <Button size="sm" onClick={() => setIsNewModalOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {t('savings.newGoal')}
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card className="animate-glass-slide-up">
          <CardContent className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">
              {t('savings.noGoals')}
            </p>
            <Button size="sm" onClick={() => setIsNewModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t('savings.createFirstGoal')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {goals.map((goal) => {
            const projection = calculateProjection(goal);
            const isComplete = goal.current_amount >= goal.target_amount;

            return (
              <Card
                key={goal.id}
                className="glass-hover animate-glass-scale-in cursor-pointer"
                onClick={() => setEditingGoal(goal)}
              >
                <CardContent className="p-3 sm:p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: goal.color }}
                        />
                        <h4 className="text-xs sm:text-sm font-semibold">{goal.name}</h4>
                        {isComplete && (
                          <Badge variant="default" className="text-[9px] sm:text-[10px] bg-success text-white px-1.5 py-0 h-4">
                            {t('savings.goalReached')}
                          </Badge>
                        )}
                      </div>
                      {goal.description && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                          {goal.description}
                        </p>
                      )}
                      {goal.category && (
                        <Badge variant="secondary" className="mt-1.5 text-[9px] sm:text-[10px]">
                          {goal.category}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] sm:text-xs">
                      <span className="text-muted-foreground">{t('savings.progress')}</span>
                      <span className="font-medium">{Math.min(projection.progress, 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={Math.min(projection.progress, 100)} className="h-1.5" />
                    <div className="flex justify-between text-[10px] sm:text-xs">
                      <span className="font-medium">
                        {formatCurrency(goal.current_amount)}
                      </span>
                      <span className="text-muted-foreground">
                        {t('savings.of', { amount: formatCurrency(goal.target_amount) })}
                      </span>
                    </div>
                  </div>

                  {!isComplete && (
                    <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                      {projection.monthsToGoal !== null && projection.monthsToGoal > 0 && (
                        <div className="flex justify-between items-center text-[10px] sm:text-xs">
                          <span className="text-muted-foreground">
                            {t('savings.monthsToGoal', { count: projection.monthsToGoal })}
                          </span>
                          {projection.onTrack !== null && (
                            <Badge variant="outline" className={cn("text-[9px] sm:text-[10px] px-1.5 py-0 h-4", projection.onTrack ? 'border-success text-success' : 'border-destructive text-destructive')}>
                              {projection.onTrack ? t('savings.onTrack') : t('savings.behind')}
                            </Badge>
                          )}
                        </div>
                      )}
                      {goal.target_date && (
                        <>
                          <div className="text-[10px] sm:text-xs text-muted-foreground">
                            {t('savings.deadlineOn', { date: format(new Date(goal.target_date), 'dd MMMM yyyy', { locale: fr }) })}
                          </div>
                          {projection.daysRemaining > 0 && (
                            <div className="text-[10px] sm:text-xs space-y-0.5">
                              <div className="text-muted-foreground">
                                {t('savings.daysRemaining', { count: projection.daysRemaining })}
                              </div>
                              <div className="font-medium text-primary">
                                {t('savings.monthlyRequiredLabel', { amount: formatCurrency(projection.monthlyRequired) })}
                              </div>
                              <div className="text-[9px] sm:text-[10px] text-muted-foreground">
                                {t('savings.dailyRequired', { amount: formatCurrency(projection.dailyRequired) })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
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
