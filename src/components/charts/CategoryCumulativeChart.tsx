import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  ResponsiveContainer, 
  Tooltip,
  Cell
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

interface CategoryData {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

interface CategoryCumulativeChartProps {
  data: CategoryData[];
  title?: string;
  formatCurrency: (amount: number) => string;
  showCard?: boolean;
}

export function CategoryCumulativeChart({ 
  data, 
  title = "Cumul par catégorie",
  formatCurrency,
  showCard = true
}: CategoryCumulativeChartProps) {
  const isMobile = useIsMobile();

  const chartData = useMemo(() => {
    // Sort by value descending and take top categories
    const sorted = [...data]
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
    
    // Calculate cumulative values
    let cumulative = 0;
    return sorted.map(item => {
      cumulative += item.value;
      return {
        ...item,
        cumulative,
        displayName: item.name.length > (isMobile ? 8 : 12) 
          ? item.name.slice(0, isMobile ? 8 : 12) + '...' 
          : item.name
      };
    });
  }, [data, isMobile]);

  const totalAmount = chartData.length > 0 ? chartData[chartData.length - 1]?.cumulative || 0 : 0;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-2.5 sm:p-3">
          <p className="text-xs sm:text-sm font-medium mb-1.5">{data.name}</p>
          <div className="space-y-1 text-[10px] sm:text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Montant:</span>
              <span className="font-semibold">{formatCurrency(data.value)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Cumul:</span>
              <span className="font-semibold text-primary">{formatCurrency(data.cumulative)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Part:</span>
              <span className="font-semibold">{data.percentage.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return null;
  }

  const chartContent = (
    <div className="space-y-2 sm:space-y-3">
      {title && (
        <h3 className="text-xs sm:text-sm font-semibold text-foreground">{title}</h3>
      )}
      
      <div className="w-full" style={{ height: isMobile ? 200 : 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ 
              top: 5, 
              right: isMobile ? 50 : 70, 
              left: isMobile ? 60 : 80, 
              bottom: 5 
            }}
          >
            <XAxis 
              type="number"
              tickFormatter={(value) => {
                if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                return value.toString();
              }}
              tick={{ fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
            />
            <YAxis 
              type="category" 
              dataKey="displayName"
              tick={{ fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--foreground))' }}
              axisLine={false}
              tickLine={false}
              width={isMobile ? 55 : 75}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.3)' }} />
            <Bar 
              dataKey="cumulative" 
              radius={[0, 4, 4, 0]}
              maxBarSize={isMobile ? 20 : 28}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between pt-1 sm:pt-2 border-t border-border/50">
        <span className="text-[10px] sm:text-xs text-muted-foreground">
          {chartData.length} catégorie{chartData.length > 1 ? 's' : ''}
        </span>
        <div className="text-right">
          <span className="text-[10px] sm:text-xs text-muted-foreground mr-1.5">Total:</span>
          <span className="text-xs sm:text-sm font-bold text-foreground">{formatCurrency(totalAmount)}</span>
        </div>
      </div>
    </div>
  );

  if (!showCard) {
    return chartContent;
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-3 sm:p-4">
        {chartContent}
      </CardContent>
    </Card>
  );
}
