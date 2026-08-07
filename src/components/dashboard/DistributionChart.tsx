import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useSpecialBudgets } from "@/hooks/useSpecialBudgets";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { TOOLTIP_CLASS } from "@/lib/chartConfig";
import { getTxDate } from "@/lib/dateUtils";
import { getSpecialBudgetIcon } from "@/lib/specialBudgetUtils";

interface DistributionChartProps {
  startDate: Date;
  endDate: Date;
}

/**
 * Colour for a slice with nothing of its own — an uncategorised expense, or
 * a special budget saved without one. `--chart-9` is the ramp's neutral
 * stone, so "no colour" reads as absence rather than as a loud category, and
 * it follows the theme instead of being a fixed sRGB value.
 */
const UNCLASSIFIED_COLOR = "hsl(var(--chart-9))";

/** Donut geometry, straight off the design: 158px disc, 20px ring. */
const DONUT_SIZE = 158;
const DONUT_THICKNESS = 20;
const DONUT_OUTER = "100%";
const DONUT_INNER = `${(((DONUT_SIZE - DONUT_THICKNESS * 2) / DONUT_SIZE) * 100).toFixed(1)}%`;

/**
 * Spending by category — donut + ranked list.
 * Modeled on the deck design's `<Categories>` component: total in the donut
 * center, top 5 categories listed on the right with a per-row mini progress
 * bar tinted to the category color.
 */
