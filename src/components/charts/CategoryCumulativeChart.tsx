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
    // Sort by value descending and limit for mobile
    const sorted = [...data]
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, isMobile ? 6 : 10); // Limit categories on mobile for readability
    
    // Calculate waterfall values (base = previous cumulative, value = current amount)
    let cumulative = 0;
    return sorted.map(item => {
      const base = cumulative;
      cumulative += item.value;
      return {
        ...item,
        base,
        cumulative,
        displayName: item.name.length > (isMobile ? 6 : 12) 
          ? item.name.slice(0, isMobile ? 6 : 12) + '…' 
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
          "bg-popover/95 backdrop-blur-md border border-border/50 rounded-lg shadow-xl",
          "p-2.5 sm:p-3 max-w-[180px] sm:max-w-none",
          "animate-scale-in"
        )}>
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 pb-1.5 border-b border-border/30">
            <div 
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
              style={{ backgroundColor: data.color }}
            />
            <p className="text-[11px] sm:text-sm font-semibold text-foreground truncate">{data.name}</p>
          </div>
          <div className="space-y-1 text-[10px] sm:text-xs">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <span className="text-muted-foreground">Montant:</span>
              <span className="font-bold text-foreground">{formatCurrency(data.value)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <span className="text-muted-foreground">Cumul:</span>
              <span className="font-bold text-primary">{formatCurrency(data.cumulative)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <span className="text-muted-foreground">Part:</span>
              <span className="font-medium">{data.percentage.toFixed(1)}%</span>
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
      "space-y-2.5 sm:space-y-4 transition-all duration-500",
      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
    )}>
      {title && (
        <h3 className="text-[11px] sm:text-sm font-semibold text-foreground">{title}</h3>
      )}
      
      <div className="w-full" style={{ height: isMobile ? 200 : 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ 
              top: 10, 
              right: isMobile ? 8 : 20, 
              left: isMobile ? -15 : 0, 
              bottom: isMobile ? 50 : 45 
            }}
          >
            <XAxis 
              dataKey="displayName"
              tick={{ 
                fontSize: isMobile ? 8 : 11, 
                fill: 'hsl(var(--foreground))'
              }}
              axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              tickLine={false}
              height={isMobile ? 45 : 40}
              interval={0}
              angle={isMobile ? -50 : -45}
              textAnchor="end"
            />
            <YAxis 
              tickFormatter={(value) => {
                if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                return value.toString();
              }}
              tick={{ fontSize: isMobile ? 9 : 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={isMobile ? 32 : 45}
            />
            <Tooltip 
              content={<CustomTooltip />} 
              cursor={{ fill: 'hsl(var(--primary)/0.08)', radius: 4 }}
              animationDuration={150}
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
              radius={[4, 4, 0, 0]}
              maxBarSize={isMobile ? 32 : 55}
              animationBegin={0}
              animationDuration={600}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  fillOpacity={0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary - more compact on mobile */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <span className="text-[9px] sm:text-xs text-muted-foreground">
          {chartData.length} cat.{!isMobile && chartData.length > 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-[9px] sm:text-xs text-muted-foreground">Total:</span>
          <span className="text-xs sm:text-sm font-bold text-foreground bg-muted/50 px-1.5 sm:px-2 py-0.5 rounded">
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
