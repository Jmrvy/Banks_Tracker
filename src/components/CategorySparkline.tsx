interface CategorySparklineProps {
  /** Bucketed actual spend in chronological order. */
  buckets: number[];
  /** Optional projected (future) spend per bucket — drawn as a lighter overlay. */
  projected?: number[];
  /** Stroke / fill color (category color). */
  color: string;
  /** Optional dashed reference line (typically: monthlyBudget per bucket equivalent). */
  reference?: number;
  /** Display height in px. Width is fluid. */
  height?: number;
  className?: string;
}

/**
 * Tiny SVG sparkline. Renders an area chart of bucketed spending and an
 * optional dashed reference line to read budget burn at a glance.
 */
export function CategorySparkline({
  buckets,
  projected,
  color,
  reference,
  height = 36,
  className,
}: CategorySparklineProps) {
  if (buckets.length === 0) {
    return (
      <div
        className={`text-[10.5px] text-fg-dim ${className ?? ""}`}
        style={{ height }}
        aria-hidden
      />
    );
  }

  const totalSeries = buckets.map((b, i) => b + (projected?.[i] ?? 0));
  const maxVal = Math.max(reference ?? 0, ...totalSeries, 1);
  const w = 100; // viewBox width — scales fluid via CSS
  const h = 100;
  const stepX = buckets.length > 1 ? w / (buckets.length - 1) : w;

  const toY = (v: number) => h - (v / maxVal) * h;

  const buildPath = (series: number[]) => {
    if (series.length === 0) return "";
    if (series.length === 1) {
      const y = toY(series[0]);
      return `M0,${y} L${w},${y}`;
    }
    return series.map((v, i) => `${i === 0 ? "M" : "L"}${i * stepX},${toY(v)}`).join(" ");
  };

  const buildArea = (series: number[]) => {
    if (series.length === 0) return "";
    const path = buildPath(series);
    return `${path} L${(series.length - 1) * stepX},${h} L0,${h} Z`;
  };

  const refY = reference != null && reference > 0 ? toY(reference) : null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ height, width: "100%" }}
      className={className}
      aria-hidden
    >
      <path d={buildArea(buckets)} fill={color} fillOpacity="0.18" />
      <path d={buildPath(buckets)} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {projected && projected.some((v) => v > 0) && (
        <path
          d={buildPath(totalSeries)}
          fill="none"
          stroke={color}
          strokeOpacity={0.55}
          strokeWidth={1.25}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {refY !== null && (
        <line
          x1={0}
          x2={w}
          y1={refY}
          y2={refY}
          stroke="hsl(var(--muted-foreground))"
          strokeOpacity={0.5}
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
