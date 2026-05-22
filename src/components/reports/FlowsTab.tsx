import { useMemo } from "react";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ReportsStats, RecurringData } from "@/hooks/useReportsData";
import type { Transaction } from "@/hooks/useFinancialData";
import type { CategoryData } from "@/hooks/useReportsData";
import { IncomeCategory } from "@/hooks/useIncomeAnalysis";

interface FlowsTabProps {
  stats: ReportsStats;
  comparisonStats: ReportsStats;
  comparisonLabel: string;
  filteredTransactions: Transaction[];
  categoryChartData: CategoryData[];
  incomeAnalysis: IncomeCategory[];
  recurringData: RecurringData;
  includeUpcoming: boolean;
  onIncomeClick?: () => void;
  onExpensesClick?: () => void;
}


const CompareStrip = ({
  inNow, inPrior, outNow, outPrior, comparisonLabel,
}: { inNow: number; inPrior: number; outNow: number; outPrior: number; comparisonLabel: string }) => {
  const { formatCurrency } = useUserPreferences();
  const { t } = useTranslation();
  const inDelta = inPrior > 0.01 ? ((inNow - inPrior) / inPrior) * 100 : 0;
  const outDelta = outPrior > 0.01 ? ((outNow - outPrior) / outPrior) * 100 : 0;
  const netNow = inNow - outNow;
  const netPrior = inPrior - outPrior;
  const netDelta = netNow - netPrior;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line rounded-xl border border-line bg-card">
      <Row label={t('reports.analysis.moneyIn', { defaultValue: 'Money in' })}
        nowValue={`+${formatCurrency(inNow)}`} priorValue={`+${formatCurrency(inPrior)}`}
        delta={inDelta} positiveIsGood comparisonLabel={comparisonLabel} tone="pos" />
      <Row label={t('reports.analysis.moneyOut', { defaultValue: 'Money out' })}
        nowValue={`−${formatCurrency(outNow)}`} priorValue={`−${formatCurrency(outPrior)}`}
        delta={outDelta} positiveIsGood={false} comparisonLabel={comparisonLabel} tone="neg" />
      <Row label={t('reports.analysis.net', { defaultValue: 'Net' })}
        nowValue={`${netNow >= 0 ? '+' : '−'}${formatCurrency(Math.abs(netNow))}`}
        priorValue={`${netPrior >= 0 ? '+' : '−'}${formatCurrency(Math.abs(netPrior))}`}
        delta={netPrior !== 0 ? ((netDelta) / Math.abs(netPrior)) * 100 : 0}
        positiveIsGood comparisonLabel={comparisonLabel}
        tone={netNow >= 0 ? 'pos' : 'neg'} />
    </div>
  );
};

const Row = ({ label, nowValue, priorValue, delta, positiveIsGood, comparisonLabel, tone }: {
  label: string; nowValue: string; priorValue: string; delta: number; positiveIsGood: boolean; comparisonLabel: string;
  tone: 'pos' | 'neg';
}) => {
  const { t } = useTranslation();
  const good = (delta > 0 && positiveIsGood) || (delta < 0 && !positiveIsGood);
  const cls = Math.abs(delta) < 0.5 ? "bg-secondary text-muted-foreground"
    : good ? "bg-[hsl(var(--pos)/0.12)] text-[hsl(var(--pos))]" : "bg-[hsl(var(--neg)/0.12)] text-[hsl(var(--neg))]";
  return (
    <div className="p-3.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-lg font-medium tabular-nums tracking-[-0.02em] mt-0.5",
        tone === 'pos' ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>
        {nowValue}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px]">
        <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium tabular-nums", cls)}>
          {Math.abs(delta) < 0.5 ? '=' : (delta > 0 ? '▲' : '▼')} {Math.abs(delta).toFixed(1)}%
        </span>
        <span className="text-muted-foreground font-mono">
          {t('reports.analysis.vs', { defaultValue: 'vs' })} {priorValue}
        </span>
      </div>
      <div className="text-[10px] uppercase tracking-[0.04em] text-fg-dim mt-1 font-mono">{comparisonLabel}</div>
    </div>
  );
};

export const FlowsTab = ({
  stats, comparisonStats, comparisonLabel,
  filteredTransactions, categoryChartData, incomeAnalysis,
  onIncomeClick, onExpensesClick,
}: FlowsTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const { t } = useTranslation();

  const topIncome = useMemo(() =>
    incomeAnalysis.slice().sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 8),
    [incomeAnalysis]);
  const topExpenses = useMemo(() => categoryChartData.slice(0, 8), [categoryChartData]);

  const totalIncome = stats.income;
  const totalExpenses = stats.expenses;

  return (
    <div className="space-y-3">
      <CompareStrip
        inNow={stats.income}
        inPrior={comparisonStats.income}
        outNow={stats.expenses}
        outPrior={comparisonStats.expenses}
        comparisonLabel={comparisonLabel}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Money in */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4 flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-[hsl(var(--pos)/0.12)] text-[hsl(var(--pos))]">
                  <TrendingUp className="h-3.5 w-3.5" />
                </span>
                {t('reports.analysis.moneyIn', { defaultValue: 'Money in' })}
              </CardTitle>
              <CardDescription className="text-[10.5px] mt-0.5">
                {filteredTransactions.filter(t => t.type === 'income').length}{' '}
                {t('reports.analysis.transactions', { defaultValue: 'transactions' })}
              </CardDescription>
            </div>
            {onIncomeClick && (
              <button type="button" onClick={onIncomeClick}
                className="text-[10.5px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                {t('reports.analysis.viewAll', { defaultValue: 'View all' })}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {topIncome.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                {t('reports.analysis.noData', { defaultValue: 'No data' })}
              </p>
            ) : topIncome.map(c => (
              <div key={c.category} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="h-2 w-2 rounded-full flex-shrink-0 bg-[hsl(var(--pos))]" />
                  <span className="truncate">{c.category}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono text-fg-dim text-[10px] tabular-nums">
                    {totalIncome > 0 ? ((c.totalAmount / totalIncome) * 100).toFixed(0) : 0}%
                  </span>
                  <span className="font-mono font-medium text-[hsl(var(--pos))] tabular-nums">
                    +{formatCurrency(c.totalAmount)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Money out */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4 flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-[hsl(var(--neg)/0.12)] text-[hsl(var(--neg))]">
                  <TrendingDown className="h-3.5 w-3.5" />
                </span>
                {t('reports.analysis.moneyOut', { defaultValue: 'Money out' })}
              </CardTitle>
              <CardDescription className="text-[10.5px] mt-0.5">
                {filteredTransactions.filter(t => t.type === 'expense').length}{' '}
                {t('reports.analysis.transactions', { defaultValue: 'transactions' })}
              </CardDescription>
            </div>
            {onExpensesClick && (
              <button type="button" onClick={onExpensesClick}
                className="text-[10.5px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                {t('reports.analysis.viewAll', { defaultValue: 'View all' })}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {topExpenses.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                {t('reports.analysis.noData', { defaultValue: 'No data' })}
              </p>
            ) : topExpenses.map(c => (
              <div key={c.name} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="truncate">{c.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono text-fg-dim text-[10px] tabular-nums">
                    {totalExpenses > 0 ? ((c.spent / totalExpenses) * 100).toFixed(0) : 0}%
                  </span>
                  <span className="font-mono font-medium text-[hsl(var(--neg))] tabular-nums">
                    −{formatCurrency(c.spent)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
