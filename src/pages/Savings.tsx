import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PiggyBank, Plus, TrendingUp, TrendingDown, Target } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSavingsGoals, SavingsGoal } from "@/hooks/useSavingsGoals";
import { usePeriod } from "@/contexts/PeriodContext";
import { NewSavingsGoalModal } from "@/components/NewSavingsGoalModal";
import { EditSavingsGoalModal } from "@/components/EditSavingsGoalModal";
import { differenceInDays, format } from "date-fns";
import { fr } from "date-fns/locale";
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
  const { dateRange, periodLabel } = usePeriod();
  
  const [showNewGoalModal, setShowNewGoalModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);

  // Find investment category
  const investmentCategory = useMemo(() => {
    return categories.find(cat => 
      cat.name.toLowerCase().includes('investissement') || 
      cat.name.toLowerCase().includes('investment')
    );
  }, [categories]);

  // Calculate investment statistics based on all investment transactions
  const investmentStats = useMemo(() => {
    if (!investmentCategory) {
      return {
        totalSaved: 0,
        monthlyAverage: 0,
        transactionCount: 0,
        trendData: [],
        incomeTotal: 0,
        expenseTotal: 0,
        netTotal: 0
      };
    }

    // Get all investment transactions
    const investmentTransactions = transactions.filter(t => 
      t.category?.id === investmentCategory.id && t.include_in_stats
    );

    // Calculate totals by type
    const incomeTotal = investmentTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenseTotal = investmentTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const netTotal = expenseTotal - incomeTotal; // Expenses add to savings, income withdraws

    // Calculate monthly average based on last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const recentTransactions = investmentTransactions.filter(t => 
      new Date(t.transaction_date) >= sixMonthsAgo
    );
    
    const monthlyTotal = recentTransactions.reduce((sum, t) => {
      if (t.type === 'expense') return sum + t.amount;
      if (t.type === 'income') return sum - t.amount;
      return sum;
    }, 0);
    
    const monthlyAverage = monthlyTotal / 6;

    // Build cumulative trend data
    const sortedTransactions = [...investmentTransactions].sort(
      (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    );

    let cumulative = 0;
    const trendData = sortedTransactions.map(t => {
      if (t.type === 'expense') {
        cumulative += t.amount;
      } else if (t.type === 'income') {
        cumulative -= t.amount;
      }
      return {
        date: format(new Date(t.transaction_date), 'dd/MM', { locale: fr }),
        total: cumulative
      };
    });

    return {
      totalSaved: netTotal,
      monthlyAverage,
      transactionCount: investmentTransactions.length,
      trendData,
      incomeTotal,
      expenseTotal,
      netTotal
    };
  }, [transactions, investmentCategory]);

  // Monthly breakdown for last 6 months
  const monthlyBreakdown = useMemo(() => {
    if (!investmentCategory) return [];

    const months: { month: string; amount: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const monthTransactions = transactions.filter(t => {
        const date = new Date(t.transaction_date);
        return t.category?.id === investmentCategory.id && 
               t.include_in_stats &&
               date >= monthStart && 
               date <= monthEnd;
      });

      const monthTotal = monthTransactions.reduce((sum, t) => {
        if (t.type === 'expense') return sum + t.amount;
        if (t.type === 'income') return sum - t.amount;
        return sum;
      }, 0);

      months.push({
        month: format(monthStart, 'MMM yyyy', { locale: fr }),
        amount: monthTotal
      });
    }

    return months;
  }, [transactions, investmentCategory]);

  const calculateProjection = (goal: SavingsGoal) => {
    if (!goal.target_date) return null;
    
    const targetDate = new Date(goal.target_date);
    const today = new Date();
    const remainingDays = differenceInDays(targetDate, today);
    
    if (remainingDays <= 0) return { onTrack: goal.current_amount >= goal.target_amount };
    
    const remainingAmount = goal.target_amount - goal.current_amount;
    const dailyRequired = remainingAmount / remainingDays;
    const monthlyRequired = dailyRequired * 30;
    
    return {
      remainingDays,
      dailyRequired,
      monthlyRequired,
      onTrack: monthlyRequired <= (investmentStats.monthlyAverage > 0 ? investmentStats.monthlyAverage : monthlyRequired * 2)
    };
  };

  if (loading || goalsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p>Chargement...</p>
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
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
              <PiggyBank className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
              <span className="truncate">Épargne</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 hidden sm:block">
              Gérez vos objectifs d'épargne et investissements
            </p>
          </div>
          <Button 
            onClick={() => setShowNewGoalModal(true)}
            size="sm"
            className="h-8 sm:h-9 px-2 sm:px-4 flex-shrink-0"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nouvel objectif</span>
          </Button>
        </div>

        {/* Investment Statistics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border-border bg-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <PiggyBank className="h-4 w-4 text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">Total épargné</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-success">
                {formatCurrency(investmentStats.totalSaved)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">Moyenne mensuelle</span>
              </div>
              <p className={`text-lg sm:text-2xl font-bold ${investmentStats.monthlyAverage >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(investmentStats.monthlyAverage)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-xs sm:text-sm text-muted-foreground">Versements</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold">
                {formatCurrency(investmentStats.expenseTotal)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-xs sm:text-sm text-muted-foreground">Retraits</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold">
                {formatCurrency(investmentStats.incomeTotal)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Evolution Chart */}
        {investmentStats.trendData.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base sm:text-lg">Évolution de l'épargne</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={investmentStats.trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }}
                      className="text-muted-foreground"
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.2)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Breakdown */}
        {monthlyBreakdown.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base sm:text-lg">Épargne mensuelle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {monthlyBreakdown.map((month, index) => {
                const maxAmount = Math.max(...monthlyBreakdown.map(m => Math.abs(m.amount)), 1);
                const percentage = (Math.abs(month.amount) / maxAmount) * 100;
                
                return (
                  <div key={month.month} className="space-y-1">
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="capitalize">{month.month}</span>
                      <span className={month.amount >= 0 ? 'text-success' : 'text-destructive'}>
                        {month.amount >= 0 ? '+' : ''}{formatCurrency(month.amount)}
                      </span>
                    </div>
                    <Progress 
                      value={percentage} 
                      className="h-2"
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Savings Goals */}
        <div>
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
            Objectifs d'épargne ({goals.length})
          </h2>
          
          {goals.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="p-6 text-center">
                <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-4">
                  Aucun objectif d'épargne défini
                </p>
                <Button onClick={() => setShowNewGoalModal(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un objectif
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {goals.map((goal) => {
                const progress = (goal.current_amount / goal.target_amount) * 100;
                const projection = calculateProjection(goal);
                
                return (
                  <Card
                    key={goal.id}
                    className="border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedGoal(goal)}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base sm:text-lg truncate">{goal.name}</h3>
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
                          <span className="text-muted-foreground">Progression</span>
                          <span className="font-medium">{Math.min(progress, 100).toFixed(0)}%</span>
                        </div>
                        <Progress 
                          value={Math.min(progress, 100)} 
                          className="h-2"
                        />
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="font-medium">{formatCurrency(goal.current_amount)}</span>
                          <span className="text-muted-foreground">/ {formatCurrency(goal.target_amount)}</span>
                        </div>
                      </div>

                      {goal.target_date && projection && projection.remainingDays !== undefined && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              {projection.remainingDays} jours restants
                            </span>
                            <span className={projection.onTrack ? 'text-success' : 'text-destructive'}>
                              {formatCurrency(projection.monthlyRequired)}/mois requis
                            </span>
                          </div>
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
