import { useMemo, useState, useEffect } from "react";
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
import { cn } from "@/lib/utils";

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
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const chartData = useMemo(() => {
    // Sort by value descending and take top categories
    const sorted = [...data]
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
    
    // Calculate waterfall values (base = previous cumulative, value = current amount)
    let cumulative = 0;
    return sorted.map(item => {
      const base = cumulative;
      cumulative += item.value;
      return {
        ...item,
        base, // invisible bar to position the value bar
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
        <div className={cn(
          "bg-popover/95 backdrop-blur-md border border-border/50 rounded-xl shadow-2xl p-3 sm:p-4",
          "animate-scale-in"
        )}>
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/30">
            <div 
              className="w-3 h-3 rounded-full shadow-sm" 
              style={{ backgroundColor: data.color }}
            />
            <p className="text-xs sm:text-sm font-semibold text-foreground">{data.name}</p>
          </div>
          <div className="space-y-1.5 text-[10px] sm:text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Montant:</span>
              <span className="font-bold text-foreground">{formatCurrency(data.value)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Cumul:</span>
              <span className="font-bold text-primary">{formatCurrency(data.cumulative)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Part:</span>
              <span className="font-medium text-muted-foreground">{data.percentage.toFixed(1)}%</span>
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
    <div className={cn(
      "space-y-3 sm:space-y-4 transition-all duration-500",
      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
    )}>
      {title && (
        <h3 className="text-xs sm:text-sm font-semibold text-foreground">{title}</h3>
      )}
      
      <div className="w-full" style={{ height: isMobile ? 240 : 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ 
              top: 15, 
              right: isMobile ? 15 : 25, 
              left: isMobile ? -10 : 5, 
              bottom: isMobile ? 65 : 55 
            }}
          >
            <XAxis 
              dataKey="displayName"
              tick={{ 
                fontSize: isMobile ? 9 : 11, 
                fill: 'hsl(var(--foreground))'
              }}
              axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              tickLine={false}
              height={isMobile ? 60 : 50}
              interval={0}
              angle={-45}
              textAnchor="end"
            />
            <YAxis 
              tickFormatter={(value) => {
                if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                return value.toString();
              }}
              tick={{ fontSize: isMobile ? 10 : 12, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={isMobile ? 40 : 50}
            />
            <Tooltip 
              content={<CustomTooltip />} 
              cursor={{ fill: 'hsl(var(--primary)/0.08)', radius: 4 }}
              animationDuration={200}
            />
            {/* Invisible base bar for waterfall positioning */}
            <Bar 
              dataKey="base" 
              stackId="waterfall"
              fill="transparent"
              radius={0}
            />
            {/* Visible value bar with animation */}
            <Bar 
              dataKey="value" 
              stackId="waterfall"
              radius={[6, 6, 0, 0]}
              maxBarSize={isMobile ? 45 : 60}
              animationBegin={0}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  fillOpacity={0.9}
                  className="transition-opacity duration-200 hover:opacity-100"
                  style={{ 
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                  }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary with better styling */}
      <div className="flex items-center justify-between pt-2 sm:pt-3 border-t border-border/50">
        <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">
          {chartData.length} catégorie{chartData.length > 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] sm:text-xs text-muted-foreground">Total:</span>
          <span className="text-sm sm:text-base font-bold text-foreground bg-muted/50 px-2 py-0.5 rounded-md">
            {formatCurrency(totalAmount)}
          </span>
        </div>
      </div>
    </div>
  );

  if (!showCard) {
    return chartContent;
  }

  return (
    <Card className={cn(
      "border-border bg-card/80 backdrop-blur-sm shadow-sm",
      "transition-all duration-300 hover:shadow-md"
    )}>
      <CardContent className="p-3 sm:p-5">
        {chartContent}
      </CardContent>
    </Card>
  );
}
