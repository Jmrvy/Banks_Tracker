import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartTooltip } from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { CategoryData } from "@/hooks/useReportsData";
import { useIsMobile } from "@/hooks/use-mobile";
import { CategoryTransactionsModal } from "@/components/CategoryTransactionsModal";
import { Transaction as FinancialTransaction } from "@/hooks/useFinancialData";

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

  const handleBarClick = (data: any) => {
    setSelectedCategory(data.name);
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
    .map((c) => ({
      name: c.name,
      value: Math.abs(c.spent),
      color: c.color,
    }));

  const totalSpent = chartData.reduce((sum, item) => sum + item.value, 0);

  const stackedBarData = categoryChartData
    .filter(c => c.budget > 0)
    .sort((a, b) => b.spent - a.spent)
    .map(c => ({
      name: c.name,
      spent: Math.abs(c.spent),
      remaining: Math.max(0, c.budget - c.spent),
      budget: c.budget,
      color: c.color,
      percentage: parseFloat(c.percentage)
    }));

  if (chartData.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="text-center py-8">
          <p className="text-xs sm:text-sm text-muted-foreground">Aucune dépense trouvée pour cette période</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Pie Chart */}
        <Card className="border-border overflow-hidden">
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardTitle className="text-sm sm:text-base">Répartition</CardTitle>
            <CardDescription className="text-[10px] sm:text-xs">Par catégorie</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            <div className="h-[200px] sm:h-[280px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => 
                      isMobile 
                        ? `${(percent * 100).toFixed(0)}%`
                        : `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={isMobile ? 65 : 90}
                    innerRadius={isMobile ? 35 : 50}
                    fill="#8884d8"
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const percentage = ((data.value / totalSpent) * 100).toFixed(1);
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
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
            </div>
            <div className="mt-2 text-center">
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{formatCurrency(totalSpent)}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stacked Bar Chart */}
        <Card className="border-border overflow-hidden">
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardTitle className="text-sm sm:text-base">Budget</CardTitle>
            <CardDescription className="text-[10px] sm:text-xs">Comparaison</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            <div className="h-[200px] sm:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={stackedBarData}
                  margin={{ top: 10, right: 5, left: 5, bottom: 50 }}
                  onClick={(data) => {
                    if (data && data.activePayload && data.activePayload[0]) {
                      handleBarClick(data.activePayload[0].payload);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    fontSize={isMobile ? 8 : 10}
                    interval={0}
                  />
                  <YAxis 
                    fontSize={isMobile ? 8 : 10}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    width={35}
                  />
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm min-w-[160px]">
                            <div className="flex items-center gap-2 mb-1.5">
                              <div 
                                className="w-2.5 h-2.5 rounded-full" 
                                style={{ backgroundColor: data.color }}
                              />
                              <span className="font-medium text-xs">{data.name}</span>
                            </div>
                            <div className="space-y-0.5 text-[10px] sm:text-xs">
                              <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">Budget:</span>
                                <span className="font-semibold">{formatCurrency(data.budget)}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">Dépensé:</span>
                                <span className="font-semibold text-destructive">{formatCurrency(data.spent)}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">Restant:</span>
                                <span className={cn(
                                  "font-semibold",
                                  data.remaining > 0 ? "text-success" : "text-destructive"
                                )}>
                                  {formatCurrency(data.remaining)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar 
                    dataKey="spent" 
                    stackId="a"
                    fill="currentColor"
                    radius={[0, 0, 0, 0]}
                    cursor="pointer"
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                  >
                    {stackedBarData.map((entry, index) => (
                      <Cell 
                        key={`spent-${index}`} 
                        fill={entry.color}
                        opacity={0.9}
                      />
                    ))}
                  </Bar>
                  <Bar 
                    dataKey="remaining" 
                    stackId="a"
                    fill="hsl(var(--muted-foreground))"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                    opacity={0.2}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex justify-center gap-3 text-[10px] sm:text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded border border-border" style={{ backgroundColor: 'hsl(var(--primary))', opacity: 0.9 }}></div>
                <span className="text-muted-foreground">Dépensé</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded border border-border" style={{ backgroundColor: 'hsl(var(--muted-foreground))', opacity: 0.2 }}></div>
                <span className="text-muted-foreground">Restant</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Analysis */}
      <Card className="border-border">
        <CardHeader className="p-3 sm:p-4 pb-2">
          <CardTitle className="text-sm sm:text-base">Analyse par catégorie</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-0">
          <div className="space-y-1.5 max-h-56 sm:max-h-72 overflow-y-auto">
            {categoryChartData.map((category, index) => (
              <div 
                key={index} 
                className="p-2 sm:p-2.5 bg-muted/30 hover:bg-muted/50 rounded-lg space-y-1.5 transition-colors border border-transparent hover:border-border/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div 
                      className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="font-medium text-xs sm:text-sm truncate">{category.name}</span>
                  </div>
                  <Badge 
                    variant={category.budget > 0 && category.spent > category.budget ? "destructive" : "secondary"}
                    className="text-[9px] sm:text-[10px] px-1.5 py-0 h-4 sm:h-5 flex-shrink-0 ml-2"
                  >
                    {category.budget > 0 ? `${category.percentage}%` : 'Pas de budget'}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-[10px] sm:text-xs">
                  <div>
                    <span className="text-muted-foreground">Dépensé</span>
                    <span className="block font-semibold text-destructive">
                      {formatCurrency(category.spent)}
                    </span>
                  </div>
                  {category.budget > 0 && (
                    <div>
                      <span className="text-muted-foreground">Budget</span>
                      <span className="block font-semibold">
                        {formatCurrency(category.budget)}
                      </span>
                    </div>
                  )}
                </div>

                {category.budget > 0 && (
                  <>
                    <div className="flex justify-between items-center text-[10px] sm:text-xs">
                      <span className="text-muted-foreground">Restant</span>
                      <span className={cn(
                        "font-semibold",
                        category.remaining > 0 ? "text-success" : "text-destructive"
                      )}>
                        {formatCurrency(category.remaining)}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          category.spent > category.budget 
                            ? "bg-destructive" 
                            : "bg-success"
                        )}
                        style={{ width: `${Math.min(100, (category.spent / category.budget) * 100)}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <CategoryTransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categoryName={selectedCategory || ''}
        transactions={getCategoryTransactions()}
      />
    </div>
  );
};
