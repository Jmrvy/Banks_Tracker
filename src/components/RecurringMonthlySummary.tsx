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
          <div className="ft-eyebrow">
            {t("recurring.thisMonth", { defaultValue: "This month" })}
          </div>
          {/* Design's segmented control: the selected chip lifts onto
              --bg-elev with a hairline shadow rather than inverting to ink. */}
          <div
            role="tablist"
            aria-label={t("recurring.modeToggle", { defaultValue: "Calculation mode" })}
            className="ft-seg flex-shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "actual"}
              onClick={() => setMode("actual")}
              className={cn(mode === "actual" && "active")}
            >
              {t("recurring.modeActual", { defaultValue: "Réel" })}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "average"}
              onClick={() => setMode("average")}
              className={cn(mode === "average" && "active")}
            >
              {t("recurring.modeAverage", { defaultValue: "Moyenne" })}
            </button>
          </div>
        </div>
        {/* Card-level figure: 26px Geist Mono at weight 500, -0.03em. */}
        <div className="font-mono text-[26px] font-medium tracking-[-0.03em] leading-tight mt-2.5">
          {formatCurrency(totalOut)}
        </div>
        <div className="text-[12px] text-fg-mute mt-1">
          {t("recurring.outflowSubtitle", {
            defaultValue: "{{n}} active charges",
            n: count,
          })}
          {totalIn > 0 && (
            <>
              {" · "}
              <span className="text-pos">
                {t("recurring.inflowInline", {
                  defaultValue: "+{{amount}} in",
                  amount: formatCurrency(totalIn),
                })}
              </span>
            </>
          )}
        </div>
        <div className="text-[10.5px] text-fg-dim mt-1 leading-snug">{modeNote}</div>
        {breakdown.length > 0 && (
          <div className="flex h-1.5 rounded-[3px] overflow-hidden mt-3 bg-bg-sunk">
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
        <div className="ft-card-head">
          <div>
            <h3 className="ft-card-title">
              {t("recurring.byCategory", { defaultValue: "By category" })}
            </h3>
            <p className="ft-card-sub">
              {t("recurring.whereGoing", { defaultValue: "Where it's going" })}
            </p>
          </div>
        </div>
        <div className="pb-2">
          {breakdown.map((c, i) => {
            const pct = c.amt / totalBar;
            return (
              /* .catrow — 1fr/auto, 5px×10px gaps, hairline in --line-soft,
                 paired with the 4px thin bar the design uses for category
                 breakdowns. */
              <div key={i} className="ft-catrow px-[22px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="ft-swatch"
                    style={{ background: c.color }}
                  />
                  <span className="text-[12.5px] font-[550] truncate">{c.name}</span>
                  <span className="text-[11px] text-fg-dim">{c.count}</span>
                </div>
                <div className="font-mono text-[12.5px] font-medium">
                  {formatCurrency(c.amt)}
                </div>
                <div className="col-span-2 ft-progress-track thin">
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