export function DistributionChart({ startDate, endDate }: DistributionChartProps) {
  const { t } = useTranslation();
  const { transactions } = useFinancialData();
  const { specialBudgets } = useSpecialBudgets();
  const { formatCurrency, preferences } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const [activeName, setActiveName] = useState<string | null>(null);

  const dateOf = (txn: any) => getTxDate(txn, preferences.dateType);

  const { items, total } = useMemo(() => {
    const budgetMap = new Map(specialBudgets.map((sb) => [sb.id, sb]));

    const inRange = transactions.filter((t) => {
      if (t.type !== "expense") return false;
      const d = dateOf(t);
      if (d < startDate || d > endDate) return false;
      // Expenses linked to a special budget are always shown in the donut
      // under their own category, even when they are excluded from regular
      // stats. Regular expenses still follow the stats toggle.
      return t.include_in_stats !== false || t.special_budget_id;
    });

    const totals = new Map<
      string,
      { amount: number; color: string; icon: string | null; specialBudgetIcon: ReturnType<typeof getSpecialBudgetIcon> | null }
    >();
    for (const tx of inRange) {
      // Settling an advance is not spending. Special-budget rows stay (the
      // donut shows them under their own envelope) but a repayment never
      // belonged in any slice.
      if (tx.repayment_of_transaction_id) continue;
      const net = tx.amount - (tx.refunded_amount || 0);
      // Signed, not floored: a category that ended net-positive has to be
      // able to shrink the donut, and flooring inflated the centre total so
      // every *other* slice's percentage was wrong too.
      if (net === 0) continue;

      const sb = tx.special_budget_id ? budgetMap.get(tx.special_budget_id) : null;
      let name: string;
      let color: string;
      let icon: string | null;
      let specialBudgetIcon: ReturnType<typeof getSpecialBudgetIcon> | null;
      if (sb) {
        name = sb.name;
        color = sb.color || UNCLASSIFIED_COLOR;
        icon = null;
        specialBudgetIcon = getSpecialBudgetIcon(sb.icon);
      } else {
        name = tx.category?.name || t("common.uncategorized", { defaultValue: "Uncategorized" });
        color = tx.category?.color || UNCLASSIFIED_COLOR;
        icon = tx.category?.icon ?? null;
        specialBudgetIcon = null;
      }

      const existing = totals.get(name);
      totals.set(name, {
        amount: (existing?.amount || 0) + net,
        color: existing?.color || color,
        icon: existing?.icon ?? icon,
        specialBudgetIcon: existing?.specialBudgetIcon ?? specialBudgetIcon,
      });
    }

    // The centre total keeps every category, signed, so it agrees with the
    // Expenses tile above it. The drawn slices cannot: an arc has no
    // negative length, so a category that got back more than it spent is
    // left out of the ring rather than rendered as a phantom positive.
    const sum = [...totals.values()].reduce((s, v) => s + v.amount, 0);
    const list = [...totals.entries()]
      .map(([name, v]) => ({ name, value: v.amount, color: v.color, icon: v.icon, specialBudgetIcon: v.specialBudgetIcon }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    return { items: list, total: sum };
  }, [transactions, specialBudgets, startDate, endDate, preferences.dateType, t]);

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

  const activeItem = activeName ? items.find((x) => x.name === activeName) ?? null : null;

  if (items.length === 0) {
    return (
      <div className="ft-card flex flex-col">
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
    <div className="ft-card flex flex-col">
      <div className="ft-card-head">
        <div>
          <h3 className="ft-card-title">
            {t("dashboard.distribution", { defaultValue: "Spending by category" })}
          </h3>
          <p className="ft-card-sub">
            <span className={`font-mono ${isPrivacyMode ? "ft-priv" : ""}`}>
              {formatCurrency(total)}
            </span>
            {" "}
            {t("dashboard.thisPeriod", { defaultValue: "this period" })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* Donut. The centre is the readout: it holds the period total until
            a slice is hovered, then swaps to that slice's figure and name —
            so the ring never needs a legend of its own. */}
        <div
          className="relative mx-auto sm:mx-0 flex-shrink-0"
          style={{ width: DONUT_SIZE, height: DONUT_SIZE }}
        >
          <ResponsiveContainer width="100%" height="100%">
            {/* Zero margin so the ring's outer edge really is size/2 — the
                default 5px inset would shrink the 20px band to 18.7px. */}
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={items}
                cx="50%"
                cy="50%"
                innerRadius={DONUT_INNER}
                outerRadius={DONUT_OUTER}
                paddingAngle={0.6}
                cornerRadius={DONUT_THICKNESS / 2}
                dataKey="value"
                onMouseEnter={(_, idx) => setActiveName(items[idx]?.name ?? null)}
                onMouseLeave={() => setActiveName(null)}
              >
                {items.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={activeName && activeName !== entry.name ? 0.3 : 1}
                    style={{ transition: "opacity 0.15s ease-out", cursor: "pointer" }}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 50, outline: "none" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 grid place-items-center pointer-events-none text-center px-4">
            <div>
              <div
                className={`font-mono font-medium tracking-[-0.03em] ${
                  activeItem ? "text-[17px]" : "text-[20px]"
                } ${isPrivacyMode ? "ft-priv" : ""}`}
              >
                {formatCurrency(activeItem ? activeItem.value : total)}
              </div>
              <div className="text-[10.5px] font-semibold text-fg-mute mt-0.5 truncate max-w-full">
                {activeItem
                  ? activeItem.name
                  : t("dashboard.thisPeriod", { defaultValue: "this period" })}
              </div>
            </div>
          </div>
        </div>

        {/* Ranked list — flat swatch, name, amount. The bar variant belongs
            to the Transactions page; on Accueil the ring already carries the
            proportions. */}
        <div className="flex flex-col min-w-0 flex-1 basis-[180px]">
          {top.map((item) => {
            const isActive = activeName === item.name;
            return (
              <div
                key={item.name}
                onMouseEnter={() => setActiveName(item.name)}
                onMouseLeave={() => setActiveName(null)}
                className={`ft-catrow border-t border-line-soft first:border-t-0 transition-colors ${
                  isActive ? "bg-bg-subtle/60" : ""
                }`}
                style={{ paddingTop: 6, paddingBottom: 6 }}
              >
                <span className="flex items-center gap-2 min-w-0 text-[12.5px] font-[550]">
                  <i className="ft-swatch" style={{ background: item.color }} />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className={`font-mono text-[12.5px] whitespace-nowrap ${isPrivacyMode ? "ft-priv" : ""}`}>
                  {formatCurrency(item.value)}
                </span>
              </div>
            );
          })}
          {otherCount > 0 && (
            <div className="flex items-center justify-between text-[11.5px] text-fg-dim mt-2 pt-2 border-t border-line-soft">
              <span>
                {t("dashboard.othersMore", {
                  defaultValue: "+ {{count}} more",
                  count: otherCount,
                })}
              </span>
              <span className={`font-mono ${isPrivacyMode ? "ft-priv" : ""}`}>
                {formatCurrency(otherValue)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
