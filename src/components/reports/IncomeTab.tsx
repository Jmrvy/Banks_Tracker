import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { IncomeCategory } from "@/hooks/useIncomeAnalysis";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ChartTooltip } from "@/components/ui/chart";
import { TrendingUp, Hash, Wallet, ArrowUpRight } from "lucide-react";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface IncomeTabProps {
  incomeAnalysis: IncomeCategory[];
  totalIncome: number;
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

export const IncomeTab = ({ incomeAnalysis, totalIncome }: IncomeTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  const selectedCategoryData = incomeAnalysis.find(cat => cat.category === selectedCategory);
  const modalTransactions = selectedCategoryData?.transactions.map(t => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    bank: t.account?.name || 'other',
    date: t.transaction_date,
    type: 'income' as const
  })) || [];

  const totalTransactions = incomeAnalysis.reduce((sum, cat) => sum + cat.count, 0);
  const avgPerTransaction = totalTransactions > 0 ? totalIncome / totalTransactions : 0;

  if (incomeAnalysis.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="text-center py-12">
          <Wallet className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">Aucun revenu trouvé pour cette période</p>
        </CardContent>
      </Card>
    );
  }

  // Données pour le graphique circulaire
  const pieChartData = incomeAnalysis
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .map((cat, index) => ({
      name: cat.category,
      value: cat.totalAmount,
      count: cat.count,
      color: COLORS[index % COLORS.length]
    }));

  return (
    <div className="space-y-3">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="border-border bg-gradient-to-br from-background to-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-success" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Total revenus</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-success">{formatCompact(totalIncome)}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border bg-gradient-to-br from-background to-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Catégories</span>
            </div>
            <p className="text-sm sm:text-base font-bold">{incomeAnalysis.length}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border bg-gradient-to-br from-background to-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Transactions</span>
            </div>
            <p className="text-sm sm:text-base font-bold">{totalTransactions}</p>
          </CardContent>
        </Card>
        
        <Card className="border-border bg-gradient-to-br from-background to-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-success" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Moyenne/tx</span>
            </div>
            <p className="text-sm sm:text-base font-bold">{formatCompact(avgPerTransaction)}</p>
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
                        const percentage = ((data.value / totalIncome) * 100).toFixed(1);
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
                <span className="text-lg sm:text-xl font-bold text-success">{formatCompact(totalIncome)}</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Total</span>
              </div>
            </div>

            {/* Legend */}
            <div className="w-full sm:w-1/2 grid grid-cols-2 gap-1.5 sm:gap-2 max-h-[180px] sm:max-h-[220px] overflow-y-auto">
              {pieChartData.slice(0, 8).map((item, index) => {
                const percentage = ((item.value / totalIncome) * 100).toFixed(0);
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
          {incomeAnalysis
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .map((category, index) => {
              const percentage = (category.totalAmount / totalIncome) * 100;
              const color = COLORS[index % COLORS.length];
              
              return (
                <button
                  key={category.category}
                  onClick={() => handleCategoryClick(category.category)}
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
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-medium text-xs sm:text-sm truncate">{category.category}</span>
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
                      <span>{category.count} transaction{category.count > 1 ? 's' : ''}</span>
                      <span>Moy: {formatCurrency(category.totalAmount / category.count)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={modalTransactions}
      />
    </div>
  );
};
