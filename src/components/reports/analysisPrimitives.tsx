import { useId, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Shared read-only presentation atoms for the Analyse screens.
 *
 * Both are pure renderers — they take numbers that were already computed
 * upstream and draw them. No formatting decision here changes a total.
 */

/**
 * Delta chip. One tight badge, never a capsule: `.ft-delta` carries the mono
 * face, the 6px radius and the `--pos-soft` / `--neg-soft` tone fills that
 * lift correctly in dark mode.
 */
export const Delta = ({
  value,
  suffix = "%",
  positiveIsGood = true,
  className,
}: {
  value: number;
  suffix?: string;
  positiveIsGood?: boolean;
  className?: string;
}) => {
  const { i18n } = useTranslation();
  const locale = i18n.language === "fr" ? "fr-FR" : "en-US";
  const flat = !Number.isFinite(value) || Math.abs(value) < 0.05;
  const good = positiveIsGood ? value > 0 : value < 0;
  const kind = flat ? "flat" : good ? "up" : "down";

  return (
    <span className={cn("ft-delta", kind, className)}>
      {!flat &&
        (value > 0 ? (
          <ChevronUp className="h-[11px] w-[11px]" aria-hidden />
        ) : (
          <ChevronDown className="h-[11px] w-[11px]" aria-hidden />
        ))}
      {flat
        ? "="
        : `${value > 0 ? "+" : ""}${value.toLocaleString(locale, { maximumFractionDigits: 1 })}${suffix}`}
    </span>
  );
};

const pathOf = (values: number[], w: number, h: number, pad = 0) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
};

/**
 * Sparkline. Drawn in a 100 × h viewBox stretched to the tile width, so every
 * stroke carries `vector-effect="non-scaling-stroke"` — without it the 1.6px
 * line renders thick on verticals and thin on horizontals.
 */
export const Spark = ({
  values,
  color,
  height = 26,
}: {
  values: number[];
  color: string;
  height?: number;
}) => {
  const gradientId = `ft-spark-${useId().replace(/:/g, "")}`;
  const d = useMemo(
    () => (values.length > 1 ? pathOf(values, 100, height, 2) : ""),
    [values, height],
  );
  if (!d) return null;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L100 ${height} L0 ${height} Z`} fill={`url(#${gradientId})`} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};
