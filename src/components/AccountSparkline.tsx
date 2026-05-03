import type { AccountSeriesPoint } from "@/hooks/useAccountSeries";

interface Props {
  series: AccountSeriesPoint[];
  color?: string;
  height?: number;
  fill?: boolean;
}

/**
 * Auto-fit sparkline used inside account cards and table rows.
 * Modeled on the design's Spark component.
 */
export function AccountSparkline({
  series,
  color = "hsl(var(--primary))",
  height = 36,
  fill = true,
}: Props) {
  const w = 120;
  if (!series || series.length === 0) return null;
  const max = Math.max(...series.map((p) => p.v));
  const min = Math.min(...series.map((p) => p.v));
  const range = max - min || 1;
  const x = (i: number) => (i / (series.length - 1 || 1)) * w;
  const y = (v: number) => height - ((v - min) / range) * (height - 6) - 3;
  const linePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${w} ${height} L 0 ${height} Z`;
  const id = `sg-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={areaPath} fill={`url(#${id})`} />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
