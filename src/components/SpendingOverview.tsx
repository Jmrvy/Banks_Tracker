import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { useState, useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { startOfMonth, endOfMonth } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";

export const SpendingOverview = () => {
  const { transactions, categories, loading } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Calculate spending by category from actual transactions (current month only)
  const spendingData = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    // Filter transactions to current month
    const currentMonthTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.transaction_date);
      return transactionDate >= monthStart && transactionDate <= monthEnd;
    });
    
    return categories.map(category => {
      const categoryTransactions = currentMonthTransactions.filter(t => 
        t.category?.name === category.name && t.type === 'expense'
      );
      
      const amount = categoryTransactions.reduce((sum, t) => sum + t.amount, 0);
      
      return {
        name: category.name,
        amount,
        budget: category.budget || 0,
        color: category.color,
        transactionCount: categoryTransactions.length
      };
    }).filter(cat => cat.amount > 0 || cat.budget > 0); // Show categories with spending OR budget
  }, [transactions, categories]);

  const totalSpent = spendingData.reduce((sum, cat) => sum + cat.amount, 0);
  const totalBudget = spendingData.reduce((sum, cat) => sum + cat.budget, 0);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setModalOpen(true);
  };

  const getCategoryTransactions = (categoryName: string) => {
    return transactions.filter(t => 
      t.category?.name === categoryName && (t.type === 'expense' || t.type === 'transfer')
    ).map(t => ({
      id: t.id,
      description: t.description,
      amount: -t.amount, // Make negative for display
      bank: t.account?.bank || 'other',
      date: t.transaction_date,
      type: t.type as 'expense' | 'income' | 'transfer'
    }));
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dépenses par Catégorie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="animate-pulse w-3 h-3 rounded-full bg-muted" />
                  <div className="animate-pulse h-4 bg-muted rounded w-24" />
                </div>
                <div className="animate-pulse h-4 bg-muted rounded w-16" />
              </div>
              <div className="animate-pulse h-2 bg-muted rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (spendingData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dépenses par Catégorie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Aucune catégorie avec dépenses ou budget trouvée</p>
            <p className="text-sm text-muted-foreground mt-1">
              Créez des transactions ou définissez des budgets pour suivre vos dépenses
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Gauge data and colors - show remaining budget that decreases
  const budgetPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const remainingPercentage = Math.max(0, 100 - budgetPercentage);
  const spentPercentage = Math.min(budgetPercentage, 100);
  
  const gaugeData = [
    { name: 'Restant', value: remainingPercentage },
    { name: 'Dépensé', value: spentPercentage }
  ];

  const getRemainingColor = (percentage: number) => {
    if (percentage <= 10) return 'hsl(0, 84%, 60%)'; // Rouge
    if (percentage <= 25) return 'hsl(38, 92%, 50%)'; // Orange
    if (percentage <= 50) return 'hsl(142, 71%, 45%)'; // Vert moyen
    return 'hsl(142, 76%, 36%)'; // Vert foncé
  };

  const remainingColor = getRemainingColor(remainingPercentage);
  const spentColor = 'hsl(var(--muted) / 0.3)';
  const isOverBudget = budgetPercentage > 100;
  const remaining = totalBudget - totalSpent;

  return (
    <Card>
      <CardHeader className="pb-2 sm:pb-4">
        <CardTitle className="text-base sm:text-lg">Dépenses & Budget</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4">
        {/* Budget Gauge */}
        {totalBudget > 0 && (
          <div className="flex flex-col items-center pb-4 sm:pb-6 border-b">
            <div className="relative w-full max-w-[320px] sm:max-w-[380px]">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80 rounded-full blur-xl" />
              <ResponsiveContainer width="100%" height={200}>
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

            <div className="mt-3 w-full space-y-2">
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

              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div>
                  <div className="text-[10px] text-muted-foreground">Dépensé</div>
                  <div className="font-semibold">{formatCurrency(totalSpent)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">
                    {isOverBudget ? 'Dépassement' : 'Disponible'}
                  </div>
                  <div className="font-semibold">{formatCurrency(Math.abs(remaining))}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Categories List */}
        <div className="space-y-2 sm:space-y-3">
        {spendingData.map((category) => {
          const percentage = category.budget > 0 ? (category.amount / category.budget) * 100 : 0;
          const isOverBudget = percentage > 100;
          
          return (
            <div 
              key={category.name} 
              className="space-y-1 sm:space-y-2 cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
              onClick={() => handleCategoryClick(category.name)}
            >
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center space-x-1.5 sm:space-x-2 min-w-0 flex-1">
                  <div 
                    className="w-2 h-2 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="font-medium truncate">{category.name}</span>
                  <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">
                    ({category.transactionCount})
                  </span>
                </div>
                <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0 ml-2">
                  <span className={`text-xs sm:text-sm ${isOverBudget ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                    {formatCurrency(category.amount)}
                  </span>
                  {category.budget > 0 && (
                    <span className="text-muted-foreground text-xs">
                      / {formatCurrency(category.budget)}
                    </span>
                  )}
                </div>
              </div>
              {category.budget > 0 && (
                <Progress 
                  value={Math.min(percentage, 100)} 
                  className="h-1.5 sm:h-2"
                />
              )}
              {isOverBudget && (
                <p className="text-[10px] sm:text-xs text-destructive">
                  Dépassement de {(percentage - 100).toFixed(1)}%
                </p>
              )}
            </div>
          );
        })}
        </div>
      </CardContent>
      
      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={selectedCategory ? getCategoryTransactions(selectedCategory) : []}
      />
    </Card>
  );
};
