import { useMemo } from "react";
import { TrendingUp, TrendingDown, ArrowRight, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ReportsStats, RecurringData } from "@/hooks/useReportsData";
import type { Transaction } from "@/hooks/useFinancialData";
import type { CategoryData } from "@/hooks/useReportsData";
import { IncomeCategory, extractKeywords } from "@/hooks/useIncomeAnalysis";
import { useSpecialBudgets } from "@/hooks/useSpecialBudgets";
import { specialBudgetTransactionAmount } from "@/lib/specialBudgetUtils";

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
  recurringData, includeUpcoming,
  onIncomeClick, onExpensesClick,
}: FlowsTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const { t } = useTranslation();
  const { specialBudgets } = useSpecialBudgets();

  // Per-special-budget spend within the period (net of refunds, excluded-from-stats
  // rows kept — envelopes are about real cash outflow). Used both to surface a note
  // and to inject them into the Money Out list so totals reconcile with stats.expenses.
  const specialBudgetBreakdown = useMemo(() => {
    if (specialBudgets.length === 0) return [];
    const byId = new Map<string, { name: string; color: string; amount: number; count: number }>();
    for (const tx of filteredTransactions) {
      if (tx.type !== 'expense' || !tx.special_budget_id) continue;
      const sb = specialBudgets.find(b => b.id === tx.special_budget_id);
      if (!sb) continue;
      const amt = specialBudgetTransactionAmount(tx);
      if (amt <= 0) continue;
      const e = byId.get(sb.id) ?? { name: sb.name, color: sb.color || 'hsl(var(--muted-foreground))', amount: 0, count: 0 };
      e.amount += amt;
      e.count += 1;
      byId.set(sb.id, e);
    }
    return Array.from(byId.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, specialBudgets]);

  const specialBudgetTotal = useMemo(
    () => specialBudgetBreakdown.reduce((s, b) => s + b.amount, 0),
    [specialBudgetBreakdown]
  );

  // Projected (future) recurring occurrences, grouped by category name + type.
  // For income, real categories come from string-matching (incomeAnalysis), so we
  // apply the same keyword matching to project descriptions into those buckets.
  const incomeCategoryKeywords = useMemo(() => {
    return incomeAnalysis.map(cat => ({
      name: cat.category,
      keywords: cat.transactions.flatMap(t => extractKeywords(t.description)),
    }));
  }, [incomeAnalysis]);

  const matchIncomeCategory = (desc: string): string | null => {
    const kw = extractKeywords(desc);
    if (kw.length === 0) return null;
    const kwSet = new Set(kw);
    let best: { name: string; score: number } | null = null;
    for (const cat of incomeCategoryKeywords) {
      if (cat.keywords.length === 0) continue;
      const catSet = new Set(cat.keywords);
      let common = 0;
      for (const w of kwSet) if (catSet.has(w)) common++;
      const union = new Set([...kwSet, ...catSet]).size;
      const score = union > 0 ? common / union : 0;
      if (score >= 0.4 && (!best || score > best.score)) {
        best = { name: cat.name, score };
      }
    }
    return best?.name ?? null;
  };

  const projectedByCategory = useMemo(() => {
    const map = new Map<string, { name: string; color: string; amount: number; count: number; type: 'income' | 'expense' }>();
    if (!includeUpcoming) return map;
    for (const pi of recurringData.periodItems) {
      const futureDetails = (pi.occurrenceDetails || []).filter(d => d.isFuture);
      if (futureDetails.length === 0) continue;
      const sum = futureDetails.reduce((s, d) => s + d.amount, 0);
      let name: string;
      let color: string;
      if (pi.effectiveType === 'income') {
        // Income uses string matching, not stored categories
        name = matchIncomeCategory(pi.recurring.description)
          || pi.recurring.description
          || t('common.uncategorized', { defaultValue: 'Uncategorized' });
        color = 'hsl(var(--pos))';
      } else {
        name = pi.recurring.category?.name || t('common.uncategorized', { defaultValue: 'Uncategorized' });
        color = pi.recurring.category?.color || 'hsl(var(--muted-foreground))';
      }
      const key = `${pi.effectiveType}-${name}`;
      const existing = map.get(key);
      if (existing) {
        existing.amount += sum;
        existing.count += futureDetails.length;
      } else {
        map.set(key, { name, color, amount: sum, count: futureDetails.length, type: pi.effectiveType });
      }
    }
    return map;
  }, [includeUpcoming, recurringData.periodItems, t, incomeCategoryKeywords]);

  const projectedIncomeCount = useMemo(() => {
    let n = 0;
    for (const v of projectedByCategory.values()) if (v.type === 'income') n += v.count;
    return n;
  }, [projectedByCategory]);
  const projectedExpenseCount = useMemo(() => {
    let n = 0;
    for (const v of projectedByCategory.values()) if (v.type === 'expense') n += v.count;
    return n;
  }, [projectedByCategory]);


  const topIncome = useMemo(() => {
    const base = new Map<string, { name: string; amount: number; projected: number }>();
    for (const c of incomeAnalysis) {
      base.set(c.category, { name: c.category, amount: c.totalAmount, projected: 0 });
    }
    for (const v of projectedByCategory.values()) {
      if (v.type !== 'income') continue;
      const existing = base.get(v.name);
      if (existing) existing.projected += v.amount;
      else base.set(v.name, { name: v.name, amount: 0, projected: v.amount });
    }
    return Array.from(base.values())
      .sort((a, b) => (b.amount + b.projected) - (a.amount + a.projected))
      .slice(0, 8);
  }, [incomeAnalysis, projectedByCategory]);

  const topExpenses = useMemo(() => {
    const base = new Map<string, { name: string; color: string; amount: number; projected: number; isSpecial?: boolean }>();
    for (const c of categoryChartData) {
      base.set(c.name, { name: c.name, color: c.color, amount: c.spent, projected: 0 });
    }
    // Special budgets are their own bracket in stats.expenses but excluded from
    // categoryChartData — surface them here so the per-row list reconciles
    // with the headline total.
    for (const sb of specialBudgetBreakdown) {
      const key = `__sb__${sb.name}`;
      base.set(key, { name: sb.name, color: sb.color, amount: sb.amount, projected: 0, isSpecial: true });
    }
    for (const v of projectedByCategory.values()) {
      if (v.type !== 'expense') continue;
      const existing = base.get(v.name);
      if (existing) existing.projected += v.amount;
      else base.set(v.name, { name: v.name, color: v.color, amount: 0, projected: v.amount });
    }
    return Array.from(base.values())
      .sort((a, b) => (b.amount + b.projected) - (a.amount + a.projected))
      .slice(0, 8);
  }, [categoryChartData, projectedByCategory, specialBudgetBreakdown]);

  const totalIncome = stats.income;
  const totalExpenses = stats.expenses;

  const incomeCount = filteredTransactions.filter(t => t.type === 'income').length + (includeUpcoming ? projectedIncomeCount : 0);
  const expenseCount = filteredTransactions.filter(t => t.type === 'expense').length + (includeUpcoming ? projectedExpenseCount : 0);


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
                {incomeCount} {t('reports.analysis.transactions', { defaultValue: 'transactions' })}
                {includeUpcoming && projectedIncomeCount > 0 && (
                  <> · <span className="text-fg-dim">{projectedIncomeCount} {t('reports.analysis.projected', { defaultValue: 'projected' })}</span></>
                )}
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
            ) : topIncome.map(c => {
              const total = c.amount + c.projected;
              return (
                <div key={c.name} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="h-2 w-2 rounded-full flex-shrink-0 bg-[hsl(var(--pos))]" />
                    <span className="truncate">{c.name}</span>
                    {c.projected > 0 && (
                      <span className="text-[9.5px] uppercase tracking-[0.04em] text-fg-dim font-mono">
                        +{formatCurrency(c.projected)} {t('reports.analysis.projected', { defaultValue: 'projected' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-fg-dim text-[10px] tabular-nums">
                      {totalIncome > 0 ? ((total / totalIncome) * 100).toFixed(0) : 0}%
                    </span>
                    <span className="font-mono font-medium text-[hsl(var(--pos))] tabular-nums">
                      +{formatCurrency(total)}
                    </span>
                  </div>
                </div>
              );
            })}
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
                {expenseCount} {t('reports.analysis.transactions', { defaultValue: 'transactions' })}
                {includeUpcoming && projectedExpenseCount > 0 && (
                  <> · <span className="text-fg-dim">{projectedExpenseCount} {t('reports.analysis.projected', { defaultValue: 'projected' })}</span></>
                )}
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
            ) : topExpenses.map(c => {
              const total = c.amount + c.projected;
              return (
                <div key={c.name} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {c.isSpecial ? (
                      <span aria-hidden className="grid h-3.5 w-3.5 place-items-center rounded-[4px] flex-shrink-0" style={{ backgroundColor: `${c.color}22`, color: c.color }}>
                        <Wallet className="h-2.5 w-2.5" />
                      </span>
                    ) : (
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                    )}
                    <span className="truncate">{c.name}</span>
                    {c.isSpecial && (
                      <span className="text-[9px] uppercase tracking-[0.04em] text-fg-dim font-medium px-1 rounded bg-secondary">
                        {t('reports.analysis.specialBudget', { defaultValue: 'Special budget' })}
                      </span>
                    )}
                    {c.projected > 0 && (
                      <span className="text-[9.5px] uppercase tracking-[0.04em] text-fg-dim font-mono">
                        +{formatCurrency(c.projected)} {t('reports.analysis.projected', { defaultValue: 'projected' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-fg-dim text-[10px] tabular-nums">
                      {totalExpenses > 0 ? ((total / totalExpenses) * 100).toFixed(0) : 0}%
                    </span>
                    <span className="font-mono font-medium text-[hsl(var(--neg))] tabular-nums">
                      −{formatCurrency(total)}
                    </span>
                  </div>
                </div>
              );
            })}
            {specialBudgetTotal > 0 && (
              <div className="mt-2 pt-2 border-t border-line flex items-start gap-2 text-[10.5px] text-muted-foreground">
                <Wallet className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>
                  {t('reports.analysis.specialBudgetImpact', {
                    defaultValue: 'Special budgets account for {{amount}} ({{pct}}%) of outflows this period across {{count}} envelope(s).',
                    amount: formatCurrency(specialBudgetTotal),
                    pct: totalExpenses > 0 ? ((specialBudgetTotal / totalExpenses) * 100).toFixed(1) : '0',
                    count: specialBudgetBreakdown.length,
                  })}
                </span>
              </div>
            )}
          </CardContent>

        </Card>
      </div>
    </div>
  );
};
