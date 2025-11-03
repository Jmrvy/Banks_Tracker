import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { startOfMonth, endOfMonth } from "date-fns";

export const BudgetGauge = () => {
  const { transactions, categories, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const budgetData = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    const currentMonthTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.transaction_date);
      return transactionDate >= monthStart && transactionDate <= monthEnd;
    });
    
    const categoryData = categories.map(category => {
      const categoryTransactions = currentMonthTransactions.filter(t => 
        t.category?.name === category.name && t.type === 'expense'
      );
      
      const amount = categoryTransactions.reduce((sum, t) => sum + t.amount, 0);
      
      return {
        name: category.name,
        amount,
        budget: category.budget || 0,
      };
    }).filter(cat => cat.amount > 0 || cat.budget > 0);

    const totalSpent = categoryData.reduce((sum, cat) => sum + cat.amount, 0);
    const totalBudget = categoryData.reduce((sum, cat) => sum + cat.budget, 0);

    return { totalSpent, totalBudget };
  }, [transactions, categories]);

  const { totalSpent, totalBudget } = budgetData;

  if (loading || totalBudget === 0) {
    return null;
  }

  const budgetPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const remainingPercentage = Math.max(0, 100 - budgetPercentage);
  const spentPercentage = Math.min(budgetPercentage, 100);
  
  const gaugeData = [
    { name: 'Restant', value: remainingPercentage },
    { name: 'Dépensé', value: spentPercentage }
  ];

  const getRemainingColor = (percentage: number) => {
    if (percentage <= 10) return 'hsl(0, 84%, 60%)';
    if (percentage <= 25) return 'hsl(38, 92%, 50%)';
    if (percentage <= 50) return 'hsl(142, 71%, 45%)';
    return 'hsl(142, 76%, 36%)';
  };

  const remainingColor = getRemainingColor(remainingPercentage);
  const spentColor = 'hsl(var(--muted) / 0.3)';
  const isOverBudget = budgetPercentage > 100;
  const remaining = totalBudget - totalSpent;

  return (
    <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-card via-card to-accent/5">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-[240px] sm:max-w-[280px]">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80 rounded-full blur-xl" />
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={gaugeData}
                  cx="50%"
                  cy="85%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius="65%"
                  outerRadius="100%"
                  paddingAngle={0}
                  dataKey="value"
                  strokeWidth={0}
                >
                  <Cell fill={remainingColor} className="drop-shadow-lg" />
                  <Cell fill={spentColor} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center z-10">
              <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
                {remainingPercentage.toFixed(0)}%
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground font-medium">
                restant
              </div>
            </div>
          </div>

          <div className="mt-4 w-full space-y-2">
            {isOverBudget ? (
              <div className="flex items-center justify-center gap-1.5 text-destructive">
                <AlertTriangle className="w-3 h-3" />
                <span className="text-xs font-medium">Budget dépassé</span>
              </div>
            ) : budgetPercentage >= 90 ? (
              <div className="flex items-center justify-center gap-1.5 text-warning">
                <TrendingUp className="w-3 h-3" />
                <span className="text-xs font-medium">Presque atteint</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                <TrendingDown className="w-3 h-3" />
                <span className="text-xs font-medium">Sous contrôle</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-[10px] text-muted-foreground font-medium mb-1">Dépensé</div>
                <div className="font-bold text-sm">{formatCurrency(totalSpent)}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-[10px] text-muted-foreground font-medium mb-1">
                  {isOverBudget ? 'Dépassement' : 'Disponible'}
                </div>
                <div className="font-bold text-sm">{formatCurrency(Math.abs(remaining))}</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
