type GaugeStatus = "noBudget" | "ok" | "warn" | "over";

interface BudgetRowGaugeProps {
  /** Total used = spent + projected. */
  used: number;
  /** Period budget (null when no monthly budget is set). */
  budget: number | null;
  /** used / periodBudget (0 when no budget). */
  pct: number;
  /** Time-aware status flag. */
  status: GaugeStatus;
  /** Fraction of the period elapsed (0–1) — drives the pace marker. */
  elapsedFraction: number;
  t: (k: string, o?: any) => string;
}

const FILL_CLASS: Record<GaugeStatus, string> = {
  ok: "bg-pos",
  warn: "bg-warning",
  over: "bg-destructive",
  noBudget: "bg-fg-dim/30",
};

/**
 * Horizontal budget gauge — the alternate row visualisation to the
 * cumulative sparkline. Encodes at a glance:
 *   - how much of the budget is consumed (status-toned fill)
 *   - whether spend is ahead of the period pace (vertical pace tick)
 *   - the overshoot magnitude when breached (clamped fill + red %)
 */
export function BudgetRowGauge({
  used,
  budget,
  pct,
  status,
  elapsedFraction,
  t,
}: BudgetRowGaugeProps) {
  const hasBudget = budget != null && budget > 0;
  const fillPct = hasBudget ? Math.min(pct, 1) * 100 : 0;
  const showPace =
    hasBudget && elapsedFraction > 0 && elapsedFraction < 1;
  const isOver = status === "over";

  return (
    <div
      className="flex items-center gap-3 w-full"
      aria-label={
        hasBudget
          ? t("budget.gaugeAria", {
              pct: `${(pct * 100).toFixed(0)}%`,
              defaultValue: `${(pct * 100).toFixed(0)}% of budget used`,
            })
          : t("categories.noBudgetTag", { defaultValue: "No budget" })
      }
    >
      <div className="relative flex-1 h-2.5 rounded-full bg-bg-subtle overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] ${FILL_CLASS[status]}`}
          style={{ width: `${fillPct}%` }}
        />
        {showPace && (
          <div
            className="absolute top-0 h-full w-px bg-foreground/45"
            style={{ left: `${Math.min(elapsedFraction, 1) * 100}%` }}
            title={t("budget.legendPace", {
              defaultValue: "Expected pace for the elapsed period",
            })}
          />
        )}
      </div>
      <span
        className={`text-[11px] font-mono tabular-nums tracking-tight w-10 text-right shrink-0 ${
          !hasBudget
            ? "text-fg-dim"
            : isOver
              ? "text-destructive font-semibold"
              : "text-fg-dim"
        }`}
      >
        {hasBudget ? `${(pct * 100).toFixed(0)}%` : "—"}
      </span>
    </div>
  );
}
