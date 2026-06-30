import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useRecurringCalendarSnapshot } from "@/lib/recurringCalendarMonth";
import { cn } from "@/lib/utils";

interface CategoryAgg {
  name: string;
  color: string;
  amt: number;
  count: number;
}

type Mode = "actual" | "average";

/**
 * Recurring monthly summary — KPI tile + stacked-segment bar + category breakdown list.
 * Both modes consume the calendar's authoritative aggregates:
 *  - "Réel": sum of occurrences in the currently displayed calendar month.
 *  - "Moyenne": sum of occurrences across the displayed year, divided by occurrence count.
 * Same engine, same caps/skips, so the two modes diverge iff per-month amounts vary
 * across the year for that category.
 */
export function RecurringMonthlySummary() {
  const { t } = useTranslation();
  const { recurringTransactions, categories } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  const [mode, setMode] = useState<Mode>("actual");
  const snap = useRecurringCalendarSnapshot();

  const { totalOut, totalIn, count, breakdown, modeNote } = useMemo(() => {
    const active = recurringTransactions.filter((rt) => rt.is_active);

    const sourceBreakdown = mode === "actual" ? snap.actualBreakdown : snap.yearBreakdown;
    const totalIn =
      mode === "actual"
        ? snap.actualInflow
        : snap.yearInflow / Math.max(1, snap.yearInflowCount);

    const fallback: CategoryAgg = {
      name: t("common.uncategorized", { defaultValue: "Uncategorized" }),
      color: "#90A4AE",
      amt: 0,
      count: 0,
    };
    const map = new Map<string, CategoryAgg>();
    for (const entry of sourceBreakdown) {
      const cat = entry.categoryId ? categories.find((c) => c.id === entry.categoryId) : null;
      const key = entry.categoryId ?? "_none";
      const existing = map.get(key);
      if (existing) {
        existing.amt += entry.amount;
        existing.count += entry.count;
      } else {
        map.set(key, {
          name: cat?.name ?? fallback.name,
          color: cat?.color ?? fallback.color,
          amt: entry.amount,
          count: entry.count,
        });
      }
    }

    if (mode === "average") {
      for (const agg of map.values()) {
        agg.amt = agg.amt / Math.max(1, agg.count);
      }
    }

    const breakdown = [...map.values()].sort((a, b) => b.amt - a.amt);
    const totalOut =
      mode === "actual"
        ? snap.actualOutflow
        : breakdown.reduce((sum, c) => sum + c.amt, 0);

    const modeNote =
      mode === "actual"
        ? t("recurring.modeActualNote", {
            defaultValue: "Sum of occurrences this calendar month — matches the calendar.",
          })
        : t("recurring.modeAverageNote", {
            defaultValue: "Mean occurrence amount across {{year}} — sum of occurrences divided by occurrence count.",
            year: snap.month.getFullYear(),
          });

    return {
      totalOut,
      totalIn,
      count: active.length,
      breakdown,
      modeNote,
    };
  }, [recurringTransactions, categories, mode, t, snap]);


  if (count === 0) return null;

  const totalBar = breakdown.reduce((s, c) => s + c.amt, 0) || 1;

  return (
    <div className="flex flex-col gap-3">
      {/* Monthly summary tile */}
      <div className="ft-card p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
            {t("recurring.thisMonth", { defaultValue: "This month" })}
          </div>
          <div
            role="tablist"
            aria-label={t("recurring.modeToggle", { defaultValue: "Calculation mode" })}
            className="inline-flex items-stretch rounded-md border border-line p-0.5 bg-bg-subtle"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "actual"}
              onClick={() => setMode("actual")}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors",
                mode === "actual"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("recurring.modeActual", { defaultValue: "Réel" })}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "average"}
              onClick={() => setMode("average")}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors",
                mode === "average"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("recurring.modeAverage", { defaultValue: "Moyenne" })}
            </button>
          </div>
        </div>
        <div className="font-mono text-3xl font-medium tracking-tight mt-1.5">
          {formatCurrency(totalOut)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {t("recurring.outflowSubtitle", {
            defaultValue: "{{n}} active charges",
            n: count,
          })}
          {totalIn > 0 && (
            <>
              {" · "}
              <span className="text-pos">+{formatCurrency(totalIn)} in</span>
            </>
          )}
        </div>
        <div className="text-[10px] text-fg-dim mt-1 leading-snug">{modeNote}</div>
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
          {breakdown.map((c, i) => {
            const pct = c.amt / totalBar;
            return (
              <div
                key={i}
                className={`px-5 py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 ${
                  i < breakdown.length - 1 ? "border-b border-line" : ""
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
