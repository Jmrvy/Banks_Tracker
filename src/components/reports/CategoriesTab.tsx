import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartTooltip } from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { CategoryData } from "@/hooks/useReportsData";
import { useIsMobile } from "@/hooks/use-mobile";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { Transaction as FinancialTransaction } from "@/hooks/useFinancialData";
import { TrendingDown, Target, AlertTriangle, CheckCircle2 } from "lucide-react";

interface CategoriesTabProps {
  categoryChartData: CategoryData[];
  transactions: FinancialTransaction[];
}

export const CategoriesTab = ({ categoryChartData, transactions }: CategoriesTabProps) => {
  const isMobile = useIsMobile();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  const formatCurrency = (amount: number) => 
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  const formatCompact = (amount: number) => {
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}k €`;
    }
    return formatCurrency(amount);
  };

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setModalOpen(true);
  };

  const getCategoryTransactions = () => {
    if (!selectedCategory) return [];
    
    return transactions
      .filter(t => t.category?.name === selectedCategory && t.type === 'expense')
      .map(t => ({
        id: t.id,
        description: t.description,
        amount: Math.abs(t.amount),
        bank: t.account?.bank || 'other',
        date: t.transaction_date,
        type: t.type
      }));
  };

  const chartData = categoryChartData
    .filter(c => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .map((c) => ({
      name: c.name,
      value: Math.abs(c.spent),
      color: c.color,
    }));

  const totalSpent = chartData.reduce((sum, item) => sum + item.value, 0);
  const totalBudget = categoryChartData.reduce((sum, c) => sum + (c.budget || 0), 0);
  const categoriesWithBudget = categoryChartData.filter(c => c.budget > 0);
  const overBudgetCategories = categoriesWithBudget.filter(c => c.spent > c.budget);
  const underBudgetCategories = categoriesWithBudget.filter(c => c.spent <= c.budget);

  if (chartData.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="text-center py-12">
          <TrendingDown className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">Aucune dépense trouvée pour cette période</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="border-border bg-gradient-to-br from-background to-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-destructive" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Total dépensé</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-destructive">{formatCompact(totalSpent)}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border bg-gradient-to-br from-background to-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Budget total</span>
            </div>
            <p className="text-sm sm:text-base font-bold">{formatCompact(totalBudget)}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border bg-gradient-to-br from-background to-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Dépassés</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-orange-500">{overBudgetCategories.length}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border bg-gradient-to-br from-background to-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Sous budget</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-success">{underBudgetCategories.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content: Chart + Legend */}
      <Card className="border-border overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Donut Chart */}
            <div className="relative w-full sm:w-1/2 h-[180px] sm:h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={isMobile ? 70 : 85}
                    innerRadius={isMobile ? 45 : 55}
                    fill="#8884d8"
                    dataKey="value"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => handleCategoryClick(entry.name)}
                      />
                    ))}
                  </Pie>
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const percentage = ((data.value / totalSpent) * 100).toFixed(1);
                        return (
                          <div className="rounded-lg border bg-background/95 backdrop-blur-sm p-2 shadow-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <div 
                                className="w-2.5 h-2.5 rounded-full" 
                                style={{ backgroundColor: data.color }}
                              />
                              <span className="font-medium text-xs">{data.name}</span>
                            </div>
                            <div className="text-xs">
                              <div className="font-semibold text-foreground">
                                {formatCurrency(data.value)}
                              </div>
                              <div className="text-muted-foreground text-[10px]">
                                {percentage}% du total
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg sm:text-xl font-bold">{formatCompact(totalSpent)}</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Total</span>
              </div>
            </div>

            {/* Legend */}
            <div className="w-full sm:w-1/2 grid grid-cols-2 gap-1.5 sm:gap-2 max-h-[180px] sm:max-h-[220px] overflow-y-auto">
              {chartData.slice(0, 8).map((item, index) => {
                const percentage = ((item.value / totalSpent) * 100).toFixed(0);
                return (
                  <button
                    key={index}
                    onClick={() => handleCategoryClick(item.name)}
                    className="flex items-center gap-2 p-1.5 sm:p-2 rounded-md hover:bg-muted/50 transition-colors text-left group"
                  >
                    <div 
                      className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0 group-hover:scale-110 transition-transform" 
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] sm:text-xs font-medium truncate">{item.name}</p>
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground">{percentage}%</p>
                    </div>
                  </button>
                );
              })}
              {chartData.length > 8 && (
                <div className="col-span-2 text-center py-1">
                  <span className="text-[10px] text-muted-foreground">+{chartData.length - 8} autres catégories</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories List */}
      <div className="space-y-2">
        <h3 className="text-xs sm:text-sm font-semibold text-foreground px-1">Détail par catégorie</h3>
        <div className="space-y-1.5">
          {categoryChartData
            .filter(c => c.spent > 0)
            .sort((a, b) => b.spent - a.spent)
            .map((category, index) => {
              const percentage = category.budget > 0 ? (category.spent / category.budget) * 100 : 0;
              const isOverBudget = category.budget > 0 && category.spent > category.budget;
              
              return (
                <button
                  key={index}
                  onClick={() => handleCategoryClick(category.name)}
                  className={cn(
                    "w-full p-2.5 sm:p-3 rounded-lg transition-all text-left",
                    "bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border/50",
                    "active:scale-[0.99]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="font-medium text-xs sm:text-sm truncate">{category.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {category.budget > 0 && (
                        <Badge 
                          variant={isOverBudget ? "destructive" : "secondary"}
                          className="text-[9px] sm:text-[10px] px-1.5 py-0 h-4 sm:h-5"
                        >
                          {percentage.toFixed(0)}%
                        </Badge>
                      )}
                      <span className={cn(
                        "font-bold text-xs sm:text-sm",
                        isOverBudget ? "text-destructive" : "text-foreground"
                      )}>
                        {formatCurrency(category.spent)}
                      </span>
                    </div>
                  </div>
                  
                  {category.budget > 0 && (
                    <div className="space-y-1.5">
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            isOverBudget ? "bg-destructive" : "bg-success"
                          )}
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
                        <span>Budget: {formatCurrency(category.budget)}</span>
                        <span className={cn(
                          "font-medium",
                          category.remaining > 0 ? "text-success" : "text-destructive"
                        )}>
                          {category.remaining >= 0 ? 'Reste' : 'Dépassement'}: {formatCurrency(Math.abs(category.remaining))}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {!category.budget && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Target className="w-3 h-3" />
                      <span>Aucun budget défini</span>
                    </div>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={getCategoryTransactions()}
      />
    </div>
  );
};
