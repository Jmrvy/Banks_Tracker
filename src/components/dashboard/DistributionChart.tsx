import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
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
  const { formatCurrency, preferences } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const [isVisible, setIsVisible] = useState(false);

  const activeDateType = preferences.dateType;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const { chartData, totalExpenses, cumulativeData } = useMemo(() => {
    const monthStart = startDate;
    const monthEnd = endDate;
    
    const monthTransactions = transactions.filter(t => {
      const date = activeDateType === 'value'
        ? new Date(t.value_date || t.transaction_date)
        : new Date(t.transaction_date);
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
  }, [transactions, startDate, endDate, activeDateType]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={cn(
          "bg-popover/95 backdrop-blur-md border border-border/50 rounded-lg shadow-xl",
          "p-2.5 sm:p-3 max-w-[160px] sm:max-w-none",
          "animate-scale-in"
        )}>
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 pb-1.5 border-b border-border/30">
            <div 
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
              style={{ backgroundColor: data.color }}
            />
            <p className="text-[11px] sm:text-sm font-semibold text-foreground truncate">{payload[0].name}</p>
          </div>
          <div className="space-y-1 text-[10px] sm:text-xs">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <span className="text-muted-foreground">Montant:</span>
              <span className="font-bold text-foreground">{formatCurrency(payload[0].value)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <span className="text-muted-foreground">Part:</span>
              <span className="font-medium">{data.percentage}%</span>
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
          <div className="mb-2.5 sm:mb-4">
            <h3 className="text-sm sm:text-lg font-semibold">Distribution</h3>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="relative w-full max-w-[180px] sm:max-w-[280px]">
              <ResponsiveContainer width="100%" height={160} className="sm:hidden">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius="50%"
                    outerRadius="85%"
                    paddingAngle={2}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={600}
                    animationEasing="ease-out"
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              
              <ResponsiveContainer width="100%" height={260} className="hidden sm:block">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="90%"
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={700}
                    animationEasing="ease-out"
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        className="transition-opacity duration-200 hover:opacity-80"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[9px] sm:text-xs text-muted-foreground">Dépenses</div>
                <div className={`text-sm sm:text-xl font-bold ${isPrivacyMode ? "blur-md select-none" : ""}`}>
                  {formatCurrency(totalExpenses)}
                </div>
              </div>
            </div>

            {/* Legend - compact on mobile */}
            <div className="mt-3 sm:mt-5 w-full space-y-1.5 sm:space-y-2">
              {chartData.slice(0, 4).map((item, index) => (
                <div 
                  key={item.name} 
                  className={cn(
                    "flex items-center justify-between text-[11px] sm:text-sm",
                    "p-1.5 sm:p-2 rounded-md bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                    <div 
                      className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-foreground font-medium truncate">{item.name}</span>
                  </div>
                  <div className="flex-shrink-0 ml-1.5 sm:ml-2 flex items-center gap-1.5 sm:gap-2">
                    <span className={`font-bold text-[11px] sm:text-sm ${isPrivacyMode ? "blur-md select-none" : ""}`}>
                      {formatCurrency(item.value)}
                    </span>
                    <span className="text-[9px] sm:text-xs text-muted-foreground">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
              ))}
              {chartData.length > 4 && (
                <div className="text-center">
                  <span className="text-[9px] sm:text-xs text-muted-foreground">
                    +{chartData.length - 4} autres
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Cumulative Chart with separator */}
          {cumulativeData.length > 0 && (
            <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-border/50">
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
