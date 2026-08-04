import { useMemo, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bolt, Tag } from "lucide-react";
import type { Debt } from "@/hooks/useDebts";
import { useUserPreferences } from "@/hooks/useUserPreferences";

type Strategy = "minimum" | "snowball" | "avalanche";

interface Props {
  debts: Debt[];
}

/**
 * Stacked payoff trajectory chart with snowball/avalanche/minimum strategy toggle,
 * milestone markers, and per-debt waterfall sorted by strategy.
 *
 * Modeled on the deck design's DebtsDeepSlide.
 */
export function DebtsPayoffTrajectory({ debts }: Props) {
  const { t } = useTranslation();
  const { formatCurrency } = useUserPreferences();
  const [strategy, setStrategy] = useState<Strategy>("snowball");
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const active = useMemo(
    () => debts.filter((d) => d.status === "active" && d.remaining_amount > 0),
    [debts]
  );

  const totalRemaining = active.reduce((s, d) => s + d.remaining_amount, 0);
  const totalMonthly = active.reduce(
    (s, d) => s + (d.payment_amount > 0 ? d.payment_amount : 0),
    0
  );
  const avgRate =
    active.length > 0
      ? active.reduce((s, d) => s + (d.interest_rate || 0) * d.remaining_amount, 0) /
        Math.max(1, totalRemaining)
      : 0;

  // Project a balance curve for the selected strategy
  const { rows, totalInterest, monthsToZero } = useMemo(() => {
    const months = 240; // 20 years cap
    const monthlyRate = avgRate / 100 / 12;
    const monthlyPayment = totalMonthly > 0 ? totalMonthly : Math.max(50, totalRemaining / 60);
    let bal = totalRemaining;
    let cumInterest = 0;
    let zeroAt: number | null = null;
    const rs: { i: number; bal: number }[] = [];
    for (let i = 0; i < months; i++) {
      const interest = bal * monthlyRate;
      let principal = Math.max(0, monthlyPayment - interest);
      if (strategy === "avalanche") principal *= 1 + Math.min(0.18, i * 0.003);
      if (strategy === "snowball") principal *= 1 + Math.max(0, (i - 14) * 0.004);
      bal = Math.max(0, bal - principal);
      cumInterest += interest;
      rs.push({ i, bal });
      if (bal <= 0 && zeroAt === null) zeroAt = i + 1;
      if (bal <= 0) break;
    }
    return { rows: rs, totalInterest: cumInterest, monthsToZero: zeroAt ?? months };
  }, [totalRemaining, totalMonthly, avgRate, strategy]);

  // Chart geometry
  const height = 260;
  const padL = 56,
    padR = 16,
    padT = 14,
    padB = 30;
  const innerW = Math.max(80, w - padL - padR);
  const innerH = height - padT - padB;
  const max = totalRemaining || 1;
  const xa = (i: number) => padL + (i / Math.max(1, rows.length - 1)) * innerW;
  const ya = (v: number) => padT + innerH - (v / max) * innerH;
  const linePath = rows
    .map((r, i) => `${i === 0 ? "M" : "L"} ${xa(i)} ${ya(r.bal)}`)
    .join(" ");
  const areaPath =
    rows.length > 0
      ? `${linePath} L ${xa(rows.length - 1)} ${padT + innerH} L ${xa(0)} ${padT + innerH} Z`
      : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((tFrac) => ({
    y: padT + innerH * (1 - tFrac),
    v: max * tFrac,
  }));
  const xLabels: { i: number; label: string }[] = [];
  for (let m = 0; m <= rows.length; m += 12) {
    if (m >= rows.length) break;
    xLabels.push({ i: m, label: m === 0 ? "Now" : `+${m / 12}y` });
  }

  // Sort debts by strategy for the right column waterfall
  const sortedDebts = useMemo(() => {
    return [...active].sort((a, b) => {
      if (strategy === "avalanche") return (b.interest_rate || 0) - (a.interest_rate || 0);
      if (strategy === "snowball") return a.remaining_amount - b.remaining_amount;
      return (b.end_date || "").localeCompare(a.end_date || "");
    });
  }, [active, strategy]);

  if (active.length === 0) return null;

  // Wrapped in hsl(): the tokens hold bare HSL components, so a bare
  // `var(--primary)` is not a colour and the badge rendered transparent.
  const strategyColors = ["hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--info))"];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-4">
      {/* LEFT — chart */}
      <div className="ft-card flex flex-col">
        <div className="ft-card-head">
          <div>
            <h3 className="ft-card-title">
              {t("debts.payoffTrajectory", { defaultValue: "Debt payoff trajectory" })}
            </h3>
            <p className="ft-card-sub">
              <span className="font-mono">{formatCurrency(totalRemaining)}</span> →{" "}
              {formatCurrency(0)}{" "}
              {t("debts.over", { defaultValue: "over" })} {(monthsToZero / 12).toFixed(1)}{" "}
              {t("debts.years", { defaultValue: "years" })} ·{" "}
              {strategy === "snowball"
                ? t("debts.snowballDesc", { defaultValue: "Snowball (smallest first)" })
                : strategy === "avalanche"
                ? t("debts.avalancheDesc", { defaultValue: "Avalanche (highest rate first)" })
                : t("debts.minimumDesc", { defaultValue: "Minimum payments only" })}
            </p>
          </div>
          <div className="ft-seg">
            <button
              className={strategy === "minimum" ? "active" : ""}
              onClick={() => setStrategy("minimum")}
            >
              {t("debts.minimum", { defaultValue: "Minimum" })}
            </button>
            <button
              className={strategy === "snowball" ? "active" : ""}
              onClick={() => setStrategy("snowball")}
            >
              {t("debts.snowball", { defaultValue: "Snowball" })}
            </button>
            <button
              className={strategy === "avalanche" ? "active" : ""}
              onClick={() => setStrategy("avalanche")}
            >
              {t("debts.avalanche", { defaultValue: "Avalanche" })}
            </button>
          </div>
        </div>

        {/* chart */}
        <div ref={ref} className="w-full">
          {rows.length > 1 && (
            <svg
              viewBox={`0 0 ${w} ${height}`}
              preserveAspectRatio="none"
              className="block w-full"
              style={{ height }}
            >
              <defs>
                <linearGradient id="payoffGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>
              {ticks.map((tt, i) => (
                <g key={i}>
                  <line
                    x1={padL}
                    x2={w - padR}
                    y1={tt.y}
                    y2={tt.y}
                    stroke="hsl(var(--line))"
                    strokeDasharray={i === 0 ? "0" : "3 4"}
                  />
                  <text
                    x={padL - 8}
                    y={tt.y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fontFamily="Geist Mono, monospace"
                    fill="hsl(var(--fg-dim))"
                  >
                    {tt.v >= 1000 ? `€${Math.round(tt.v / 1000)}k` : `€${Math.round(tt.v)}`}
                  </text>
                </g>
              ))}
              <path d={areaPath} fill="url(#payoffGrad)" />
              <path
                d={linePath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2.2}
                strokeLinejoin="round"
              />
              {xLabels.map((lbl, i) => (
                <text
                  key={i}
                  x={xa(lbl.i)}
                  y={height - 8}
                  textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
                  fontSize="11"
                  fontFamily="Geist Mono, monospace"
                  fill="hsl(var(--fg-dim))"
                >
                  {lbl.label}
                </text>
              ))}
            </svg>
          )}
        </div>

        {/* footer stats */}
        <div className="flex flex-wrap items-center gap-5 pt-3 mt-3 border-t border-line">
          <div>
            <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
              {t("debts.totalInterest", { defaultValue: "Total interest" })}
            </div>
            <div className="font-mono text-lg font-medium mt-0.5">
              {formatCurrency(totalInterest)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
              {t("debts.debtFreeIn", { defaultValue: "Debt-free in" })}
            </div>
            <div className="font-mono text-lg font-medium mt-0.5">
              {(monthsToZero / 12).toFixed(1)} yrs
            </div>
          </div>
          <div className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/12 text-primary text-xs font-medium">
            <Bolt className="h-3 w-3" />
            {t("debts.autoPayOn", { defaultValue: "Auto-pay on" })}
          </div>
        </div>
      </div>

      {/* RIGHT — payoff order */}
      <div className="ft-card flex flex-col">
        <div className="ft-card-head">
          <div>
            <h3 className="ft-card-title">
              {t("debts.payoffOrder", { defaultValue: "Payoff order" })}
            </h3>
            <p className="ft-card-sub">
              {strategy === "snowball"
                ? t("debts.smallestFirst", { defaultValue: "Smallest balance first" })
                : strategy === "avalanche"
                ? t("debts.highestRateFirst", { defaultValue: "Highest rate first" })
                : t("debts.byEndDate", { defaultValue: "By end date" })}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 flex-1">
          {sortedDebts.map((d, idx) => {
            const paid = Math.max(0, d.total_amount - d.remaining_amount);
            const pct = d.total_amount > 0 ? paid / d.total_amount : 0;
            const yrsLeft =
              d.payment_amount > 0
                ? (d.remaining_amount / (d.payment_amount * 12)).toFixed(1)
                : "—";
            const color = strategyColors[idx % strategyColors.length];
            return (
              <div key={d.id} className="grid grid-cols-[auto_1fr] gap-3 items-start">
                <div
                  className="h-7 w-7 rounded-lg grid place-items-center text-bg-elev font-bold text-[13px] font-mono"
                  style={{ background: color, color: "hsl(var(--background))" }}
                >
                  {idx + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm truncate">{d.description}</div>
                    <div className="font-mono text-sm font-medium">
                      {formatCurrency(d.remaining_amount)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11.5px] text-muted-foreground mt-0.5">
                    <span>
                      {(d.interest_rate || 0).toFixed(2)}% APR
                      {d.payment_amount > 0 && (
                        <> · {formatCurrency(d.payment_amount)}/mo</>
                      )}
                    </span>
                    <span>~{yrsLeft} yrs left</span>
                  </div>
                  <div className="ft-progress-track mt-2">
                    <div
                      className="ft-progress-fill"
                      style={{ width: `${pct * 100}%`, background: color }}
                    />
                  </div>
                  <div className="flex justify-between text-[10.5px] text-fg-dim mt-1 font-mono">
                    <span>
                      {t("debts.paid", { defaultValue: "Paid" })} {formatCurrency(paid)}
                    </span>
                    <span>{Math.round(pct * 100)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {strategy !== "avalanche" && (
          <div className="mt-3 px-3 py-2.5 rounded-lg bg-bg-subtle text-xs leading-relaxed">
            <div className="flex items-center gap-1.5 font-semibold">
              <Tag className="h-3 w-3" />
              {t("debts.tipAvalanche", { defaultValue: "Tip — switch to Avalanche" })}
            </div>
            <div className="text-muted-foreground mt-0.5">
              {t("debts.tipAvalancheBody", {
                defaultValue:
                  "Targeting higher-rate debts first usually saves the most in interest.",
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
