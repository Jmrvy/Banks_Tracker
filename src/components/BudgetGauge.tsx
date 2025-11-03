import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";

export const BudgetGauge = () => {
  const { transactions, categories } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const budgetStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate total budget
    const totalBudget = categories
      .filter(cat => cat.budget && cat.budget > 0)
      .reduce((sum, cat) => sum + cat.budget, 0);

    if (totalBudget === 0) {
      return null;
    }

    // Calculate current month expenses
    const currentMonthExpenses = transactions
      .filter(t => {
        const date = new Date(t.transaction_date);
        return date.getMonth() === currentMonth && 
               date.getFullYear() === currentYear &&
               t.type === 'expense';
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const percentage = (currentMonthExpenses / totalBudget) * 100;
    const remaining = totalBudget - currentMonthExpenses;

    return {
      totalBudget,
      spent: currentMonthExpenses,
      remaining: Math.max(0, remaining),
      percentage: Math.min(percentage, 100),
      isOverBudget: percentage > 100
    };
  }, [transactions, categories]);

  if (!budgetStats) {
    return (
      <Card className="h-full">
        <CardHeader className="p-3 sm:p-4 lg:p-6">
          <CardTitle className="text-sm sm:text-base lg:text-lg">Budget Global</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
          <div className="text-center py-6 sm:py-8 text-muted-foreground">
            <p className="text-xs sm:text-sm">Aucun budget défini</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Gauge data
  const gaugeData = [
    { name: 'Dépensé', value: budgetStats.percentage },
    { name: 'Restant', value: Math.max(0, 100 - budgetStats.percentage) }
  ];

  // Color based on percentage
  const getColor = (percentage: number) => {
    if (percentage >= 100) return 'hsl(var(--destructive))';
    if (percentage >= 90) return 'hsl(var(--warning))';
    if (percentage >= 75) return 'hsl(var(--chart-2))';
    return 'hsl(var(--chart-1))';
  };

  const spentColor = getColor(budgetStats.percentage);
  const remainingColor = 'hsl(var(--muted))';

  return (
    <Card className="h-full">
      <CardHeader className="p-3 sm:p-4 lg:p-6">
        <CardTitle className="text-sm sm:text-base lg:text-lg">Budget Global</CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 lg:p-6 pt-0">
        <div className="flex flex-col items-center">
          {/* Gauge Chart */}
          <div className="relative w-full max-w-[200px] sm:max-w-[240px]">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie
                  data={gaugeData}
                  cx="50%"
                  cy="85%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius="70%"
                  outerRadius="100%"
                  paddingAngle={0}
                  dataKey="value"
                >
                  <Cell fill={spentColor} />
                  <Cell fill={remainingColor} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center text */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
              <div className="text-2xl sm:text-3xl font-bold">
                {budgetStats.percentage.toFixed(0)}%
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">
                utilisé
              </div>
            </div>
          </div>

          {/* Status indicator */}
          <div className="mt-4 sm:mt-6 w-full space-y-2 sm:space-y-3">
            {budgetStats.isOverBudget ? (
              <div className="flex items-center justify-center gap-2 text-destructive">
                <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm font-medium">Budget dépassé</span>
              </div>
            ) : budgetStats.percentage >= 90 ? (
              <div className="flex items-center justify-center gap-2 text-warning">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm font-medium">Presque atteint</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm font-medium">Sous contrôle</span>
              </div>
            )}

            {/* Budget details */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 text-center pt-2 border-t">
              <div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Dépensé</div>
                <div className="text-xs sm:text-sm font-semibold">
                  {formatCurrency(budgetStats.spent)}
                </div>
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">
                  {budgetStats.isOverBudget ? 'Dépassement' : 'Disponible'}
                </div>
                <div className="text-xs sm:text-sm font-semibold">
                  {formatCurrency(Math.abs(budgetStats.remaining))}
                </div>
              </div>
            </div>

            <div className="text-center pt-1 border-t">
              <div className="text-[10px] sm:text-xs text-muted-foreground">Budget total</div>
              <div className="text-sm sm:text-base font-bold">
                {formatCurrency(budgetStats.totalBudget)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};