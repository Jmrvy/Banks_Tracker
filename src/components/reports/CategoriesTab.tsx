import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartTooltip } from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { CategoryData, PeriodRecurringItem } from "@/hooks/useReportsData";
import { useIsMobile } from "@/hooks/use-mobile";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { Transaction as FinancialTransaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { TrendingDown, Target, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { CategoryCumulativeChart } from "@/components/charts/CategoryCumulativeChart";

interface CategoriesTabProps {
  categoryChartData: CategoryData[];
  transactions: FinancialTransaction[];
  periodStart: Date;
  periodEnd: Date;
  includeUpcoming?: boolean;
  upcomingItems?: PeriodRecurringItem[];
  projectedExpenses?: number;
  dateType?: 'accounting' | 'value';
}

// Helper to get upcoming items for a specific category
const getUpcomingForCategory = (catName: string, upcomingItems?: PeriodRecurringItem[]) => {
  if (!upcomingItems) return [];
  return upcomingItems.filter(item => 
    (item.recurring.category?.name || 'Sans catégorie') === catName && item.futureOccurrences > 0
  );
};

export const CategoriesTab = ({ categoryChartData, transactions, periodStart, periodEnd, includeUpcoming, upcomingItems, projectedExpenses, dateType }: CategoriesTabProps) => {
  const isMobile = useIsMobile();
  const { preferences, formatCurrency } = useUserPreferences();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setModalOpen(true);
  };

  const getCategoryTransactions = () => {
    if (!selectedCategory) return [];
    
    const activeDateType = dateType || preferences.dateType;
    
    // Real transactions
    const realTxs = transactions
      .filter(t => t.category?.name === selectedCategory && t.type === 'expense' && t.include_in_stats !== false)
      .map(t => {
        const refundedAmount = (t as any).refunded_amount || 0;
        const grossAmount = Math.abs(t.amount);
        const netAmount = Math.max(0, grossAmount - refundedAmount);
        
        return {
          id: t.id,
          description: t.description,
          amount: grossAmount,
          netAmount,
          refundedAmount,
          isFullyRefunded: refundedAmount >= grossAmount,
          hasRefund: refundedAmount > 0,
          bank: t.account?.bank || 'other',
          date: activeDateType === 'value' ? ((t as any).value_date || t.transaction_date) : t.transaction_date,
          valueDate: (t as any).value_date,
          type: t.type as 'expense' | 'income' | 'transfer',
          isProjected: false,
        };
      });

    // Projected upcoming recurring transactions
    if (includeUpcoming && upcomingItems && selectedCategory) {
      const catUpcoming = getUpcomingForCategory(selectedCategory, upcomingItems);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const item of catUpcoming) {
        if (item.futureOccurrences <= 0) continue;
        const rt = item.recurring;
        let current = new Date(rt.next_due_date + 'T00:00:00');
        let count = 0;

        const advanceDate = (d: Date, type: string): Date => {
          const { addDays, addWeeks, addMonths, addYears } = require('date-fns');
          switch (type) {
            case 'daily': return addDays(d, 1);
            case 'weekly': return addWeeks(d, 1);
            case 'monthly': return addMonths(d, 1);
            case 'quarterly': return addMonths(d, 3);
            case 'yearly': return addYears(d, 1);
            default: return addMonths(d, 1);
          }
        };

        while (current <= periodEnd && count < item.futureOccurrences) {
          if (current >= today && current >= periodStart) {
            const dateStr = current.toISOString().split('T')[0];
            realTxs.push({
              id: `projected-${rt.id}-${count}`,
              description: rt.description,
              amount: Number(rt.amount),
              netAmount: Number(rt.amount),
              refundedAmount: 0,
              isFullyRefunded: false,
              hasRefund: false,
              bank: (rt as any).account?.bank || 'other',
              date: dateStr,
              valueDate: dateStr,
              type: 'expense',
              isProjected: true,
            });
            count++;
          }
          current = advanceDate(current, rt.recurrence_type);
        }
      }
    }

    // Sort by date
    return realTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
  
  // Compute per-category projected amounts from future upcoming items only
  const projectedByCategory = new Map<string, number>();
  if (includeUpcoming && upcomingItems) {
    for (const item of upcomingItems) {
      const catName = item.recurring.category?.name || 'Sans catégorie';
      projectedByCategory.set(catName, (projectedByCategory.get(catName) || 0) + item.futurePeriodAmount);
    }
  }
  const totalProjectedFromItems = includeUpcoming ? Array.from(projectedByCategory.values()).reduce((s, v) => s + v, 0) : 0;
  const totalProjected = totalProjectedFromItems;
  const grandTotal = totalSpent + totalProjected;
  const totalBudget = categoryChartData.reduce((sum, c) => sum + (c.budget || 0), 0);
  const categoriesWithBudget = categoryChartData.filter(c => c.budget > 0);
  
  // When includeUpcoming, use spent + projected for budget comparison
  const getEffectiveSpent = (cat: CategoryData) => cat.spent + (projectedByCategory.get(cat.name) || 0);
  const overBudgetCategories = categoriesWithBudget.filter(c => 
    includeUpcoming ? getEffectiveSpent(c) > c.budget : c.spent > c.budget
  );
  const underBudgetCategories = categoriesWithBudget.filter(c => 
    includeUpcoming ? getEffectiveSpent(c) <= c.budget : c.spent <= c.budget
  );

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
      <div className={cn("grid gap-2 animate-glass-fade-in", includeUpcoming ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        <Card className="glass-hover">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="icon-badge icon-badge-sm bg-destructive/10">
                <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-destructive" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Dépenses réelles</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-destructive">{formatCurrency(totalSpent)}</p>
          </CardContent>
        </Card>

        {includeUpcoming && (
          <Card className="glass-hover border-dashed border-primary/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="icon-badge icon-badge-sm bg-primary/10">
                  <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Projeté</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-primary">{formatCurrency(totalProjected)}</p>
              <p className="text-[9px] text-muted-foreground">Total prévu: {formatCurrency(grandTotal)}</p>
            </CardContent>
          </Card>
        )}

        <Card className="glass-hover">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="icon-badge icon-badge-sm bg-primary/10">
                <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Budget total</span>
            </div>
            <p className="text-sm sm:text-base font-bold">{formatCurrency(totalBudget)}</p>
          </CardContent>
        </Card>

        {!includeUpcoming && (
          <>
            <Card className="glass-hover">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="icon-badge icon-badge-sm bg-orange-500/10">
                    <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-orange-500" />
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">Dépassés</span>
                </div>
                <p className="text-sm sm:text-base font-bold text-orange-500">{overBudgetCategories.length}</p>
              </CardContent>
            </Card>

            <Card className="glass-hover">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="icon-badge icon-badge-sm bg-success/10">
                    <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-success" />
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">Sous budget</span>
                </div>
                <p className="text-sm sm:text-base font-bold text-success">{underBudgetCategories.length}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Main Content: Chart + Legend */}
      <Card className="glass-hover animate-glass-slide-up overflow-hidden">
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
                <span className="text-lg sm:text-xl font-bold">{formatCurrency(totalSpent)}</span>
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
                    className="flex items-center gap-2 p-1.5 sm:p-2 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] transition-all duration-300 text-left group"
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

      {/* Cumulative Chart */}
      <CategoryCumulativeChart
        data={chartData.map((item, index) => ({
          name: item.name,
          value: item.value,
          color: item.color,
          percentage: totalSpent > 0 ? (item.value / totalSpent) * 100 : 0
        }))}
        title="Cumul des dépenses par catégorie"
        formatCurrency={formatCurrency}
        showCard={true}
      />

      {/* Budget Analysis */}
      {categoriesWithBudget.length > 0 && (
        <Card className="glass-hover animate-glass-slide-up">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-primary" />
              Analyse des budgets
            </h3>

            {/* Always over budget */}
            {overBudgetCategories.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] sm:text-xs text-destructive font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Budgets dépassés
                </p>
                <div className="space-y-1">
                  {overBudgetCategories
                    .sort((a, b) => (getEffectiveSpent(b) / b.budget) - (getEffectiveSpent(a) / a.budget))
                    .map((cat, i) => {
                      const effectiveSpent = getEffectiveSpent(cat);
                      const pct = Math.round((effectiveSpent / cat.budget) * 100);
                      const overAmount = effectiveSpent - cat.budget;
                      const projected = projectedByCategory.get(cat.name) || 0;
                      return (
                        <button
                          key={i}
                          onClick={() => handleCategoryClick(cat.name)}
                          className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-all text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-xs font-medium truncate">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                              {pct}%
                            </Badge>
                            <span className="text-[10px] sm:text-xs text-destructive font-semibold">
                              +{formatCurrency(overAmount)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Under budget / well managed */}
            {underBudgetCategories.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] sm:text-xs text-success font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Budgets respectés
                </p>
                <div className="space-y-1">
                  {underBudgetCategories
                    .sort((a, b) => (getEffectiveSpent(b) / b.budget) - (getEffectiveSpent(a) / a.budget))
                    .map((cat, i) => {
                      const effectiveSpent = getEffectiveSpent(cat);
                      const pct = cat.budget > 0 ? Math.round((effectiveSpent / cat.budget) * 100) : 0;
                      const remaining = cat.budget - effectiveSpent;
                      const isUnderUsed = pct < 30;
                      return (
                        <button
                          key={i}
                          onClick={() => handleCategoryClick(cat.name)}
                          className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-success/5 border border-success/10 hover:bg-success/10 transition-all text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-xs font-medium truncate">{cat.name}</span>
                            {isUnderUsed && (
                              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-muted-foreground border-muted-foreground/30">
                                Peu utilisé
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                              {pct}%
                            </Badge>
                            <span className="text-[10px] sm:text-xs text-success font-medium">
                              {formatCurrency(remaining)} restant
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* No budget categories info */}
            {categoryChartData.filter(c => c.spent > 0 && !c.budget).length > 0 && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Target className="w-3 h-3" />
                {categoryChartData.filter(c => c.spent > 0 && !c.budget).length} catégorie(s) sans budget défini
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Categories List */}
      <div className="space-y-2">
        <h3 className="text-xs sm:text-sm font-semibold text-foreground px-1">Détail par catégorie</h3>
        <div className="space-y-1.5">
          {categoryChartData
            .filter(c => c.spent > 0)
            .sort((a, b) => b.spent - a.spent)
            .map((category, index) => {
              const projected = projectedByCategory.get(category.name) || 0;
              const effectiveSpent = includeUpcoming ? category.spent + projected : category.spent;
              const percentage = category.budget > 0 ? (effectiveSpent / category.budget) * 100 : 0;
              const isOverBudget = category.budget > 0 && effectiveSpent > category.budget;
              const remaining = category.budget > 0 ? category.budget - effectiveSpent : 0;
              
              return (
                <button
                  key={index}
                  onClick={() => handleCategoryClick(category.name)}
                  className={cn(
                    "w-full p-2.5 sm:p-3 rounded-xl transition-all duration-300 text-left",
                    "bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.10]",
                    "active:scale-[0.99] backdrop-blur-sm"
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
                      <div className="text-right">
                        <span className={cn(
                          "font-bold text-xs sm:text-sm",
                          isOverBudget ? "text-destructive" : "text-foreground"
                        )}>
                          {formatCurrency(effectiveSpent)}
                        </span>
                        {includeUpcoming && projected > 0 && (
                          <span className="text-[9px] text-primary block">
                            dont {formatCurrency(projected)} projeté
                          </span>
                        )}
                      </div>
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
                          remaining > 0 ? "text-success" : "text-destructive"
                        )}>
                          {remaining >= 0 ? 'Reste' : 'Dépassement'}: {formatCurrency(Math.abs(remaining))}
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

      {/* Upcoming Recurring Items */}
      {includeUpcoming && upcomingItems && upcomingItems.length > 0 && (
        <Card className="glass-hover animate-glass-slide-up border-dashed border-primary/30">
          <CardContent className="p-3 sm:p-4 space-y-2">
            <h3 className="text-xs sm:text-sm font-semibold flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Dépenses récurrentes à venir
            </h3>
            <div className="space-y-1">
              {upcomingItems
                .filter(item => item.futureOccurrences > 0)
                .sort((a, b) => b.futurePeriodAmount - a.futurePeriodAmount)
                .map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.recurring.category?.color || '#94a3b8' }}
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-medium truncate block">{item.recurring.description}</span>
                        <span className="text-[9px] text-muted-foreground">
                          {item.futureOccurrences}x • {item.recurring.category?.name || 'Sans catégorie'}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-primary flex-shrink-0">
                      {formatCurrency(item.futurePeriodAmount)}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={getCategoryTransactions()}
        categoryData={selectedCategory ? categoryChartData.find(c => c.name === selectedCategory) : undefined}
        allTransactions={transactions}
        periodStart={periodStart}
        periodEnd={periodEnd}
        dateType={dateType}
        includeUpcoming={includeUpcoming}
        upcomingItems={selectedCategory ? getUpcomingForCategory(selectedCategory, upcomingItems) : undefined}
      />
    </div>
  );
};
