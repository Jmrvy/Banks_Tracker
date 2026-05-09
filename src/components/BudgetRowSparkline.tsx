interface BudgetRowSparklineProps {
  /** Per-bucket actual spend in chronological order. */
  buckets: number[];
  /** Per-bucket projected spend (parallel to `buckets`); ignored when `null`. */
  projected: number[] | null;
  /** Category color (HEX). */
  color: string;
  /** Period budget (period_budget = monthly × effectiveMonths). Optional. */
  budget: number | null;
  /** Today's index into the bucket array (clamped). */
  elapsedDays: number;
  totalDays: number;
  height?: number;
}

/**
 * Single-row sparkline that doubles as the row's primary visualisation.
 * Encodes:
 *   - cumulative spend over the period (line + tinted area fill)
 *   - dashed reference line at the period budget
 *   - dotted vertical "today" tick
 *
 * Replaces the dual sparkline + progress-bar pair from the previous design.
 */
export function BudgetRowSparkline({
  buckets,
  projected,
  color,
  budget,
  elapsedDays,
  totalDays,
  height = 38,
}: BudgetRowSparklineProps) {
  const w = 600;
  const n = buckets.length;
  if (n === 0) return <svg viewBox={`0 0 ${w} ${height}`} className="block w-full h-full" aria-hidden />;

  // Combine actual + projected per bucket, then accumulate so the line trends
  // up over time (easier to read at 38px tall than per-bucket spikes).
  const combined = buckets.map((v, i) => v + (projected?.[i] ?? 0));
  const cum: number[] = [];
  let running = 0;
  for (const v of combined) {
    running += v;
    cum.push(running);
  }

  const max = Math.max(budget ?? 0, ...cum, 1);
  const xOf = (i: number) => (n > 1 ? (i / (n - 1)) * w : w);
  const yOf = (v: number) => height - (v / max) * (height - 4) - 2;

  const linePath =
    n === 1
      ? `M 0 ${yOf(cum[0]).toFixed(1)} L ${w} ${yOf(cum[0]).toFixed(1)}`
      : cum
          .map((v, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`)
          .join(" ");
  const areaPath = `${linePath} L ${w} ${height} L 0 ${height} Z`;
  const todayX = n > 1 ? (Math.max(0, Math.min(elapsedDays - 1, n - 1)) / (n - 1)) * w : 0;
  const budgetY = budget != null && budget > 0 ? yOf(budget) : null;
  const gradId = `bspark-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
  // Dim "today" tick when the period is fully past or fully future.
  const showTodayTick = elapsedDays > 0 && elapsedDays < totalDays;

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="block w-full h-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {budgetY !== null && (
        <line
          x1={0}
          x2={w}
          y1={budgetY}
          y2={budgetY}
          stroke="hsl(var(--line-strong))"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {showTodayTick && (
        <line
          x1={todayX}
          x2={todayX}
          y1={0}
          y2={height}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={0.75}
          strokeDasharray="2 3"
          opacity={0.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
