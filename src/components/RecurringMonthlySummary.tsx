import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFinancialData, RecurringTransaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface CategoryAgg {
  name: string;
  color: string;
  amt: number;
  count: number;
}

/**
 * Recurring monthly summary — KPI tile + stacked-segment bar + category breakdown list.
 * Pairs with the existing RecurringCalendar to match the deck deep-dive layout.
 */
export function RecurringMonthlySummary() {
  const { t } = useTranslation();
  const { recurringTransactions, categories } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const { monthlyOut, monthlyIn, count, breakdown } = useMemo(() => {
    const active = recurringTransactions.filter((rt) => rt.is_active);

    // Convert each recurring transaction to a monthly amount
    const monthly = (rt: RecurringTransaction) => {
      switch (rt.recurrence_type) {
        case "daily":
          return rt.amount * 30;
        case "weekly":
          return rt.amount * 52 / 12;
        case "monthly":
          return rt.amount;
        case "quarterly":
          return rt.amount / 3;
        case "yearly":
          return rt.amount / 12;
        default:
          return rt.amount;
      }
    };

    const out = active.filter((rt) => rt.type === "expense");
    const inc = active.filter((rt) => rt.type === "income");

    const totalOut = out.reduce((s, rt) => s + monthly(rt), 0);
    const totalIn = inc.reduce((s, rt) => s + monthly(rt), 0);

    // Aggregate expenses by category
    const map = new Map<string, CategoryAgg>();
    const fallback: CategoryAgg = {
      name: t("common.uncategorized", { defaultValue: "Uncategorized" }),
      color: "#90A4AE",
      amt: 0,
      count: 0,
    };
    for (const rt of out) {
      const catId = rt.category_id;
      const cat = catId ? categories.find((c) => c.id === catId) : null;
      const key = cat ? cat.id : "_none";
      const existing = map.get(key);
      const amt = monthly(rt);
      if (existing) {
        existing.amt += amt;
        existing.count += 1;
      } else {
        map.set(key, {
          name: cat?.name ?? fallback.name,
          color: cat?.color ?? fallback.color,
          amt,
          count: 1,
        });
      }
    }
    const breakdown = [...map.values()].sort((a, b) => b.amt - a.amt);

    return {
      monthlyOut: totalOut,
      monthlyIn: totalIn,
      count: active.length,
      breakdown,
    };
  }, [recurringTransactions, categories, t]);

  if (count === 0) return null;

  const totalBar = breakdown.reduce((s, c) => s + c.amt, 0) || 1;

  return (
    <div className="flex flex-col gap-3">
      {/* Monthly summary tile */}
      <div className="ft-card p-5">
        <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
          {t("recurring.thisMonth", { defaultValue: "This month" })}
        </div>
        <div className="font-mono text-3xl font-medium tracking-tight mt-1.5">
          {formatCurrency(monthlyOut)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {t("recurring.outflowSubtitle", {
            defaultValue: "{{n}} active charges",
            n: count,
          })}
          {monthlyIn > 0 && (
            <>
              {" · "}
              <span className="text-pos">+{formatCurrency(monthlyIn)} in</span>
            </>
          )}
        </div>
        {breakdown.length > 0 && (
          <div className="flex h-1.5 rounded overflow-hidden mt-3 bg-bg-subtle">
            {breakdown.map((c, i) => (
              <div
                key={i}
                style={{ flex: c.amt, background: c.color }}
                title={`${c.name}: ${formatCurrency(c.amt)}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Category breakdown list */}
      <div className="ft-card-flush flex flex-col">
        <div className="px-5 py-4 border-b border-line">
          <h3 className="ft-card-title">
            {t("recurring.byCategory", { defaultValue: "By category" })}
          </h3>
          <p className="ft-card-sub">
            {t("recurring.whereGoing", { defaultValue: "Where it's going" })}
          </p>
        </div>
        <div>
          {breakdown.slice(0, 6).map((c, i) => {
            const pct = c.amt / totalBar;
            return (
              <div
                key={i}
                className={`px-5 py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 ${
                  i < Math.min(5, breakdown.length - 1) ? "border-b border-line" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                    style={{ background: c.color }}
                  />
                  <span className="text-[13px] font-medium truncate">{c.name}</span>
                  <span className="text-[11px] text-fg-dim">{c.count}</span>
                </div>
                <div className="font-mono text-[13px] font-medium">
                  {formatCurrency(c.amt)}
                </div>
                <div className="col-span-2 ft-progress-track">
                  <div
                    className="ft-progress-fill"
                    style={{ width: `${pct * 100}%`, background: c.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
