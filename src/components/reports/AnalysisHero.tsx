import type { ComponentType, ReactNode } from "react";
import { ArrowDown, ArrowUp, BarChart3, PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useTranslation } from "react-i18next";
import { Delta, Spark } from "./analysisPrimitives";
import type { ReportsStats, SparklinePoint } from "@/hooks/useReportsData";

/**
 * Analyse opens on four equal peer tiles — money in, money out, net, savings
 * rate — not on one dominant figure. Every value here is read straight off the
 * stats the page already computed; this file only decides how they are drawn.
 */

interface AnalysisHeroProps {
  stats: ReportsStats;
  priorStats: ReportsStats;
  priorPeriodLabel: string;
  sparkline: SparklinePoint[];
  onIncomeClick?: () => void;
  onExpensesClick?: () => void;
}

type Tone = "pos" | "neg" | "acc" | "warn";

const KpiTile = ({
  icon: Icon,
  tone,
  label,
  value,
  spark,
  foot,
  onClick,
  ariaLabel,
  masked,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  label: string;
  value: string;
  spark?: ReactNode;
  foot: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  /**
   * Privacy mask on the figure only. `.ft-priv` sets pointer-events:none, so
   * it must sit on the inner value div — never on the clickable `.ft-kpi`
   * button, which would make the tile untappable while privacy is on.
   */
  masked?: boolean;
}) => {
  const body = (
    <>
      <div className="ft-row">
        <span className={cn("ft-kpi-icon", tone)} aria-hidden>
          <Icon className="h-[15px] w-[15px]" />
        </span>
        <span className="ft-kpi-label">{label}</span>
      </div>
      <div className={cn("ft-kpi-value", masked && "ft-priv")}>{value}</div>
      {spark && <div style={{ margin: "-2px 0 -4px" }}>{spark}</div>}
      <div className="ft-kpi-foot">{foot}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="ft-kpi ft-focusable" aria-label={ariaLabel}>
        {body}
      </button>
    );
  }
  return <div className="ft-kpi">{body}</div>;
};

export const AnalysisHero = ({
  stats,
  priorStats,
  priorPeriodLabel,
  sparkline,
  onIncomeClick,
  onExpensesClick,
}: AnalysisHeroProps) => {
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
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
  const priorSavingsRate =
    priorStats.income > 0 ? ((priorStats.income - priorStats.expenses) / priorStats.income) * 100 : 0;
  const ratePp = savingsRate - priorSavingsRate;

  const vs = t('reports.analysis.vs', { defaultValue: 'vs' });
  const incomeSpark = sparkline.map(p => p.income);
  const expenseSpark = sparkline.map(p => p.expenses);

  return (
    <div className="ft-g4">
      <KpiTile
        icon={ArrowDown}
        tone="pos"
        label={t('reports.analysis.moneyIn', { defaultValue: 'Money in' })}
        value={formatCurrency(stats.income)}
        masked={isPrivacyMode}
        ariaLabel={t('reports.analysis.moneyIn', { defaultValue: 'Money in' })}
        spark={<Spark values={incomeSpark} color="hsl(var(--pos))" />}
        foot={
          <>
            <Delta value={inDeltaPct} />
            <span className="ft-trunc">{vs} <span className={cn(isPrivacyMode && "ft-priv")}>{formatCurrency(priorStats.income)}</span></span>
          </>
        }
        onClick={onIncomeClick}
      />

      <KpiTile
        icon={ArrowUp}
        tone="neg"
        label={t('reports.analysis.moneyOut', { defaultValue: 'Money out' })}
        value={formatCurrency(stats.expenses)}
        masked={isPrivacyMode}
        ariaLabel={t('reports.analysis.moneyOut', { defaultValue: 'Money out' })}
        spark={<Spark values={expenseSpark} color="hsl(var(--neg))" />}
        foot={
          <>
            <Delta value={outDeltaPct} positiveIsGood={false} />
            <span className="ft-trunc">{vs} <span className={cn(isPrivacyMode && "ft-priv")}>{formatCurrency(priorStats.expenses)}</span></span>
          </>
        }
        onClick={onExpensesClick}
      />

      <KpiTile
        icon={BarChart3}
        tone="acc"
        label={t('reports.analysis.netChange', { defaultValue: 'Net change' })}
        value={`${net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(net))}`}
        masked={isPrivacyMode}
        foot={
          <>
            <Delta value={netDeltaPct} />
            <span className="ft-trunc">{vs} {priorPeriodLabel}</span>
          </>
        }
      />

      <KpiTile
        icon={PiggyBank}
        tone="pos"
        label={t('reports.analysis.savingsRate', { defaultValue: 'Savings rate' })}
        value={`${savingsRate.toFixed(1)}%`}
        foot={
          <>
            <Delta value={ratePp} suffix="pp" />
            <span className="ft-trunc">{vs} {priorSavingsRate.toFixed(1)}%</span>
          </>
        }
      />
    </div>
  );
};
