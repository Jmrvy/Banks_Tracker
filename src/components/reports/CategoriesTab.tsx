import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { CategoryData } from "@/hooks/useReportsData";
import { useIsMobile } from "@/hooks/use-mobile";

interface CategoriesTabProps {
  categoryChartData: CategoryData[];
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

export const CategoriesTab = ({ categoryChartData }: CategoriesTabProps) => {
  const isMobile = useIsMobile();
  const formatCurrency = (amount: number) => 
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  // Prépare des valeurs positives pour un rendu fiable
  const chartData = categoryChartData.map((c) => ({
    ...c,
    spent: Math.abs(c.spent),
    budget: Math.abs(c.budget || 0),
  }));

  console.log('Category Chart Data:', chartData);

  // Domaine X stable pour éviter un dataMax à 0
  const chartMax = Math.max(1, ...chartData.map((c) => Math.max(c.spent, c.budget)));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">Aucune dépense trouvée pour cette période</p>
        </CardContent>
      </Card>
    );
  }

  const sortedData = [...chartData].sort((a, b) => b.spent - a.spent);

  return (
    <div className="space-y-4">
      {/* Chart Section - Mobile Optimized */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-base sm:text-lg">Dépenses par catégorie</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Montants dépensés et budgets alloués</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
          <div className="h-[400px] sm:h-80">
            <ChartContainer config={chartConfig} className="w-full h-full">
              <BarChart 
                data={sortedData}
                layout="horizontal"
                margin={{ 
                  top: 5, 
                  right: 10, 
                  left: isMobile ? 70 : 110, 
                  bottom: 5 
                }}
                barCategoryGap={isMobile ? 6 : 8}
                barGap={2}
                barSize={isMobile ? 12 : 16}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                  type="number"
                  fontSize={isMobile ? 10 : 12}
                  domain={[0, chartMax]}
                  tickFormatter={(value) => 
                    isMobile 
                      ? `${(value / 1000).toFixed(0)}k€`
                      : value.toLocaleString('fr-FR', { 
                          style: 'currency', 
                          currency: 'EUR',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        })
                  }
                />
                <YAxis 
                  type="category"
                  dataKey="name" 
                  fontSize={isMobile ? 10 : 12}
                  width={isMobile ? 80 : 120}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <ChartTooltip 
                  content={
                    <ChartTooltipContent 
                      formatter={(value, name) => [
                        typeof value === 'number' 
                          ? formatCurrency(value)
                          : 'N/A',
                        name === 'spent' ? 'Dépensé' : 'Budget'
                      ]}
                    />
                  }
                />
                <ChartLegend 
                  verticalAlign="top" 
                  content={<ChartLegendContent />}
                  iconType="rect"
                  wrapperStyle={{ fontSize: isMobile ? '12px' : '14px' }}
                />
                <Bar dataKey="budget" fill={chartConfig.budget.color} opacity={0.4} radius={2} />
                <Bar dataKey="spent" fill={chartConfig.spent.color} radius={2} />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
};