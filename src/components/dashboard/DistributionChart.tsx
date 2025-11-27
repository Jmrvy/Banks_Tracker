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
      return date >= monthStart && date <= monthEnd && t.type === 'expense';
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
        <CardContent className="p-6">
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold mb-2">Distribution</h3>
            <p className="text-sm text-muted-foreground">Aucune dépense ce mois-ci</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Distribution</h3>
        </div>
        
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-[280px]">
            <ResponsiveContainer width="100%" height={280}>
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
              <div className="text-xs text-muted-foreground mb-1">Sum outflows</div>
              <div className="text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
            </div>
          </div>

          <div className="mt-6 w-full space-y-2">
            {chartData.slice(0, 5).map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-foreground">{item.name}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(item.value)}</div>
                  <div className="text-xs text-muted-foreground">{item.percentage}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
