import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, addMonths, addQuarters, addWeeks, addYears, endOfMonth, isAfter, isBefore, startOfMonth } from "date-fns";
import { useFinancialData, RecurringTransaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useDebts } from "@/hooks/useDebts";
import { getRecurringDisplayAmount, getRecurringEffectiveType } from "@/lib/recurringAmount";
import { parseLocalDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

interface CategoryAgg {
  name: string;
  color: string;
  amt: number;
  count: number;
}

type Mode = "actual" | "average";

function advance(d: Date, type: string): Date {
  switch (type) {
    case "daily": return addDays(d, 1);
    case "weekly": return addWeeks(d, 1);
    case "monthly": return addMonths(d, 1);
    case "quarterly": return addQuarters(d, 1);
    case "yearly": return addYears(d, 1);
    default: return addMonths(d, 1);
  }
}

/** Fast-forward to first occurrence on or after `target` without iterating one step at a time. */
function jumpTo(startDate: Date, type: string, target: Date): Date {
  if (!isBefore(startDate, target)) return startDate;
  let d = startDate;
  let steps = 0;
  const ms = target.getTime() - startDate.getTime();
  const dayMs = 86400000;
  switch (type) {
    case "daily": steps = Math.floor(ms / dayMs) - 1; break;
    case "weekly": steps = Math.floor(ms / (7 * dayMs)) - 1; break;
    case "monthly":
      steps = (target.getFullYear() - startDate.getFullYear()) * 12 + (target.getMonth() - startDate.getMonth()) - 1;
      break;
    case "quarterly":
      steps = Math.floor(((target.getFullYear() - startDate.getFullYear()) * 12 + (target.getMonth() - startDate.getMonth())) / 3) - 1;
      break;
    case "yearly":
      steps = target.getFullYear() - startDate.getFullYear() - 1;
      break;
  }
  if (steps > 0) {
    switch (type) {
      case "daily": d = addDays(d, steps); break;
      case "weekly": d = addWeeks(d, steps); break;
      case "monthly": d = addMonths(d, steps); break;
      case "quarterly": d = addQuarters(d, steps); break;
      case "yearly": d = addYears(d, steps); break;
    }
  }
  let safety = 0;
  while (isBefore(d, target) && safety++ < 5000) d = advance(d, type);
  return d;
}

/**
 * Recurring monthly summary — KPI tile + stacked-segment bar + category breakdown list.
 * Toggle between "Réel ce mois-ci" (sum of occurrences actually falling in the current
 * calendar month — reconciles with the calendar's footer total) and "Moyenne mensuelle"
 * (smoothed monthly-equivalent: yearly/12, quarterly/3, weekly*52/12 …).
 */
export function RecurringMonthlySummary() {
  const { t } = useTranslation();
  const { recurringTransactions, categories } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  const { debts, scheduledPayments } = useDebts();
  const { formatCurrency } = useUserPreferences();

  const [mode, setMode] = useState<Mode>("actual");

  const { totalOut, totalIn, count, breakdown, modeNote } = useMemo(() => {
    const active = recurringTransactions.filter((rt) => rt.is_active);

    const monthEquivAvg = (rt: RecurringTransaction): number => {
      switch (rt.recurrence_type as string) {
        case "daily": return rt.amount * 30;
        case "weekly": return (rt.amount * 52) / 12;
        case "monthly": return rt.amount;
        case "quarterly": return rt.amount / 3;
        case "yearly": return rt.amount / 12;
        default: return rt.amount;
      }
    };

    // Build per-rt amount + effective type for the active mode.
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    type Row = { rt: RecurringTransaction; amount: number; type: "income" | "expense" };
    const rows: Row[] = [];

    for (const rt of active) {
      const effectiveType = getRecurringEffectiveType(rt, installmentPayments ?? []);
      if (mode === "average") {
        rows.push({ rt, amount: monthEquivAvg(rt), type: effectiveType });
        continue;
      }
      // Real-mode: walk occurrences inside [monthStart, monthEnd].
      const startDate = parseLocalDate(rt.start_date);
      const endDate = rt.end_date ? parseLocalDate(rt.end_date) : null;
      if (endDate && isBefore(endDate, monthStart)) continue;
      let d = jumpTo(startDate, rt.recurrence_type as string, monthStart);
      let safety = 0;
      while (!isAfter(d, monthEnd) && safety++ < 200) {
        if (!isBefore(d, monthStart) && (!endDate || !isAfter(d, endDate))) {
          const iso = d.toISOString().substring(0, 10);
          const amt = getRecurringDisplayAmount(
            rt,
            iso,
            installmentPayments ?? [],
            debts ?? [],
            scheduledPayments ?? [],
          );
          rows.push({ rt, amount: amt, type: effectiveType });
        }
        d = advance(d, rt.recurrence_type as string);
      }
    }

    const totalOut = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
    const totalIn = rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);

    const fallback: CategoryAgg = {
      name: t("common.uncategorized", { defaultValue: "Uncategorized" }),
      color: "#90A4AE",
      amt: 0,
      count: 0,
    };
    const map = new Map<string, CategoryAgg>();
    for (const r of rows) {
      if (r.type !== "expense") continue;
      const catId = r.rt.category_id;
      const cat = catId ? categories.find((c) => c.id === catId) : null;
      const key = cat ? cat.id : "_none";
      const existing = map.get(key);
      if (existing) {
        existing.amt += r.amount;
        existing.count += 1;
      } else {
        map.set(key, {
          name: cat?.name ?? fallback.name,
          color: cat?.color ?? fallback.color,
          amt: r.amount,
          count: 1,
        });
      }
    }
    const breakdown = [...map.values()].sort((a, b) => b.amt - a.amt);

    const modeNote =
      mode === "actual"
        ? t("recurring.modeActualNote", {
            defaultValue: "Sum of occurrences this calendar month — matches the calendar.",
          })
        : t("recurring.modeAverageNote", {
            defaultValue: "Smoothed monthly equivalent (yearly/12, quarterly/3, …).",
          });

    return {
      totalOut,
      totalIn,
      count: active.length,
      breakdown,
      modeNote,
    };
  }, [recurringTransactions, categories, installmentPayments, debts, scheduledPayments, mode, t]);

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
