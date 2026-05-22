import { useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReportsStats, ReportsPeriod, SparklinePoint } from "@/hooks/useReportsData";

interface AnalysisHeroProps {
  stats: ReportsStats;
  priorStats: ReportsStats;
  period: ReportsPeriod;
  priorPeriodLabel: string;
  sparkline: SparklinePoint[];
  onIncomeClick?: () => void;
  onExpensesClick?: () => void;
}

const DeltaChip = ({ delta, suffix = "", positiveIsGood = true }: { delta: number; suffix?: string; positiveIsGood?: boolean }) => {
  const { formatCurrency } = useUserPreferences();
  const isUp = delta > 0;
  const isDown = delta < 0;
  const good = (isUp && positiveIsGood) || (isDown && !positiveIsGood);
  const bad = (isUp && !positiveIsGood) || (isDown && positiveIsGood);

  if (Math.abs(delta) < 0.005) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground tabular-nums">
        = {suffix}
      </span>
    );
  }
  const cls = good
    ? "bg-[hsl(var(--pos)/0.12)] text-[hsl(var(--pos))]"
    : bad
      ? "bg-[hsl(var(--neg)/0.12)] text-[hsl(var(--neg))]"
      : "bg-secondary text-muted-foreground";
  const sign = isUp ? "▲" : "▼";
  const formatted = suffix === "%" || suffix === "pp"
    ? `${Math.abs(delta).toFixed(1)}${suffix}`
    : formatCurrency(Math.abs(delta));
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums", cls)}>
      <span className="text-[9px] leading-none">{sign}</span>
      {formatted}
    </span>
  );
};

