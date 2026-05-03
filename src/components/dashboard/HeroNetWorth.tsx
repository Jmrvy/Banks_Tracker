import { useMemo, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, Lock, Info } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { parseLocalDate } from "@/lib/dateUtils";

/**
 * Fintech-style net worth hero card.
 *
 * Big tabular figure on the left, mini area chart of the trailing 90 days on
 * the right. Inspired by the redesign deck's HomeSlide hero panel.
 */
export function HeroNetWorth() {
  const { t } = useTranslation();
  const { accounts, transactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, e.contentRect.width)));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const total = useMemo(
    () => accounts.reduce((sum, a) => sum + a.balance, 0),
    [accounts]
  );

  // Derive 90-day balance series by replaying transactions backward from today.
  const series = useMemo(() => {
    const days = 90;
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    // Net change per day
    const deltaByDay = new Map<string, number>();
    const key = (d: Date) =>
      `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    for (const txn of transactions) {
      if (txn.include_in_stats === false) continue;
      const d = parseLocalDate(txn.transaction_date);
      const k = key(d);
      const sign =
        txn.type === "income" ? 1 : txn.type === "expense" ? -1 : 0;
      deltaByDay.set(k, (deltaByDay.get(k) || 0) + sign * txn.amount);
    }

    // Walk backward from today balance, subtracting each day's delta to
    // produce the previous day's closing balance.
    const out: { d: number; v: number }[] = new Array(days);
    let v = total;
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - (days - 1 - i));
      out[i] = { d: i, v };
      const k = key(day);
      v -= deltaByDay.get(k) || 0;
    }
    return out;
  }, [transactions, total]);

  // 30-day delta for the chip
  const delta30d = useMemo(() => {
    if (series.length < 30) return 0;
    return series[series.length - 1].v - series[series.length - 30].v;
  }, [series]);
  const deltaPct = useMemo(() => {
    if (series.length < 30) return 0;
    const start = series[series.length - 30].v;
    return start === 0 ? 0 : (delta30d / Math.abs(start)) * 100;
  }, [series, delta30d]);

  const up = delta30d >= 0;

  // Format the integer/cents split
  const intPart = Math.floor(Math.max(0, total)).toLocaleString("en-US");
  const cents = (Math.abs(total) % 1).toFixed(2).slice(2);

  // Area chart geometry
  const height = 180;
  const padL = 8,
    padR = 8,
    padT = 12,
    padB = 12;
  const innerW = Math.max(40, w - padL - padR);
  const innerH = height - padT - padB;
  const max = Math.max(...series.map((p) => p.v));
  const min = Math.min(...series.map((p) => p.v));
  const range = max - min || 1;
  const x = (i: number) => padL + (i / (series.length - 1 || 1)) * innerW;
  const y = (v: number) => padT + innerH - ((v - min) / range) * innerH;
  const linePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.v)}`)
    .join(" ");
  const areaPath =
    series.length > 0
      ? `${linePath} L ${x(series.length - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`
      : "";

  return (
    <div className="ft-hero">
      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_2fr] gap-6 md:gap-8 relative">
        {/* Left: meta */}
        <div className="flex flex-col gap-4 pb-6 md:pb-7 min-w-0">
          <div className="min-w-0">
            <div className="ft-hero-eyebrow">
              <span className="live" />
              {t("dashboard.totalNetWorth", { defaultValue: "Total net worth" })}
            </div>
            <div
              className={`ft-hero-value mt-3 leading-none break-words ${isPrivacyMode ? "blur-md select-none" : ""}`}
              style={{ fontSize: "clamp(2rem, 8vw, 3.5rem)" }}
            >
              €{intPart}
              <span className="cents">.{cents}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3 text-[12.5px] text-muted-foreground">
              <span className={`ft-delta ${up ? "up" : "down"} whitespace-nowrap`}>
                {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(deltaPct).toFixed(1)}% · {up ? "+" : "−"}
                {formatCurrency(Math.abs(delta30d))}
              </span>
              <span className="whitespace-nowrap">{t("dashboard.past30Days", { defaultValue: "past 30 days" })}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-3 border-t border-line text-xs text-muted-foreground">
            <Info className="h-3 w-3 flex-shrink-0" />
            <span className="truncate min-w-0">
              {t("dashboard.updated", { defaultValue: "Updated" })}{" "}
              {new Date().toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-bg-subtle border border-line text-[11px] flex-shrink-0">
              <Lock className="h-2.5 w-2.5" />
              {t("common.secure", { defaultValue: "Secure" })}
            </span>
          </div>
        </div>

        {/* Right: area chart */}
        <div ref={wrapRef} className="pb-3 min-h-[180px]">
          {series.length > 1 && (
            <svg
              viewBox={`0 0 ${w} ${height}`}
              preserveAspectRatio="none"
              className="w-full h-[180px] block"
            >
              <defs>
                <linearGradient id="heroArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((tFrac) => (
                <line
                  key={tFrac}
                  x1={padL}
                  x2={w - padR}
                  y1={padT + innerH * tFrac}
                  y2={padT + innerH * tFrac}
                  stroke="hsl(var(--line))"
                  strokeDasharray="3 4"
                />
              ))}
              <path d={areaPath} fill="url(#heroArea)" />
              <path
                d={linePath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
