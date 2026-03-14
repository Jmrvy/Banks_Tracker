import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Area,
} from "recharts";
import { eachDayOfInterval, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Transaction } from "@/hooks/useFinancialData";
import { CategoryData } from "@/hooks/useReportsData";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserPreferences } from "@/hooks/useUserPreferences";

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
  const { preferences } = useUserPreferences();
  const activeDateType = preferences.dateType;

  const getTransactionDate = (t: Transaction): string => {
    if (activeDateType === 'value') {
      return (t as any).value_date || t.transaction_date;
    }
    return t.transaction_date;
  };

  // Only show categories that have a budget set
  const budgetedCategories = useMemo(
    () => categoryChartData.filter((c) => c.budget > 0),
    [categoryChartData]
  );

  // State for selected category
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>("");

  // Auto-select the first category with budget if none selected
  const selectedCategory = useMemo(() => {
    if (budgetedCategories.length === 0) return null;
    const found = budgetedCategories.find((c) => c.name === selectedCategoryName);
    return found || budgetedCategories[0];
  }, [budgetedCategories, selectedCategoryName]);

  const days = useMemo(
    () => eachDayOfInterval({ start: periodStart, end: periodEnd }),
    [periodStart, periodEnd]
  );

  // Build chart data for the selected category only
  const chartData = useMemo(() => {
    if (!selectedCategory) return [];

    const catTxs = transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.include_in_stats !== false &&
          t.category?.name === selectedCategory.name
      )
      .sort(
        (a, b) =>
          new Date(getTransactionDate(a)).getTime() -
          new Date(getTransactionDate(b)).getTime()
      );

    let running = 0;

    return days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayTotal = catTxs
        .filter((t) => getTransactionDate(t) === dayStr)
        .reduce((s, t) => s + Number(t.amount), 0);
      running += dayTotal;

      return {
        date: format(day, isMobile ? "dd" : "dd MMM", { locale: fr }),
        spent: running,
        budget: Number(selectedCategory.budget),
      };
    });
  }, [selectedCategory, transactions, days, isMobile]);

  if (budgetedCategories.length === 0) return null;

  // Y-axis max based on selected category
  const yMax = selectedCategory
    ? Math.max(Number(selectedCategory.budget) * 1.15, Number(selectedCategory.spent) * 1.05, 100)
    : 100;

  const isOverBudget = selectedCategory && Number(selectedCategory.spent) > Number(selectedCategory.budget);
  const percentUsed = selectedCategory
    ? Math.round((Number(selectedCategory.spent) / Number(selectedCategory.budget)) * 100)
    : 0;
  // Calculate the actual overage or remaining amount
  const overageAmount = selectedCategory
    ? Number(selectedCategory.spent) - Number(selectedCategory.budget)
    : 0;
  const remainingAmount = selectedCategory
    ? Number(selectedCategory.budget) - Number(selectedCategory.spent)
    : 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length || !selectedCategory) return null;
    const spentValue = payload.find((p: any) => p.dataKey === "spent")?.value || 0;
    const isOver = spentValue > selectedCategory.budget;

    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border/50 rounded-lg shadow-xl p-2.5 text-xs">
        <p className="font-semibold text-foreground mb-1.5 pb-1 border-b border-border/30">
          {label}
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Dépensé</span>
            <span className={isOver ? "text-destructive font-semibold" : "font-medium"}>
              {formatCurrency(spentValue)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-medium">{formatCurrency(selectedCategory.budget)}</span>
          </div>
          {isOver && (
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-border/30">
              <span className="text-destructive">Dépassement</span>
              <span className="text-destructive font-semibold">
                +{formatCurrency(spentValue - selectedCategory.budget)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="glass-hover animate-glass-slide-up">
      <CardContent className="p-3 sm:p-5">
        {/* Header with title and selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div>
            <h3 className="text-[11px] sm:text-sm font-semibold text-foreground">
              Évolution des dépenses vs budget
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Suivi journalier du cumul des dépenses
            </p>
          </div>
          <Select
            value={selectedCategory?.name || ""}
            onValueChange={setSelectedCategoryName}
          >
            <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
              <SelectValue placeholder="Sélectionner une catégorie" />
            </SelectTrigger>
            <SelectContent>
              {budgetedCategories.map((cat) => (
                <SelectItem key={cat.name} value={cat.name} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span>{cat.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stats summary for selected category */}
        {selectedCategory && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-2 text-center">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide">
                Budget
              </p>
              <p className="text-xs sm:text-sm font-bold">
                {formatCurrency(selectedCategory.budget)}
              </p>
            </div>
            <div className={`rounded-xl p-2 text-center border ${isOverBudget ? "bg-destructive/5 border-destructive/10" : "bg-white/[0.04] border-white/[0.06]"}`}>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide">
                Dépensé
              </p>
              <p className={`text-xs sm:text-sm font-bold ${isOverBudget ? "text-destructive" : ""}`}>
                {formatCurrency(selectedCategory.spent)}
              </p>
            </div>
            <div className={`rounded-xl p-2 text-center border ${isOverBudget ? "bg-destructive/5 border-destructive/10" : "bg-success/5 border-success/10"}`}>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide">
                {isOverBudget ? "Dépassement" : "Restant"}
              </p>
              <p className={`text-xs sm:text-sm font-bold ${isOverBudget ? "text-destructive" : "text-success"}`}>
                {isOverBudget ? `+${formatCurrency(overageAmount)}` : formatCurrency(remainingAmount)}
              </p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {selectedCategory && (
          <div className="mb-3">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>{percentUsed}% utilisé</span>
              <span>{formatCurrency(selectedCategory.spent)} / {formatCurrency(selectedCategory.budget)}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverBudget ? "bg-destructive" : "bg-success"
                }`}
                style={{ width: `${Math.min(100, percentUsed)}%` }}
              />
            </div>
          </div>
        )}

        {/* Chart */}
        <div style={{ height: isMobile ? 200 : 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 12, left: isMobile ? -8 : 0, bottom: 8 }}
            >
              <defs>
                <linearGradient id="spentGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={selectedCategory?.color || "#8884d8"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={selectedCategory?.color || "#8884d8"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
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

              {/* Budget threshold line */}
              {selectedCategory && (
                <ReferenceLine
                  y={selectedCategory.budget}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Budget: ${formatCurrency(selectedCategory.budget)}`,
                    position: "insideTopRight",
                    fill: "hsl(var(--destructive))",
                    fontSize: isMobile ? 9 : 11,
                  }}
                />
              )}

              {/* Area fill */}
              <Area
                type="monotone"
                dataKey="spent"
                stroke="none"
                fill="url(#spentGradient)"
                animationDuration={500}
              />

              {/* Spending line */}
              <Line
                type="monotone"
                dataKey="spent"
                stroke={selectedCategory?.color || "#8884d8"}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                animationDuration={500}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
