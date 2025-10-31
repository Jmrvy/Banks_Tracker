import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
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

const chartConfig = {
  spent: {
    label: "Dépensé",
    color: "hsl(var(--destructive))"
  },
  budget: {
    label: "Budget",
    color: "hsl(var(--muted-foreground))"
  }
};

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

  // Prépare les données pour le pie chart
  const chartData = categoryChartData
    .filter(c => c.spent > 0)
    .map((c) => ({
      name: c.name,
      value: Math.abs(c.spent),
      color: c.color,
    }));

  const totalSpent = chartData.reduce((sum, item) => sum + item.value, 0);

  // Prépare les données pour le graphique empilé (Budget vs Dépenses)
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

  console.log('Category Chart Data:', chartData);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">Aucune dépense trouvée pour cette période</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Charts Section - Double Chart Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Pie Chart */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-1.5 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
            <CardTitle className="text-xs sm:text-sm lg:text-base">Répartition</CardTitle>
            <CardDescription className="text-[10px] sm:text-xs">Par catégorie</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 pb-2 sm:pb-4">
            <div className="h-[250px] sm:h-[350px] flex items-center justify-center">
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
                        : `${name}: ${(percent * 100).toFixed(1)}%`
                    }
                    outerRadius={isMobile ? 80 : 110}
                    innerRadius={isMobile ? 40 : 60}
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
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: data.color }}
                              />
                              <span className="font-medium text-sm">{data.name}</span>
                            </div>
                            <div className="text-sm">
                              <div className="font-semibold text-foreground">
                                {formatCurrency(data.value)}
                              </div>
                              <div className="text-muted-foreground text-xs">
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
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{formatCurrency(totalSpent)}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stacked Bar Chart - Budget vs Dépenses */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-1.5 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
            <CardTitle className="text-xs sm:text-sm lg:text-base">Budget</CardTitle>
            <CardDescription className="text-[10px] sm:text-xs">Comparaison</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 pb-2 sm:pb-4">
            <div className="h-[250px] sm:h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={stackedBarData}
                  margin={{ top: 20, right: 10, left: 10, bottom: 60 }}
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
                    height={80}
                    fontSize={isMobile ? 9 : 11}
                    interval={0}
                  />
                  <YAxis 
                    fontSize={isMobile ? 10 : 12}
                    tickFormatter={(value) => 
                      isMobile 
                        ? `${(value / 1000).toFixed(0)}k`
                        : value.toLocaleString('fr-FR', { 
                            style: 'currency', 
                            currency: 'EUR',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                          })
                    }
                  />
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-background p-3 shadow-sm min-w-[200px]">
                            <div className="flex items-center gap-2 mb-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: data.color }}
                              />
                              <span className="font-medium text-sm">{data.name}</span>
                            </div>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Budget:</span>
                                <span className="font-semibold">{formatCurrency(data.budget)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Dépensé:</span>
                                <span className="font-semibold text-destructive">{formatCurrency(data.spent)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Restant:</span>
                                <span className={cn(
                                  "font-semibold",
                                  data.remaining > 0 ? "text-success" : "text-destructive"
                                )}>
                                  {formatCurrency(data.remaining)}
                                </span>
                              </div>
                              <div className="pt-1 mt-1 border-t">
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Utilisé:</span>
                                  <span className="font-semibold">{data.percentage.toFixed(1)}%</span>
                                </div>
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
            <div className="mt-3 flex justify-center gap-4 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded border border-border" style={{ backgroundColor: 'hsl(var(--primary))', opacity: 0.9 }}></div>
                <span className="text-muted-foreground">Dépensé</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded border border-border" style={{ backgroundColor: 'hsl(var(--muted-foreground))', opacity: 0.2 }}></div>
                <span className="text-muted-foreground">Restant</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Analysis - Mobile Optimized */}
      <Card>
        <CardHeader className="pb-1.5 sm:pb-2 px-2 sm:px-4 pt-2 sm:pt-4">
          <CardTitle className="text-xs sm:text-sm lg:text-base">Analyse</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-4 pb-2 sm:pb-4">
          <div className="space-y-1.5 sm:space-y-2 max-h-64 sm:max-h-80 overflow-y-auto">
            {categoryChartData.map((category, index) => (
              <div 
                key={index} 
                className="group p-2 sm:p-3 bg-muted/30 hover:bg-muted/50 rounded-lg space-y-1.5 sm:space-y-2 transition-all duration-200 animate-fade-in border border-transparent hover:border-border/50"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div 
                      className="w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="font-medium text-sm sm:text-base truncate">{category.name}</span>
                  </div>
                  <Badge 
                    variant={category.budget > 0 && category.spent > category.budget ? "destructive" : "secondary"}
                    className="text-xs flex-shrink-0 ml-2"
                  >
                    {category.budget > 0 ? `${category.percentage}%` : 'Pas de budget'}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                  <div>
                    <span className="text-muted-foreground block">Dépensé</span>
                    <span className="font-semibold text-destructive">
                      {formatCurrency(category.spent)}
                    </span>
                  </div>
                  {category.budget > 0 && (
                    <div>
                      <span className="text-muted-foreground block">Budget</span>
                      <span className="font-semibold">
                        {formatCurrency(category.budget)}
                      </span>
                    </div>
                  )}
                </div>

                {category.budget > 0 && (
                  <>
                    <div className="flex justify-between items-center text-xs sm:text-sm">
                      <span className="text-muted-foreground">Restant</span>
                      <span className={cn(
                        "font-semibold",
                        category.remaining > 0 ? "text-success" : "text-destructive"
                      )}>
                        {formatCurrency(category.remaining)}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 sm:h-2 overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500 ease-out",
                          category.spent > category.budget 
                            ? "bg-gradient-to-r from-destructive/80 to-destructive" 
                            : "bg-gradient-to-r from-success/80 to-success"
                        )}
                        style={{ 
                          width: `${Math.min(100, (category.spent / category.budget) * 100)}%`,
                          transitionDelay: `${index * 100 + 200}ms`
                        }}
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