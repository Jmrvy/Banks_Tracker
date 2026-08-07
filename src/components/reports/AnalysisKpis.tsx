import { useId, useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, BarChart3, Info, PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReportsStats, ReportsPeriod, SparklinePoint } from "@/hooks/useReportsData";

interface AnalysisKpisProps {
  stats: ReportsStats;
  priorStats: ReportsStats;
  period: ReportsPeriod;
  priorPeriodLabel: string;
  sparkline: SparklinePoint[];
  dateType: 'accounting' | 'value';
  onIncomeClick?: () => void;
  onExpensesClick?: () => void;
}

/**
 * Delta pill. `positiveIsGood` flips the colouring for series where growth is
 * the bad outcome (spending), so green always means "the direction you want".
 */
const Delta = ({
  delta,
  suffix = "",
  positiveIsGood = true,
}: { delta: number; suffix?: string; positiveIsGood?: boolean }) => {
  const { formatCurrency } = useUserPreferences();
  const flat = Math.abs(delta) < (suffix ? 0.05 : 0.005);
  if (flat) return <span className="ft-delta flat">= {suffix}</span>;

  const up = delta > 0;
  const good = up === positiveIsGood;
  const formatted = suffix
    ? `${Math.abs(delta).toFixed(1)}${suffix}`
    : formatCurrency(Math.abs(delta));

  return (
    <span className={cn("ft-delta", good ? "up" : "down")}>
      <span className="text-[9px] leading-none">{up ? "↗" : "↘"}</span>
      {formatted}
    </span>
  );
};

/** Mini trend line for a KPI tile — six months of the tile's own series. */
const Trend = ({ values, tone }: { values: number[]; tone: "pos" | "neg" }) => {
  const gradientId = useId();
  const stroke = tone === "pos" ? "hsl(var(--pos))" : "hsl(var(--neg))";

  const path = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 240;
    const h = 40;
    const stepX = w / (values.length - 1);
    const pts = values.map((v, i) => ({
      x: i * stepX,
      y: h - 3 - ((v - min) / range) * (h - 6),
    }));
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    return { line, area: `${line} L${w},${h} L0,${h} Z` };
  }, [values]);

  if (!path) return null;

  return (
    <svg viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden className="block h-9 w-full">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradientId})`} />
      <path d={path.line} stroke={stroke} strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Tile = ({
  icon: Icon,
  tone,
  label,
  labelAfter,
  value,
  valueTone,
  trend,
  foot,
  onClick,
}: {
  icon: typeof ArrowDownLeft;
  tone: "pos" | "neg" | "acc" | "warn";
  label: string;
  labelAfter?: React.ReactNode;
  value: string;
  valueTone?: "pos" | "neg";
  trend?: React.ReactNode;
  foot: React.ReactNode;
  onClick?: () => void;
}) => {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <div className={cn("ft-kpi-icon", tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="ft-kpi-label inline-flex items-center gap-1.5">
          {label}
          {labelAfter}
        </span>
      </div>
      <div
        className={cn(
          "ft-kpi-value",
          valueTone === "pos" && "text-[hsl(var(--pos))]",
          valueTone === "neg" && "text-[hsl(var(--neg))]",
        )}
      >
        {value}
      </div>
      {trend}
      <div className="ft-kpi-foot mt-auto flex-wrap">{foot}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="ft-kpi text-left hover:bg-bg-subtle">
        {body}
      </button>
    );
  }
  return <div className="ft-kpi">{body}</div>;
};

/**
 * The four headline figures of the analysis page: what came in, what went out,
 * the net of the two, and the share of income kept. Every tile carries its own
 * comparison against the period the user picked in the toolbar.
 */
export const AnalysisKpis = ({
  stats,
  priorStats,
  period,
  priorPeriodLabel,
  sparkline,
  dateType,
  onIncomeClick,
  onExpensesClick,
}: AnalysisKpisProps) => {
  const { formatCurrency } = useUserPreferences();
  const { t } = useTranslation();

  const net = stats.netPeriodBalance;
  const netDelta = net - priorStats.netPeriodBalance;

  const inDeltaPct = priorStats.income > 0.01 ? ((stats.income - priorStats.income) / priorStats.income) * 100 : 0;
  const outDeltaPct = priorStats.expenses > 0.01 ? ((stats.expenses - priorStats.expenses) / priorStats.expenses) * 100 : 0;

  const savingsRate = stats.income > 0 ? ((stats.income - stats.expenses) / stats.income) * 100 : 0;
  const priorSavingsRate = priorStats.income > 0 ? ((priorStats.income - priorStats.expenses) / priorStats.income) * 100 : 0;

  const vs = t('reports.analysis.vs', { defaultValue: 'vs' });
  const against = <span className="truncate">{vs} {priorPeriodLabel}</span>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
      <Tile
        icon={ArrowDownLeft}
        tone="pos"
        label={t('reports.analysis.moneyIn', { defaultValue: 'Money in' })}
        value={formatCurrency(stats.income)}
        trend={<Trend values={sparkline.map(p => p.income)} tone="pos" />}
        foot={<><Delta delta={inDeltaPct} suffix="%" />{against}</>}
        onClick={onIncomeClick}
      />

      <Tile
        icon={ArrowUpRight}
        tone="neg"
        label={t('reports.analysis.moneyOut', { defaultValue: 'Money out' })}
        value={formatCurrency(stats.expenses)}
        trend={<Trend values={sparkline.map(p => p.expenses)} tone="neg" />}
        foot={<><Delta delta={outDeltaPct} suffix="%" positiveIsGood={false} />{against}</>}
        onClick={onExpensesClick}
      />

      <Tile
        icon={BarChart3}
        tone="acc"
        label={t('reports.analysis.netChange', { defaultValue: 'Net change' })}
        labelAfter={
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('reports.analysis.netChange', { defaultValue: 'Net change' })}
                  className="text-fg-dim transition-colors hover:text-foreground"
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                {t('reports.analysis.netTip', {
                  defaultValue: 'Income minus expenses, using accounting date.',
                })}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
        value={`${net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(net))}`}
        valueTone={net >= 0 ? "pos" : "neg"}
        foot={
          <>
            <Delta delta={netDelta} />
            <span className="truncate">
              {period.label} ·{' '}
              {dateType === 'value'
                ? t('settings.valueDate', { defaultValue: 'Value date' })
                : t('settings.accountingDate', { defaultValue: 'Accounting date' })}
            </span>
          </>
        }
      />

      <Tile
        icon={PiggyBank}
        tone="warn"
        label={t('reports.analysis.savingsRate', { defaultValue: 'Savings rate' })}
        value={`${savingsRate.toFixed(1)} %`}
        foot={
          <>
            <Delta delta={savingsRate - priorSavingsRate} suffix="pp" />
            <span className="truncate">{vs} {priorSavingsRate.toFixed(1)} %</span>
          </>
        }
      />
    </div>
  );
};
