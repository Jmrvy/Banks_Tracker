import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { IncomeCategory } from "@/hooks/useIncomeAnalysis";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ChartTooltip } from "@/components/ui/chart";
import { TrendingUp, Hash, Wallet, ArrowUpRight, Clock } from "lucide-react";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PeriodRecurringItem } from "@/hooks/useReportsData";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";

interface IncomeTabProps {
  incomeAnalysis: IncomeCategory[];
  totalIncome: number;
  includeUpcoming?: boolean;
  upcomingItems?: PeriodRecurringItem[];
  projectedIncome?: number;
}

// Couleurs harmonieuses pour les catégories
const COLORS = [
  'hsl(142, 76%, 36%)', // green
  'hsl(217, 91%, 60%)', // blue
  'hsl(271, 91%, 65%)', // purple
  'hsl(38, 92%, 50%)',  // amber
  'hsl(330, 81%, 60%)', // pink
  'hsl(174, 84%, 40%)', // teal
  'hsl(24, 94%, 53%)',  // orange
  'hsl(262, 83%, 58%)', // violet
  'hsl(187, 92%, 45%)', // cyan
  'hsl(84, 85%, 45%)',  // lime
];

export const IncomeTab = ({ incomeAnalysis, totalIncome, includeUpcoming, upcomingItems, projectedIncome }: IncomeTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setModalOpen(true);
  };

  const selectedCategoryData = incomeAnalysis.find(cat => cat.category === selectedCategory);
  const modalTransactions = selectedCategoryData?.transactions.map(t => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    netAmount: t.amount, // Pour les revenus, pas de logique de remboursement
    refundedAmount: 0,
    isFullyRefunded: false,
    hasRefund: false,
    bank: t.account?.name || 'other',
    date: t.transaction_date,
    valueDate: (t as any).value_date,
    type: 'income' as const
  })) || [];

  const totalTransactions = incomeAnalysis.reduce((sum, cat) => sum + cat.count, 0);
  const avgPerTransaction = totalTransactions > 0 ? totalIncome / totalTransactions : 0;

  const hasUpcomingIncome = includeUpcoming && upcomingItems && upcomingItems.some(pi => pi.futureOccurrences > 0);

  if (incomeAnalysis.length === 0 && !hasUpcomingIncome) {
    return (
      <Card className="border-border">
        <CardContent className="text-center py-12">
          <Wallet className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">Aucun revenu trouvé pour cette période</p>
        </CardContent>
      </Card>
    );
  }

  // Compute projected upcoming income by category
  const upcomingByCategory = includeUpcoming && upcomingItems ? (() => {
    const map = new Map<string, { amount: number; count: number; items: typeof upcomingItems }>();
    for (const pi of upcomingItems) {
      if (pi.futureOccurrences <= 0) continue;
      const catName = pi.recurring.category?.name || 'Sans catégorie';
      const existing = map.get(catName);
      if (existing) {
        existing.amount += pi.futurePeriodAmount;
        existing.count += pi.futureOccurrences;
        existing.items.push(pi);
      } else {
        map.set(catName, { amount: pi.futurePeriodAmount, count: pi.futureOccurrences, items: [pi] });
      }
    }
    return map;
  })() : null;

  const totalProjected = includeUpcoming && upcomingItems
    ? upcomingItems.reduce((sum, pi) => sum + pi.futurePeriodAmount, 0)
    : 0;
  const grandTotal = totalIncome + totalProjected;

  // Build combined categories: real + projected
  interface CombinedCategory {
    name: string;
    realAmount: number;
    projectedAmount: number;
    totalAmount: number;
    realCount: number;
    projectedCount: number;
    totalCount: number;
  }
  const combinedCategories: CombinedCategory[] = (() => {
    const map = new Map<string, CombinedCategory>();
    for (const cat of incomeAnalysis) {
      map.set(cat.category, {
        name: cat.category,
        realAmount: cat.totalAmount,
        projectedAmount: 0,
        totalAmount: cat.totalAmount,
        realCount: cat.count,
        projectedCount: 0,
        totalCount: cat.count,
      });
    }
    if (includeUpcoming && upcomingByCategory) {
      upcomingByCategory.forEach((val, catName) => {
        const existing = map.get(catName);
        if (existing) {
          existing.projectedAmount = val.amount;
          existing.totalAmount += val.amount;
          existing.projectedCount = val.count;
          existing.totalCount += val.count;
        } else {
          map.set(catName, {
            name: catName,
            realAmount: 0,
            projectedAmount: val.amount,
            totalAmount: val.amount,
            realCount: 0,
            projectedCount: val.count,
            totalCount: val.count,
          });
        }
      });
    }
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  })();

  const totalForPercentage = grandTotal > 0 ? grandTotal : 1;

  // Données pour le graphique circulaire
  const pieChartData = combinedCategories.map((cat, index) => ({
    name: cat.name,
    value: cat.totalAmount,
    count: cat.totalCount,
    color: COLORS[index % COLORS.length]
  }));

  return (
    <div className="space-y-3">
      {/* Stats Cards */}
      <div className={cn("grid gap-2 animate-glass-fade-in", includeUpcoming ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        <Card className="glass-hover">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="icon-badge icon-badge-sm bg-success/10">
                <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-success" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Revenus réels</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-success">{formatCurrency(totalIncome)}</p>
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
                <Hash className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Catégories</span>
            </div>
            <p className="text-sm sm:text-base font-bold">{incomeAnalysis.length}</p>
          </CardContent>
        </Card>

        {!includeUpcoming && (
          <>
            <Card className="glass-hover">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="icon-badge icon-badge-sm bg-muted/50">
                    <Wallet className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">Transactions</span>
                </div>
                <p className="text-sm sm:text-base font-bold">{totalTransactions}</p>
              </CardContent>
            </Card>

            <Card className="glass-hover">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="icon-badge icon-badge-sm bg-success/10">
                    <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-success" />
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">Moyenne/tx</span>
                </div>
                <p className="text-sm sm:text-base font-bold">{formatCurrency(avgPerTransaction)}</p>
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
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={70}
                    innerRadius={45}
                    fill="#8884d8"
                    dataKey="value"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {pieChartData.map((entry, index) => (
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
                        const percentage = ((data.value / totalForPercentage) * 100).toFixed(1);
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
                              <div className="font-semibold text-success">
                                {formatCurrency(data.value)}
                              </div>
                              <div className="text-muted-foreground text-[10px]">
                                {data.count} tx • {percentage}%
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
                <span className="text-lg sm:text-xl font-bold text-success">{formatCurrency(includeUpcoming ? grandTotal : totalIncome)}</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Total</span>
              </div>
            </div>

            {/* Legend */}
            <div className="w-full sm:w-1/2 grid grid-cols-2 gap-1.5 sm:gap-2 max-h-[180px] sm:max-h-[220px] overflow-y-auto">
              {pieChartData.slice(0, 8).map((item, index) => {
                const percentage = ((item.value / totalForPercentage) * 100).toFixed(0);
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
              {pieChartData.length > 8 && (
                <div className="col-span-2 text-center py-1">
                  <span className="text-[10px] text-muted-foreground">+{pieChartData.length - 8} autres catégories</span>
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
          {combinedCategories.map((category, index) => {
              const percentage = (category.totalAmount / totalForPercentage) * 100;
              const color = COLORS[index % COLORS.length];

              return (
                <button
                  key={category.name}
                  onClick={() => category.realCount > 0 ? handleCategoryClick(category.name) : undefined}
                  className={cn(
                    "w-full p-2.5 sm:p-3 rounded-xl transition-all duration-300 text-left",
                    "bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.10]",
                    "active:scale-[0.99] backdrop-blur-sm",
                    category.projectedAmount > 0 && category.realAmount === 0 && "border-dashed border-primary/30"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-medium text-xs sm:text-sm truncate">{category.name}</span>
                      {category.projectedAmount > 0 && (
                        <Badge variant="outline" className="text-[8px] sm:text-[9px] px-1 py-0 h-3.5 border-primary/40 text-primary">
                          +{formatCurrency(category.projectedAmount)} projeté
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge
                        variant="secondary"
                        className="text-[9px] sm:text-[10px] px-1.5 py-0 h-4 sm:h-5 bg-success/10 text-success border-0"
                      >
                        {percentage.toFixed(0)}%
                      </Badge>
                      <span className="font-bold text-xs sm:text-sm text-success">
                        {formatCurrency(category.totalAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 bg-success"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
                      <span>
                        {category.realCount} transaction{category.realCount > 1 ? 's' : ''}
                        {category.projectedCount > 0 && ` + ${category.projectedCount} projetée${category.projectedCount > 1 ? 's' : ''}`}
                      </span>
                      <span>Moy: {formatCurrency(category.totalAmount / category.totalCount)}</span>
                    </div>
                  </div>
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
              Revenus récurrents à venir
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
                        <span className="text-xs font-medium truncate block">{resolveNamePlaceholders(item.recurring.description, new Date(item.occurrenceDetails?.find(d => d.isFuture)?.date || item.recurring.next_due_date))}</span>
                        <span className="text-[9px] text-muted-foreground">
                          {item.futureOccurrences}x • {item.recurring.category?.name || 'Sans catégorie'}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-success flex-shrink-0">
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
        transactions={modalTransactions}
      />
    </div>
  );
};
