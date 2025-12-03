import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

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

  const { chartData, totalExpenses } = useMemo(() => {
    const monthStart = startDate;
    const monthEnd = endDate;
    
    const monthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= monthEnd && t.type === 'expense' && t.include_in_stats !== false;
    });

    const categoryTotals = new Map<string, number>();
    
    monthTransactions.forEach(t => {
      const catName = t.category?.name || 'Unknown';
      categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + t.amount);
    });

    const total = Array.from(categoryTotals.values()).reduce((sum, val) => sum + val, 0);
    
    const data = Array.from(categoryTotals.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: total > 0 ? (value / total * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => b.value - a.value);

    return { chartData: data, totalExpenses: total };
  }, [transactions, startDate, endDate]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium mb-1">{payload[0].name}</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-semibold">{formatCurrency(payload[0].value)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Share:</span>
              <span className="font-semibold">{payload[0].payload.percentage}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <Card className="border-border bg-card">
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
    <Card className="border-border bg-card">
      <CardContent className="p-3 sm:p-4 md:p-6">
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
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Dépenses</div>
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
            </div>
          </div>

          <div className="mt-4 sm:mt-6 w-full space-y-1.5 sm:space-y-2">
            {chartData.slice(0, 5).map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                  <div 
                    className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-foreground truncate">{item.name}</span>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="font-semibold">{formatCurrency(item.value)}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">{item.percentage}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
