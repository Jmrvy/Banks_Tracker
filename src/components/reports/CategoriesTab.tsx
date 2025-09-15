import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { CategoryData } from "@/hooks/useReportsData";

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
  const formatCurrency = (amount: number) => 
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  if (categoryChartData.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">Aucune dépense trouvée pour cette période</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Dépenses par catégorie</CardTitle>
          <CardDescription>Montants dépensés et budgets alloués</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={categoryChartData} 
                  layout="horizontal"
                  margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number"
                    fontSize={12}
                    tickFormatter={(value) => 
                      value.toLocaleString('fr-FR', { 
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
                    fontSize={12}
                    width={75}
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
                  <Bar dataKey="budget" fill={chartConfig.budget.color} opacity={0.5} />
                  <Bar dataKey="spent" fill={chartConfig.spent.color} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analyse budgétaire</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-80 overflow-y-auto">
            {categoryChartData.map((category, index) => (
              <div key={index} className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="font-medium">{category.name}</span>
                  </div>
                  <Badge variant={category.budget > 0 && category.spent > category.budget ? "destructive" : "secondary"}>
                    {category.budget > 0 ? `${category.percentage}%` : 'Pas de budget'}
                  </Badge>
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dépensé:</span>
                    <span className="font-medium text-red-600">
                      {formatCurrency(category.spent)}
                    </span>
                  </div>
                  {category.budget > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Budget:</span>
                        <span className="font-medium">
                          {formatCurrency(category.budget)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Restant:</span>
                        <span className={cn(
                          "font-medium",
                          category.remaining > 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {formatCurrency(category.remaining)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {category.budget > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={cn(
                        "h-2 rounded-full transition-all",
                        category.spent > category.budget ? "bg-red-500" : "bg-green-500"
                      )}
                      style={{ 
                        width: `${Math.min(100, (category.spent / category.budget) * 100)}%` 
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};