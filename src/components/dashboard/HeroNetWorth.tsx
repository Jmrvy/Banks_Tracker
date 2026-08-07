import { useMemo, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, CalendarClock } from "lucide-react";
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
  const { t, i18n } = useTranslation();
  const { accounts, transactions, recurringTransactions } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  const { debts, scheduledPayments: scheduledDebtPayments } = useDebts();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  // Index of the day the pointer is over — drives the crosshair, the point
  // and the tooltip. Purely presentational: it never feeds a computation.
  const [hover, setHover] = useState<number | null>(null);

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
    const out: { d: number; v: number; date: Date }[] = new Array(days);
    let v = total;
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - (days - 1 - i));
      out[i] = { d: i, v, date: day };
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
  const height = 186;
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

  // Month ticks read straight off the series — one label per month boundary
  // it crosses, so the curve is anchored in time without a second data pass.
  const monthTicks = useMemo(() => {
    const out: { i: number; label: string }[] = [];
    let lastMonth = -1;
    series.forEach((p, i) => {
      const m = p.date.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        out.push({
          i,
          label: p.date.toLocaleDateString(i18n.language === "fr" ? "fr-FR" : "en-US", {
            month: "short",
          }),
        });
      }
    });
    return out;
  }, [series, i18n.language]);

  const hoverPoint = hover != null ? series[hover] : null;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || series.length < 2) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, idx)));
  };

  return (
    <div className="ft-hero" data-tour="hero">
      <div className="ft-hero-grid">
        {/* Left: meta */}
        <div className="flex flex-col min-w-0">
          <div className="min-w-0">
            <div className="ft-hero-eyebrow">
              <span className="live" />
              {t("dashboard.totalNetWorth", { defaultValue: "Total net worth" })}
            </div>
            <div className={`ft-hero-value mt-3.5 break-words ${isNegative ? "is-negative text-destructive" : ""} ${isPrivacyMode ? "ft-priv" : ""}`}>
              {head}
              <span className="cents">{tail}</span>
            </div>
            {/* The chip carries the percentage only; the absolute figure sits
                beside it in mute text, as the design pairs them. */}
            <div className="flex flex-wrap items-center gap-x-[9px] gap-y-1 mt-3 text-[12.5px] text-fg-mute">
              <span className={`ft-delta ${up ? "up" : "down"} whitespace-nowrap text-[12.5px]`}>
                {up ? <ArrowUp className="h-[11px] w-[11px]" /> : <ArrowDown className="h-[11px] w-[11px]" />}
                {up ? "+" : "−"}
                {Math.abs(deltaPct).toFixed(1)}%
              </span>
              <span className={`whitespace-nowrap ${isPrivacyMode ? "ft-priv" : ""}`}>
                {up ? "+" : "−"}
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
                    isPrivacyMode ? "ft-priv" : ""
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
          {/* What the headline is made of. The hero ends here — freshness is
              the topbar's job, not a fourth row under the buckets. */}
          {buckets.length > 1 && (
            <div className="ft-hero-foot">
              {buckets.map((bucket) => (
                <div key={bucket.key} className="ft-hero-stat min-w-0">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-dim">
                    <i className="ft-swatch" style={{ background: bucket.swatch }} />
                    {t(bucket.labelKey, { defaultValue: bucket.fallback })}
                  </span>
                  <b className={`ft-hero-stat-value ${isPrivacyMode ? "ft-priv" : ""}`}>
                    {formatCurrency(bucket.value)}
                  </b>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: area chart, bottom-aligned so the curve hugs the hero's
            lower edge instead of floating above dead space. */}
        <div className="flex flex-col justify-end min-w-0">
          <div
            ref={wrapRef}
            className="relative"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          >
            {series.length > 1 && (
              <>
                <svg
                  viewBox={`0 0 ${w} ${height}`}
                  preserveAspectRatio="none"
                  className="w-full block"
                  style={{ height }}
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="heroArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.26" />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 0.25, 0.5, 0.75, 1].map((tFrac) => (
                    <line
                      key={tFrac}
                      x1={padL}
                      x2={w - padR}
                      y1={padT + innerH * tFrac}
                      y2={padT + innerH * tFrac}
                      stroke="hsl(var(--grid))"
                      strokeWidth={1}
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
                  {hover != null && (
                    <>
                      <line
                        x1={x(hover)}
                        x2={x(hover)}
                        y1={padT}
                        y2={padT + innerH}
                        stroke="hsl(var(--line-strong))"
                        strokeWidth={1}
                      />
                      <circle
                        cx={x(hover)}
                        cy={y(series[hover].v)}
                        r={3.4}
                        fill="hsl(var(--bg-elev))"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                      />
                    </>
                  )}
                </svg>
                {hoverPoint && (
                  <div
                    className="absolute top-1.5 pointer-events-none whitespace-nowrap rounded-[10px] px-[11px] py-[7px] text-[11.5px] shadow-sh-2"
                    style={{
                      left: `${(hover! / (series.length - 1)) * 100}%`,
                      transform: `translateX(${hover! > series.length / 2 ? "-104%" : "4%"})`,
                      background: "hsl(var(--bg-ink))",
                      color: "hsl(var(--fg-onink))",
                    }}
                  >
                    <div className="opacity-65 font-semibold mb-0.5">
                      {hoverPoint.date.toLocaleDateString(
                        i18n.language === "fr" ? "fr-FR" : "en-US",
                        { day: "numeric", month: "short" }
                      )}
                    </div>
                    <div className={`font-mono text-[13px] ${isPrivacyMode ? "ft-priv" : ""}`}>
                      {formatCurrency(hoverPoint.v)}
                    </div>
                  </div>
                )}
                <div className="flex justify-between mt-[7px] text-[10.5px] font-mono text-fg-dim">
                  {monthTicks.map((tick) => (
                    <span key={tick.i}>{tick.label}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
