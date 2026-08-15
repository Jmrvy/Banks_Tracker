import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface CategoryMonth {
  /** `yyyy-MM`, and the identity the parent keys its lookups by. */
  key: string;
  /** Short month name, already localized by the caller. */
  label: string;
  /** Settled spend, net of refunds and offsetting income. */
  actual: number;
  /** Still-to-come scheduled charges falling in this month. */
  forecast: number;
  kind: "past" | "current" | "future";
}

interface Props {
  months: CategoryMonth[];
  /** Monthly cap, or null when the category has none. Drawn as a rule. */
  cap: number | null;
  color: string;
  formatCurrency: (n: number) => string;
  masked?: boolean;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

const BAR_H = 96;

/**
 * A category's spend month by month: what it has cost, what this month has
 * cost so far, and what the schedules say the next few months will cost.
 *
 * The panel used to hold six bare bars of history. They answered "is this
 * category usually this big" and nothing else — no cap to measure against,
 * no current month (the series deliberately started at the previous one),
 * and no view of the charges already committed for the months ahead. Setting
 * a cap meant guessing whether the coming quarter looked like the last one.
 *
 * So the series runs past → present → future in one row, and the three read
 * differently on purpose: settled months are solid, the current month is
 * solid up to today with its remaining schedule hatched on top, and future
 * months are hatched throughout. Hatching is the claim being made — this
 * part has not happened yet.
 *
 * Interaction is a selection, not a hover. Every column is a button and the
 * readout sits above the chart in normal flow, so a finger gets the same
 * affordance a mouse does: tap a month, read it, tap another. A floating
 * tooltip would have needed a hover it never receives and a dismissal it has
 * no gesture for.
 */
export function CategoryMonthsChart({
  months,
  cap,
  color,
  formatCurrency,
  masked,
  t,
}: Props) {
  const currentIndex = Math.max(
    0,
    months.findIndex((m) => m.kind === "current"),
  );
  const [selected, setSelected] = useState<number>(currentIndex);
  const railRef = useRef<HTMLDivElement>(null);

  // The current month moves when the period or the category changes under
  // us; a selection pinned to a stale index would read the wrong bar.
  useEffect(() => setSelected(currentIndex), [currentIndex, months.length]);

  // A cap only stops the bars being comparable if it sits off the top of the
  // scale, so it joins the max — a category running at half its cap should
  // look like it is running at half its cap.
  const scale = useMemo(() => {
    const peak = Math.max(
      ...months.map((m) => Math.max(0, m.actual) + Math.max(0, m.forecast)),
      cap ?? 0,
      0,
    );
    return peak > 0 ? peak : 1;
  }, [months, cap]);

  const active = months[selected] ?? months[currentIndex];
  const activeTotal = active ? Math.max(0, active.actual) + Math.max(0, active.forecast) : 0;
  const overCap = cap != null && cap > 0 && activeTotal > cap;

  const hatch = `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 7px)`;

  const money = (n: number) => (
    <span className={cn("font-mono tabular-nums", masked && "ft-priv")}>
      {formatCurrency(n)}
    </span>
  );

  return (
    <div>
      {/* Readout. Fixed in the layout rather than floating, so it never
          covers the bar the user just tapped. */}
      <div className="flex items-baseline justify-between gap-3 mb-2 min-h-[18px]">
        <span className="text-[12.5px] font-[550]">
          {active?.label}
          {active?.kind === "current" && (
            <span className="text-fg-dim font-normal">
              {" · "}
              {t("budget.soFar", { defaultValue: "so far" })}
            </span>
          )}
          {active?.kind === "future" && (
            <span className="text-fg-dim font-normal">
              {" · "}
              {t("budget.scheduled", { defaultValue: "scheduled" })}
            </span>
          )}
        </span>
        <span
          className={cn("text-[12.5px]", overCap ? "text-neg font-[550]" : "text-fg-dim")}
        >
          {money(activeTotal)}
          {cap != null && cap > 0 && (
            <>
              {" / "}
              {money(cap)}
            </>
          )}
        </span>
      </div>

      <div className="relative" style={{ height: BAR_H }} ref={railRef}>
        {/* The cap, drawn behind the bars so a bar that crosses it reads as
            crossing it rather than being cut by it. */}
        {cap != null && cap > 0 && cap <= scale && (
          <div
            className="absolute inset-x-0 border-t border-dashed border-line pointer-events-none"
            style={{ bottom: `${(cap / scale) * 100}%` }}
            aria-hidden
          />
        )}

        <div className="absolute inset-0 flex items-end gap-[5px]">
          {months.map((m, i) => {
            const actual = Math.max(0, m.actual);
            const forecast = Math.max(0, m.forecast);
            const isSel = i === selected;
            const total = actual + forecast;

            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={isSel}
                aria-label={`${m.label} — ${formatCurrency(total)}`}
                className={cn(
                  "flex-1 min-w-0 h-full flex flex-col justify-end rounded-t-[4px]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "transition-opacity",
                  isSel ? "opacity-100" : "opacity-[0.82] hover:opacity-100",
                )}
              >
                {/* Forecast rides on top of actual: within the current month
                    the two are one continuous bar split at today. */}
                {forecast > 0 && (
                  <span
                    className="block w-full rounded-t-[4px]"
                    style={{
                      height: `${Math.max(2, (forecast / scale) * BAR_H)}px`,
                      backgroundImage: hatch,
                      // The stripes need a ground of their own or they sit on
                      // whatever is behind the panel.
                      backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
                    }}
                  />
                )}
                <span
                  className={cn("block w-full", forecast > 0 ? "" : "rounded-t-[4px]")}
                  style={{
                    height: `${actual > 0 ? Math.max(2, (actual / scale) * BAR_H) : forecast > 0 ? 0 : 2}px`,
                    background:
                      m.kind === "past"
                        ? `color-mix(in oklab, ${color} 42%, transparent)`
                        : color,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-[5px] mt-[5px]">
        {months.map((m, i) => (
          <span
            key={m.key}
            className={cn(
              "flex-1 min-w-0 text-[10px] text-center truncate",
              m.kind === "current" ? "text-foreground font-[550]" : "text-fg-dim",
              i === selected && m.kind !== "current" && "text-foreground",
            )}
          >
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}
