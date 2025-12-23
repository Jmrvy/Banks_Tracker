import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { CategoryCumulativeChart } from "@/components/charts/CategoryCumulativeChart";
import { cn } from "@/lib/utils";

const COLORS = [
  'hsl(340, 75%, 60%)', // Pink
  'hsl(38, 70%, 68%)',  // Gold
  'hsl(200, 75%, 60%)', // Blue
  'hsl(150, 65%, 55%)', // Green
  'hsl(280, 70%, 65%)', // Purple
  'hsl(25, 75%, 60%)',  // Orange
  'hsl(210, 15%, 50%)', // Gray
];

interface DistributionChartProps {
  startDate: Date;
  endDate: Date;
}

export function DistributionChart({ startDate, endDate }: DistributionChartProps) {
  const { transactions, categories } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const { chartData, totalExpenses, cumulativeData } = useMemo(() => {
    const monthStart = startDate;
    const monthEnd = endDate;
    
    const monthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= monthEnd && t.type === 'expense' && t.include_in_stats !== false;
    });

    const categoryTotals = new Map<string, { amount: number, color: string }>();
    
    monthTransactions.forEach(t => {
      const catName = t.category?.name || 'Unknown';
      const catColor = t.category?.color || COLORS[0];
      const existing = categoryTotals.get(catName);
      categoryTotals.set(catName, { 
        amount: (existing?.amount || 0) + t.amount,
        color: existing?.color || catColor
      });
    });

    const total = Array.from(categoryTotals.values()).reduce((sum, val) => sum + val.amount, 0);
    
    const data = Array.from(categoryTotals.entries())
      .map(([name, { amount, color }]) => ({
        name,
        value: amount,
        percentage: total > 0 ? (amount / total * 100).toFixed(1) : '0.0',
        color
      }))
      .sort((a, b) => b.value - a.value);

    // Prepare cumulative data
    const cumData = data.map(item => ({
      name: item.name,
      value: item.value,
      color: item.color,
      percentage: total > 0 ? (item.value / total) * 100 : 0
    }));

    return { chartData: data, totalExpenses: total, cumulativeData: cumData };
  }, [transactions, startDate, endDate]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={cn(
          "bg-popover/95 backdrop-blur-md border border-border/50 rounded-xl shadow-2xl p-3 sm:p-4",
          "animate-scale-in"
        )}>
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/30">
            <div 
              className="w-3 h-3 rounded-full shadow-sm" 
              style={{ backgroundColor: data.color }}
            />
            <p className="text-xs sm:text-sm font-semibold text-foreground">{payload[0].name}</p>
          </div>
          <div className="space-y-1.5 text-[10px] sm:text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Montant:</span>
              <span className="font-bold text-foreground">{formatCurrency(payload[0].value)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Part:</span>
              <span className="font-medium text-muted-foreground">{data.percentage}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <Card className="border-border bg-card/80 backdrop-blur-sm">
        <CardContent className="p-3 sm:p-4 md:p-6">
          <div className="text-center py-8 sm:py-12">
            <h3 className="text-base sm:text-lg font-semibold mb-2">Distribution</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Aucune dépense ce mois-ci</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "border-border bg-card/80 backdrop-blur-sm shadow-sm",
      "transition-all duration-300 hover:shadow-md"
    )}>
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className={cn(
          "transition-all duration-500",
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}>
          <div className="mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-semibold">Distribution</h3>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="relative w-full max-w-[220px] sm:max-w-[280px]">
              <ResponsiveContainer width="100%" height={200} className="sm:hidden">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        className="transition-opacity duration-200 hover:opacity-80"
                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              
              <ResponsiveContainer width="100%" height={280} className="hidden sm:block">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="90%"
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        className="transition-opacity duration-200 hover:opacity-80"
                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Dépenses</div>
                <div className="text-lg sm:text-2xl font-bold bg-background/60 backdrop-blur-sm px-2 py-1 rounded-lg">
                  {formatCurrency(totalExpenses)}
                </div>
              </div>
            </div>

            {/* Legend with better styling */}
            <div className="mt-4 sm:mt-6 w-full space-y-2 sm:space-y-2.5">
              {chartData.slice(0, 5).map((item, index) => (
                <div 
                  key={item.name} 
                  className={cn(
                    "flex items-center justify-between text-xs sm:text-sm",
                    "p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-default"
                  )}
                  style={{ 
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                    <div 
                      className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full flex-shrink-0 shadow-sm" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-foreground font-medium truncate">{item.name}</span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2 flex items-center gap-2 sm:gap-3">
                    <span className="font-bold">{formatCurrency(item.value)}</span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
              ))}
              {chartData.length > 5 && (
                <div className="text-center pt-1">
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    +{chartData.length - 5} autres catégories
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Cumulative Chart with separator */}
          {cumulativeData.length > 0 && (
            <div className="mt-5 sm:mt-8 pt-5 border-t border-border/50">
              <CategoryCumulativeChart
                data={cumulativeData}
                title="Cumul des dépenses"
                formatCurrency={formatCurrency}
                showCard={false}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
