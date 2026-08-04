import { useMemo, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, Lock, Info, CalendarClock } from "lucide-react";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useDebts } from "@/hooks/useDebts";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { signedGlobalAmount } from "@/lib/reportsEngine";
import { splitFormattedAmount } from "@/lib/currency";
import { parseLocalDate } from "@/lib/dateUtils";
import { projectMonthEndDelta } from "@/lib/projectMonthEndBalance";

/**
 * How the hero splits net worth into its three shapes. Ordered liquid →
 * locked away, which is the order the question "what can I actually spend?"
 * gets answered in. Credit balances fold into liquid: a card is money you
 * have already spent out of the same pot.
 */
const BUCKETS = [
  { key: "liquid", types: ["checking", "credit"], swatch: "hsl(var(--chart-1))", labelKey: "dashboard.bucketLiquid", fallback: "Liquid" },
  { key: "savings", types: ["savings"], swatch: "hsl(var(--chart-2))", labelKey: "dashboard.bucketSavings", fallback: "Savings" },
  { key: "invest", types: ["investment"], swatch: "hsl(var(--chart-5))", labelKey: "dashboard.bucketInvested", fallback: "Invested" },
] as const;

/**
 * Net worth hero card.
 *
 * The figure is the one number on the dashboard set in the display serif —
 * it reads as a headline, with the cents dropped back. The trailing 90 days
 * run alongside it, and the foot breaks the total into liquid / savings /
 * invested so the headline is never the only thing on offer.
 */
export function HeroNetWorth() {
  const { t } = useTranslation();
  const { accounts, transactions, recurringTransactions } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  const { debts, scheduledPayments: scheduledDebtPayments } = useDebts();
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

  // Projected end-of-month: current balance plus the signed sum of all
  // remaining recurring occurrences in the current calendar month. Uses the
  // same effective-amount rules the rest of the app applies.
  const projectedEom = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delta = projectMonthEndDelta(
      recurringTransactions,
      installmentPayments,
      debts,
      scheduledDebtPayments,
      today
    );
    return { value: total + delta, delta };
  }, [total, recurringTransactions, installmentPayments, debts, scheduledDebtPayments]);

  // Derive 90-day balance series by replaying transactions backward from today.
  const series = useMemo(() => {
    const days = 90;
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    // Net change per day
    const deltaByDay = new Map<string, number>();
    const key = (d: Date) =>
      `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    // A balance replay is not a statistics report. The bank moved the money
    // whatever the reporting flags say, so every row counts — including ones
    // excluded from stats — refunds are NOT netted (the refund is its own
    // row and moved its own money), and a transfer costs its fee. That is
    // signedGlobalAmount, and using the stats rules here made the curve
    // drift further from the real balance the further back you looked.
    for (const txn of transactions) {
      const d = parseLocalDate(txn.transaction_date);
      const k = key(d);
      deltaByDay.set(k, (deltaByDay.get(k) || 0) + signedGlobalAmount(txn as any));
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

  // Split the *formatted* total so the locale and currency stay whatever the
  // user picked — the display type only decides how big each half is set.
  const isNegative = total < 0;
  const { head, tail } = splitFormattedAmount(formatCurrency(total));

  // Balance per bucket, skipping any the user has no accounts for.
  const buckets = useMemo(
    () =>
      BUCKETS.map((bucket) => ({
        ...bucket,
        accounts: accounts.filter((a) => (bucket.types as readonly string[]).includes(a.account_type)),
      }))
        .filter((bucket) => bucket.accounts.length > 0)
        .map((bucket) => ({
          ...bucket,
          value: bucket.accounts.reduce((sum, a) => sum + a.balance, 0),
        })),
    [accounts]
  );

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
    <div className="ft-hero" data-tour="hero">
      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_2fr] gap-6 md:gap-8 relative">
        {/* Left: meta */}
        <div className="flex flex-col gap-4 pb-6 md:pb-7 min-w-0">
          <div className="min-w-0">
            <div className="ft-hero-eyebrow">
              <span className="live" />
              {t("dashboard.totalNetWorth", { defaultValue: "Total net worth" })}
            </div>
            <div className={`ft-hero-value mt-3 break-words ${isNegative ? "is-negative text-destructive" : ""} ${isPrivacyMode ? "blur-md select-none" : ""}`}>
              {head}
              <span className="cents">{tail}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3 text-[12.5px] text-muted-foreground">
              <span className={`ft-delta ${up ? "up" : "down"} whitespace-nowrap`}>
                {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(deltaPct).toFixed(1)}% · {up ? "+" : "−"}
                {formatCurrency(Math.abs(delta30d))}
              </span>
              <span className="whitespace-nowrap">{t("dashboard.past30Days", { defaultValue: "past 30 days" })}</span>
            </div>
            {/* Projected end-of-month — only meaningful when there are
                outstanding recurring occurrences in the current month. */}
            {Math.abs(projectedEom.delta) > 0.005 && (
              <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
                <span className="inline-flex items-center gap-1.5 text-fg-dim uppercase tracking-[0.06em] font-mono text-[11px]">
                  <CalendarClock className="h-3 w-3" />
                  {t("dashboard.projectedEom", { defaultValue: "Projected end of month" })}
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    isPrivacyMode ? "blur-md select-none" : ""
                  } ${projectedEom.value < 0 ? "text-destructive" : ""}`}
                >
                  {formatCurrency(projectedEom.value)}
                </span>
                <span
                  className={`font-mono tabular-nums text-[11.5px] inline-flex items-center gap-1 ${
                    projectedEom.delta >= 0 ? "text-pos" : "text-destructive"
                  }`}
                >
                  {projectedEom.delta >= 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(projectedEom.delta))}
                </span>
              </div>
            )}
          </div>
          {/* What the headline is made of. */}
          {buckets.length > 1 && (
            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-auto pt-4">
              {buckets.map((bucket) => (
                <div key={bucket.key} className="flex flex-col gap-0.5 min-w-0">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-dim">
                    <i
                      className="h-2.5 w-2.5 rounded-[3px] flex-shrink-0"
                      style={{ background: bucket.swatch }}
                    />
                    {t(bucket.labelKey, { defaultValue: bucket.fallback })}
                  </span>
                  <b
                    className={`font-mono text-[15px] font-medium tracking-tight ${
                      isPrivacyMode ? "blur-md select-none" : ""
                    }`}
                  >
                    {formatCurrency(bucket.value)}
                  </b>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-3 border-t border-line-soft text-xs text-muted-foreground">
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
            <span className="ml-auto ft-chip !py-0.5 text-[11px] flex-shrink-0">
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
