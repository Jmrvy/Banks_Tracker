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

  // Prépare les données triées pour le bar chart
  const barChartData = [...chartData].sort((a, b) => b.value - a.value);

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
    <div className="space-y-4">
      {/* Charts Section - Double Chart Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-base sm:text-lg">Répartition des dépenses</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Pourcentage par catégorie</CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="h-[400px] sm:h-96 flex items-center justify-center">
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

        {/* Bar Chart */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-base sm:text-lg">Classement des dépenses</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Montants par catégorie (ordre décroissant)</CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="h-[400px] sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={barChartData}
                  margin={{ top: 20, right: 10, left: 10, bottom: 60 }}
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
                  <Bar 
                    dataKey="value" 
                    radius={[4, 4, 0, 0]}
                    onClick={handleBarClick}
                    cursor="pointer"
                  >
                    {barChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Analysis - Mobile Optimized */}
      <Card>
        <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-base sm:text-lg">Analyse budgétaire</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
          <div className="space-y-2 sm:space-y-3 max-h-80 overflow-y-auto">
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