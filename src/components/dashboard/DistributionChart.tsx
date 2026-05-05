import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { CHART_COLORS, TOOLTIP_CLASS } from "@/lib/chartConfig";
import { parseLocalDate } from "@/lib/dateUtils";

interface DistributionChartProps {
  startDate: Date;
  endDate: Date;
}

/**
 * Spending by category — donut + ranked list.
 * Modeled on the deck design's `<Categories>` component: total in the donut
 * center, top 5 categories listed on the right with a per-row mini progress
 * bar tinted to the category color.
 */
export function DistributionChart({ startDate, endDate }: DistributionChartProps) {
  const { t } = useTranslation();
  const { transactions } = useFinancialData();
  const { formatCurrency, preferences } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const [activeName, setActiveName] = useState<string | null>(null);

  const dateOf = (txn: any) =>
    preferences.dateType === "value"
      ? parseLocalDate(txn.value_date || txn.transaction_date)
      : parseLocalDate(txn.transaction_date);

  const { items, total } = useMemo(() => {
    const inRange = transactions.filter((t) => {
      if (t.type !== "expense" || t.include_in_stats === false) return false;
      const d = dateOf(t);
      return d >= startDate && d <= endDate;
    });

    const totals = new Map<string, { amount: number; color: string }>();
    for (const tx of inRange) {
      const refunded = tx.refunded_amount || 0;
      const net = Math.max(0, tx.amount - refunded);
      if (net <= 0) continue;
      const name = tx.category?.name || t("common.uncategorized", { defaultValue: "Uncategorized" });
      const color = tx.category?.color || CHART_COLORS[0];
      const existing = totals.get(name);
      totals.set(name, {
        amount: (existing?.amount || 0) + net,
        color: existing?.color || color,
      });
    }

    const sum = [...totals.values()].reduce((s, v) => s + v.amount, 0);
    const list = [...totals.entries()]
      .map(([name, v]) => ({ name, value: v.amount, color: v.color }))
      .sort((a, b) => b.value - a.value);

    return { items: list, total: sum };
  }, [transactions, startDate, endDate, preferences.dateType, t]);

  const top = items.slice(0, 5);
  const otherCount = items.length - top.length;
  const otherValue = items.slice(5).reduce((s, x) => s + x.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const pct = total > 0 ? (d.value / total) * 100 : 0;
    return (
      <div className={TOOLTIP_CLASS}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
          <p className="font-semibold truncate">{d.name}</p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{t("dashboard.amountLabel")}</span>
          <span className="font-mono font-semibold">{formatCurrency(d.value)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{t("dashboard.shareLabel")}</span>
          <span className="font-mono font-medium">{pct.toFixed(1)}%</span>
        </div>
      </div>
    );
  };

  if (items.length === 0) {
    return (
      <div className="ft-card p-5 md:p-6 flex flex-col">
        <div className="ft-card-head">
          <div>
            <h3 className="ft-card-title">
              {t("dashboard.distribution", { defaultValue: "Spending by category" })}
            </h3>
          </div>
        </div>
        <div className="text-center py-8 text-sm text-muted-foreground">
          {t("dashboard.noExpensesThisPeriod", { defaultValue: "No expenses in this period" })}
        </div>
      </div>
    );
  }

  return (
    <div className="ft-card p-5 md:p-6 flex flex-col">
      <div className="ft-card-head">
        <div>
          <h3 className="ft-card-title">
            {t("dashboard.distribution", { defaultValue: "Spending by category" })}
          </h3>
          <p className="ft-card-sub">
            <span className={`font-mono ${isPrivacyMode ? "blur-sm select-none" : ""}`}>
              {formatCurrency(total)}
            </span>
            {" "}
            {t("dashboard.thisPeriod", { defaultValue: "this period" })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-4 sm:gap-5 items-center">
        {/* Donut with total in the center — fixed-width column avoids the
            CSS-grid `auto` + `w-full` chicken-and-egg that collapsed to 0. */}
        <div className="relative w-[180px] sm:w-[200px] h-[180px] sm:h-[200px] mx-auto">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={items}
                cx="50%"
                cy="50%"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
                dataKey="value"
                onMouseEnter={(_, idx) => setActiveName(items[idx]?.name ?? null)}
                onMouseLeave={() => setActiveName(null)}
              >
                {items.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={activeName && activeName !== entry.name ? 0.35 : 1}
                    style={{ transition: "opacity 0.2s ease-out", cursor: "pointer" }}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
            <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
              {t("common.expenses", { defaultValue: "Expenses" })}
            </div>
            <div className={`font-mono text-lg font-medium tracking-tight mt-0.5 truncate max-w-full ${isPrivacyMode ? "blur-md select-none" : ""}`}>
              {formatCurrency(total)}
            </div>
          </div>
        </div>

        {/* Ranked list */}
        <div className="flex flex-col min-w-0">
          {top.map((item) => {
            const pct = total > 0 ? (item.value / total) * 100 : 0;
            const isActive = activeName === item.name;
            return (
              <div
                key={item.name}
                onMouseEnter={() => setActiveName(item.name)}
                onMouseLeave={() => setActiveName(null)}
                className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-2 border-b border-line last:border-b-0 transition-colors ${
                  isActive ? "bg-bg-subtle/60" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[13px] font-medium truncate">{item.name}</span>
                </div>
                <div className={`font-mono text-[13px] font-medium whitespace-nowrap ${isPrivacyMode ? "blur-sm select-none" : ""}`}>
                  {formatCurrency(item.value)}
                </div>
                <div className="col-span-2 ft-progress-track">
                  <div
                    className="ft-progress-fill"
                    style={{ width: `${pct}%`, background: item.color }}
                  />
                </div>
              </div>
            );
          })}
          {otherCount > 0 && (
            <div className="flex items-center justify-between text-[11.5px] text-fg-dim mt-2 pt-2 border-t border-line">
              <span>
                {t("dashboard.othersMore", {
                  defaultValue: "+ {{count}} more",
                  count: otherCount,
                })}
              </span>
              <span className={`font-mono ${isPrivacyMode ? "blur-sm select-none" : ""}`}>
                {formatCurrency(otherValue)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