const Sparkline = ({ data }: { data: SparklinePoint[] }) => {
  const path = useMemo(() => {
    if (data.length === 0) return { line: "", area: "", endX: 0, endY: 0 };
    const values = data.map(d => d.net);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min || 1;
    const w = 360;
    const h = 48;
    const stepX = w / Math.max(1, data.length - 1);
    const points = data.map((d, i) => {
      const x = i * stepX;
      const y = h - 4 - ((d.net - min) / range) * (h - 8);
      return { x, y };
    });
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    const area = `${line} L${points[points.length - 1].x},${h} L0,${h} Z`;
    return { line, area, endX: points[points.length - 1].x, endY: points[points.length - 1].y };
  }, [data]);

  return (
    <svg viewBox="0 0 360 48" preserveAspectRatio="none" className="w-full h-12 block">
      <defs>
        <linearGradient id="heroSparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--pos))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--pos))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill="url(#heroSparkGrad)" />
      <path d={path.line} stroke="hsl(var(--pos))" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={path.endX} cy={path.endY} r="6" fill="hsl(var(--pos))" fillOpacity="0.18" />
      <circle cx={path.endX} cy={path.endY} r="3.5" fill="hsl(var(--pos))" />
    </svg>
  );
};

export const AnalysisHero = ({
  stats,
  priorStats,
  period,
  priorPeriodLabel,
  sparkline,
  onIncomeClick,
  onExpensesClick,
}: AnalysisHeroProps) => {
  const { formatCurrency } = useUserPreferences();
  const { t } = useTranslation();

  const net = stats.netPeriodBalance;
  const priorNet = priorStats.netPeriodBalance;
  const netDelta = net - priorNet;
  const netDeltaPct = Math.abs(priorNet) > 0.01 ? (netDelta / Math.abs(priorNet)) * 100 : 0;

  const inDelta = stats.income - priorStats.income;
  const inDeltaPct = priorStats.income > 0.01 ? (inDelta / priorStats.income) * 100 : 0;
  const outDelta = stats.expenses - priorStats.expenses;
  const outDeltaPct = priorStats.expenses > 0.01 ? (outDelta / priorStats.expenses) * 100 : 0;

  const savingsRate = stats.income > 0 ? ((stats.income - stats.expenses) / stats.income) * 100 : 0;
  const priorSavingsRate = priorStats.income > 0 ? ((priorStats.income - priorStats.expenses) / priorStats.income) * 100 : 0;
  const ratePp = savingsRate - priorSavingsRate;

  const sign = net >= 0 ? "+" : "−";
  const netAbs = Math.abs(net);
  const netStr = formatCurrency(netAbs);
  // Split currency formatting into integer + decimals for visual hierarchy
  const match = netStr.match(/^([^\d-]*)([\d\s,.]+?)([.,]\d+)?([^\d]*)$/);
  const prefix = match?.[1] || "";
  const intPart = match?.[2] || netStr;
  const decPart = match?.[3] || "";
  const suffix = match?.[4] || "";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,1fr)] gap-5 lg:gap-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_100%_0%,hsl(var(--primary)/0.08),transparent_60%)]"
      />

      {/* Left: Net headline + sparkline */}
      <div className="relative z-[1]">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1.5">
          <span>{t('reports.analysis.netChange', { defaultValue: 'Net change' })} · {period.label}</span>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="info"
                  className="grid h-3.5 w-3.5 place-items-center rounded-full border border-line-strong text-[9px] font-medium text-muted-foreground"
                >
                  <Info className="h-2.5 w-2.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                {t('reports.analysis.netTip', {
                  defaultValue: 'Income minus expenses, using accounting date.',
                })}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-baseline gap-1 font-mono tabular-nums text-[clamp(30px,5vw,46px)] font-medium leading-none tracking-[-0.035em]">
          <span className={cn("text-[0.62em] font-semibold leading-none", net >= 0 ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>{sign}</span>
          <span className="text-[0.5em] font-normal text-muted-foreground">{prefix}</span>
          <span>{intPart}</span>
          <span className="text-[0.45em] font-normal text-muted-foreground">{decPart}{suffix}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5 text-[11.5px]">
          <DeltaChip delta={netDelta} />
          {Math.abs(priorNet) > 0.01 && <DeltaChip delta={netDeltaPct} suffix="%" />}
          <span className="text-muted-foreground">
            {t('reports.analysis.vs', { defaultValue: 'vs' })} {priorPeriodLabel}
          </span>
        </div>

        {sparkline.length > 0 && (
          <div className="mt-4">
            <Sparkline data={sparkline} />
            <div className="mt-1.5 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.04em] text-muted-foreground">
              {sparkline.map((p, i) => (
                <span
                  key={i}
                  className={cn(p.isCurrent && "text-foreground font-semibold")}
                >
                  {p.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: 3 secondary KPIs */}
      <div className="relative z-[1] flex flex-col overflow-hidden rounded-xl border border-line bg-card">
        <KpiRow
          icon={TrendingUp}
          tone="pos"
          label={t('reports.analysis.moneyIn', { defaultValue: 'Money in' })}
          value={`+${formatCurrency(stats.income)}`}
          valueTone="pos"
          chipDelta={inDeltaPct}
          chipSuffix="%"
          chipPositiveIsGood
          comparison={`${t('reports.analysis.vs', { defaultValue: 'vs' })} ${formatCurrency(priorStats.income)}`}
          onClick={onIncomeClick}
        />
        <KpiRow
          icon={TrendingDown}
          tone="neg"
          label={t('reports.analysis.moneyOut', { defaultValue: 'Money out' })}
          value={`−${formatCurrency(stats.expenses)}`}
          valueTone="neg"
          chipDelta={outDeltaPct}
          chipSuffix="%"
          chipPositiveIsGood={false}
          comparison={`${t('reports.analysis.vs', { defaultValue: 'vs' })} ${formatCurrency(priorStats.expenses)}`}
          onClick={onExpensesClick}
        />
        <KpiRow
          icon={Wallet}
          tone="warn"
          label={t('reports.analysis.savingsRate', { defaultValue: 'Savings rate' })}
          value={`${savingsRate.toFixed(1)}%`}
          chipDelta={ratePp}
          chipSuffix="pp"
          chipPositiveIsGood
          comparison={`${t('reports.analysis.vs', { defaultValue: 'vs' })} ${priorSavingsRate.toFixed(1)}%`}
        />
      </div>
    </div>
  );
};

const KpiRow = ({
  icon: Icon,
  tone,
  label,
  value,
  valueTone,
  chipDelta,
  chipSuffix,
  chipPositiveIsGood,
  comparison,
  onClick,
}: {
  icon: typeof TrendingUp;
  tone: "pos" | "neg" | "warn";
  label: string;
  value: string;
  valueTone?: "pos" | "neg";
  chipDelta: number;
  chipSuffix?: string;
  chipPositiveIsGood: boolean;
  comparison: string;
  onClick?: () => void;
}) => {
  const iconBg = tone === "pos" ? "bg-[hsl(var(--pos)/0.12)] text-[hsl(var(--pos))]"
    : tone === "neg" ? "bg-[hsl(var(--neg)/0.12)] text-[hsl(var(--neg))]"
    : "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]";
  const valColor = valueTone === "pos" ? "text-[hsl(var(--pos))]" : valueTone === "neg" ? "text-[hsl(var(--neg))]" : "text-foreground";

  const content = (
    <>
      <div className={cn("grid h-6 w-6 flex-shrink-0 place-items-center rounded-md", iconBg)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-w-0 flex-col gap-[1px]">
        <div className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</div>
        <div className={cn("font-mono text-[15px] font-medium leading-[1.15] tabular-nums tracking-[-0.02em]", valColor)}>{value}</div>
      </div>
      <div className="ml-auto flex flex-col items-end gap-1">
        <DeltaChip delta={chipDelta} suffix={chipSuffix} positiveIsGood={chipPositiveIsGood} />
        <span className="font-mono text-[10px] font-medium text-muted-foreground tabular-nums">{comparison}</span>
      </div>
      {onClick && <ChevronRight className="ml-2 h-4 w-4 text-fg-dim flex-shrink-0" />}
    </>
  );

  const baseClass = "grid grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-2.5 px-3.5 py-3 border-b border-line last:border-b-0 transition-colors";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(baseClass, "text-left hover:bg-bg-hover cursor-pointer")}>
        {content}
      </button>
    );
  }
  return <div className={baseClass}>{content}</div>;
};
