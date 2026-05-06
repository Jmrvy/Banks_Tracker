import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  isWithinInterval,
  format,
} from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { TOOLTIP_CLASS, AXIS_TICK, GRID_PROPS, formatAxisValue } from "@/lib/chartConfig";
import { parseLocalDate } from "@/lib/dateUtils";

interface CashflowChartProps {
  /** Period range — kept for API compatibility, but the chart always shows the trailing 6 months. */
  startDate?: Date;
  endDate?: Date;
}

/**
 * Cash flow chart — paired Income vs Expenses bars by month for the last 6
 * months. Modeled on the deck design's `<Cashflow>` component (refund-adjusted
 * expenses, transfer fees rolled into expenses, transfers themselves excluded).
 */
export function CashflowChart({ startDate: _start, endDate: _end }: CashflowChartProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "fr" ? fr : enUS;
  const { transactions } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  // Build last 6 months (oldest → newest) with income + expense aggregates.
  const data = useMemo(() => {
    const today = new Date();
    const months: { key: string; label: string; from: Date; to: Date; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = subMonths(today, i);
      const from = startOfMonth(ref);
      const to = endOfMonth(ref);
      months.push({
        key: format(from, "yyyy-MM"),
        label: format(from, "MMM", { locale: dateLocale }),
        from,
        to,
        income: 0,
        expense: 0,
      });
    }
    for (const tx of transactions) {
      if (tx.include_in_stats === false) continue;
      const d =
        preferences.dateType === "value"
          ? parseLocalDate(tx.value_date || tx.transaction_date)
          : parseLocalDate(tx.transaction_date);
      const m = months.find((x) => isWithinInterval(d, { start: x.from, end: x.to }));
      if (!m) continue;
      if (tx.type === "income" && !tx.refund_of_transaction_id) {
        m.income += tx.amount;
      } else if (tx.type === "expense") {
        m.expense += Math.max(0, tx.amount - (tx.refunded_amount || 0));
      } else if (tx.type === "transfer" && tx.transfer_fee) {
        m.expense += Number(tx.transfer_fee);
      }
    }
    return months;
  }, [transactions, dateLocale, preferences.dateType]);

  const stats = useMemo(() => {
    const last = data[data.length - 1] || { income: 0, expense: 0 };
    const totalIncome = data.reduce((s, m) => s + m.income, 0);
    const totalExpense = data.reduce((s, m) => s + m.expense, 0);
    const monthsWithExpense = data.filter((m) => m.expense > 0).length;
    return {
      netThisMonth: last.income - last.expense,
      avgSpend: monthsWithExpense > 0 ? totalExpense / monthsWithExpense : 0,
      spendRatio: totalIncome > 0 ? totalExpense / totalIncome : 0,
    };
  }, [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const income = payload.find((p: any) => p.dataKey === "income")?.value ?? 0;
    const expense = payload.find((p: any) => p.dataKey === "expense")?.value ?? 0;
    const net = income - expense;
    return (
      <div className={TOOLTIP_CLASS}>
        <p className="font-medium mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-pos">{t("dashboard.incoming", { defaultValue: "Income" })}</span>
            <span className="font-mono font-semibold text-pos">+{formatCurrency(income)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-destructive">{t("dashboard.outgoing", { defaultValue: "Expenses" })}</span>
            <span className="font-mono font-semibold text-destructive">−{formatCurrency(expense)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-line">
            <span className="text-muted-foreground">{t("dashboard.net", { defaultValue: "Net" })}</span>
            <span className={`font-mono font-semibold ${net >= 0 ? "text-pos" : "text-destructive"}`}>
              {net >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(net))}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="ft-card p-5 md:p-6 flex flex-col">
      <div className="ft-card-head">
        <div>
          <h3 className="ft-card-title">{t("dashboard.cashflow", { defaultValue: "Cash flow" })}</h3>
          <p className="ft-card-sub">
            {t("dashboard.cashflowSub", { defaultValue: "Income vs expenses · last 6 months" })}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-pos" />
            {t("dashboard.incoming", { defaultValue: "Income" })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-destructive" />
            {t("dashboard.outgoing", { defaultValue: "Expenses" })}
          </span>
        </div>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 ${isPrivacyMode ? "blur-md select-none" : ""}`}>
        {/* Stat column */}
        <div className="flex sm:flex-col flex-row sm:gap-4 gap-3 sm:min-w-[140px] flex-wrap">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
              {t("dashboard.netThisMonth", { defaultValue: "Net this month" })}
            </div>
            <div
              className={`font-mono text-base sm:text-lg font-medium tracking-tight mt-0.5 truncate ${
                stats.netThisMonth >= 0 ? "text-pos" : "text-destructive"
              }`}
            >
              {stats.netThisMonth >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(stats.netThisMonth))}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
              {t("dashboard.avgSpend", { defaultValue: "Avg. spend" })}
            </div>
            <div className="font-mono text-base sm:text-lg font-medium tracking-tight mt-0.5 truncate">
              {formatCurrency(stats.avgSpend)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
              {t("dashboard.spendRatio", { defaultValue: "Spend ratio" })}
            </div>
            <div className="font-mono text-base sm:text-lg font-medium tracking-tight mt-0.5">
              {(stats.spendRatio * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[200px] sm:h-[220px] -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxisValue}
                width={40}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "hsl(var(--bg-subtle))", opacity: 0.6 }}
              />
              <Bar dataKey="income" fill="hsl(var(--pos))" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expense" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
