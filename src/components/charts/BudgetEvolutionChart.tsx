import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { startOfMonth, endOfMonth, eachDayOfInterval, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Transaction } from "@/hooks/useFinancialData";
import { CategoryData } from "@/hooks/useReportsData";
import { useIsMobile } from "@/hooks/use-mobile";

interface BudgetEvolutionChartProps {
  categoryChartData: CategoryData[];
  transactions: Transaction[];
  periodStart: Date;
  periodEnd: Date;
  formatCurrency: (n: number) => string;
}

export function BudgetEvolutionChart({
  categoryChartData,
  transactions,
  periodStart,
  periodEnd,
  formatCurrency,
}: BudgetEvolutionChartProps) {
  const isMobile = useIsMobile();

  // Only show categories that have a budget set
  const budgetedCategories = useMemo(
    () => categoryChartData.filter((c) => c.budget > 0),
    [categoryChartData]
  );

  const days = useMemo(
    () => eachDayOfInterval({ start: periodStart, end: periodEnd }),
    [periodStart, periodEnd]
  );

  // Build one data-point per day: { date, [categoryName]: cumulativeSpent }
  const chartData = useMemo(() => {
    // Precompute per-category cumulative spending indexed by date string
    const cumulatives: Record<string, Record<string, number>> = {};

    for (const cat of budgetedCategories) {
      const catTxs = transactions
        .filter(
          (t) =>
            t.type === "expense" &&
            t.include_in_stats !== false &&
            t.category?.name === cat.name
        )
        .sort(
          (a, b) =>
            new Date(a.transaction_date).getTime() -
            new Date(b.transaction_date).getTime()
        );

      let running = 0;
      const byDate: Record<string, number> = {};

      for (const day of days) {
        const dayStr = format(day, "yyyy-MM-dd");
        const dayTotal = catTxs
          .filter((t) => t.transaction_date === dayStr)
          .reduce((s, t) => s + t.amount, 0);
        running += dayTotal;
        byDate[dayStr] = running;
      }

      cumulatives[cat.name] = byDate;
    }

    return days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const point: Record<string, number | string> = {
        date: format(day, isMobile ? "dd" : "dd MMM", { locale: fr }),
      };
      for (const cat of budgetedCategories) {
        point[cat.name] = cumulatives[cat.name]?.[dayStr] ?? 0;
      }
      return point;
    });
  }, [budgetedCategories, transactions, days, isMobile]);

  if (budgetedCategories.length === 0) return null;

  // Y-axis max: highest budget × 1.15 or highest spend, whichever is larger
  const yMax = Math.max(
    ...budgetedCategories.map((c) => Math.max(c.budget * 1.15, c.spent * 1.05))
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border/50 rounded-lg shadow-xl p-2.5 text-xs max-w-[200px]">
        <p className="font-semibold text-foreground mb-1.5 pb-1 border-b border-border/30">
          {label}
        </p>
        {payload.map((p: any) => {
          const cat = budgetedCategories.find((c) => c.name === p.dataKey);
          const isOver = cat && p.value > cat.budget;
          return (
            <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate text-muted-foreground">{p.dataKey}</span>
              </span>
              <span className={isOver ? "text-destructive font-semibold" : "font-medium"}>
                {formatCurrency(p.value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="border-border bg-card/80 backdrop-blur-sm shadow-sm">
      <CardContent className="p-3 sm:p-5">
        <h3 className="text-[11px] sm:text-sm font-semibold text-foreground mb-3">
          Évolution des dépenses vs budget
        </h3>
        <p className="text-[10px] text-muted-foreground mb-3 -mt-1">
          Lignes pleines = dépenses cumulées · Lignes pointillées = seuil du budget
        </p>
        <div style={{ height: isMobile ? 220 : 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 12, left: isMobile ? -8 : 0, bottom: 8 }}
            >
              <XAxis
                dataKey="date"
                tick={{ fontSize: isMobile ? 9 : 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                interval={isMobile ? 6 : 4}
              />
              <YAxis
                domain={[0, yMax]}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
                tick={{ fontSize: isMobile ? 9 : 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={isMobile ? 32 : 44}
              />
              <Tooltip content={<CustomTooltip />} animationDuration={100} />
              {!isMobile && (
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value) => (
                    <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>
                  )}
                />
              )}

              {/* Spending lines */}
              {budgetedCategories.map((cat) => (
                <Line
                  key={cat.name}
                  type="monotone"
                  dataKey={cat.name}
                  stroke={cat.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  animationDuration={500}
                />
              ))}

              {/* Budget threshold reference lines */}
              {budgetedCategories.map((cat) => (
                <ReferenceLine
                  key={`budget-${cat.name}`}
                  y={cat.budget}
                  stroke={cat.color}
                  strokeDasharray="5 3"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend on mobile */}
        {isMobile && (
          <div className="flex flex-wrap gap-2 mt-2">
            {budgetedCategories.map((cat) => (
              <div key={cat.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: cat.color }} />
                <span>{cat.name}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
