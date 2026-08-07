import { useMemo } from "react";
import { ArrowDown, ArrowUp, ArrowRight, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useTranslation } from "react-i18next";
import { Delta } from "./analysisPrimitives";
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
    <div className="ft-card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line-soft p-0">
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
  return (
    <div className="p-[17px_18px] flex flex-col gap-[9px]">
      <div className="ft-kpi-label">{label}</div>
      <div className={cn("ft-num text-[20px] font-medium leading-none tracking-[-0.03em]",
        tone === 'pos' ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>
        {nowValue}
      </div>
      <div className="ft-kpi-foot">
        <Delta value={delta} positiveIsGood={positiveIsGood} />
        <span className="ft-trunc">
          {t('reports.analysis.vs', { defaultValue: 'vs' })} {priorValue}
        </span>
      </div>
      <div className="ft-eyebrow">{comparisonLabel}</div>
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
      // specialBudgetTransactionAmount now excludes repayments and returns a
      // signed net, so a refunded envelope shrinks instead of reading full.
      const amt = specialBudgetTransactionAmount(tx);
      if (amt === 0) continue;
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

  // Counted over the same rows the totals are built from. Counting every row
  // of a type made the caption say "14 transactions" above a list of 11.
  const incomeCount = filteredTransactions.filter(
    t => t.type === 'income' && t.include_in_stats !== false && !t.refund_of_transaction_id,
  ).length + (includeUpcoming ? projectedIncomeCount : 0);
  const expenseCount = filteredTransactions.filter(
    t => t.type === 'expense' && t.include_in_stats !== false && !t.repayment_of_transaction_id,
  ).length + (includeUpcoming ? projectedExpenseCount : 0);


  return (
    <div className="flex flex-col gap-3.5">
      <CompareStrip
        inNow={stats.income}
        inPrior={comparisonStats.income}
        outNow={stats.expenses}
        outPrior={comparisonStats.expenses}
        comparisonLabel={comparisonLabel}
      />

      <div className="ft-g2e">
        {/* Money in */}
        <div className="ft-card">
          <div className="ft-card-head">
            <div className="min-w-0">
              <h3 className="ft-card-title flex items-center gap-2">
                <span className="ft-kpi-icon pos h-6 w-6 rounded-[8px]" aria-hidden>
                  <ArrowDown className="h-3.5 w-3.5" />
                </span>
                {t('reports.analysis.moneyIn', { defaultValue: 'Money in' })}
              </h3>
              <div className="ft-card-sub">
                {incomeCount} {t('reports.analysis.transactions', { defaultValue: 'transactions' })}
                {includeUpcoming && projectedIncomeCount > 0 && (
                  <> · <span className="ft-dim">{projectedIncomeCount} {t('reports.analysis.projected', { defaultValue: 'projected' })}</span></>
                )}
              </div>
            </div>
            {onIncomeClick && (
              <button type="button" onClick={onIncomeClick} className="ft-chip">
                {t('reports.analysis.viewAll', { defaultValue: 'View all' })}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex flex-col">
            {topIncome.length === 0 ? (
              <p className="ft-empty text-[12.5px]">
                {t('reports.analysis.noData', { defaultValue: 'No data' })}
              </p>
            ) : topIncome.map(c => {
              const total = c.amount + c.projected;
              const pct = totalIncome > 0 ? (total / totalIncome) * 100 : 0;
              return (
                <div key={c.name} className="ft-catrow">
                  <span className="ft-row min-w-0">
                    <i className="ft-swatch bg-[hsl(var(--pos))]" aria-hidden />
                    <span className="ft-trunc text-[12.5px] font-550">{c.name}</span>
                    {c.projected > 0 && (
                      <span className="ft-tag">
                        +{formatCurrency(c.projected)} {t('reports.analysis.projected', { defaultValue: 'projected' })}
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-2 flex-shrink-0">
                    <span className="ft-num ft-dim text-[10.5px]">{pct.toFixed(0)}%</span>
                    <span className="ft-num text-[12.5px] font-medium text-[hsl(var(--pos))]">
                      +{formatCurrency(total)}
                    </span>
                  </span>
                  <div className="ft-progress-track thin col-span-2">
                    <i className="ft-progress-fill bg-[hsl(var(--pos))]" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Money out */}
        <div className="ft-card">
          <div className="ft-card-head">
            <div className="min-w-0">
              <h3 className="ft-card-title flex items-center gap-2">
                <span className="ft-kpi-icon neg h-6 w-6 rounded-[8px]" aria-hidden>
                  <ArrowUp className="h-3.5 w-3.5" />
                </span>
                {t('reports.analysis.moneyOut', { defaultValue: 'Money out' })}
              </h3>
              <div className="ft-card-sub">
                {expenseCount} {t('reports.analysis.transactions', { defaultValue: 'transactions' })}
                {includeUpcoming && projectedExpenseCount > 0 && (
                  <> · <span className="ft-dim">{projectedExpenseCount} {t('reports.analysis.projected', { defaultValue: 'projected' })}</span></>
                )}
              </div>
            </div>
            {onExpensesClick && (
              <button type="button" onClick={onExpensesClick} className="ft-chip">
                {t('reports.analysis.viewAll', { defaultValue: 'View all' })}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex flex-col">
            {topExpenses.length === 0 ? (
              <p className="ft-empty text-[12.5px]">
                {t('reports.analysis.noData', { defaultValue: 'No data' })}
              </p>
            ) : topExpenses.map(c => {
              const total = c.amount + c.projected;
              const pct = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0;
              return (
                <div key={c.name} className="ft-catrow">
                  <span className="ft-row min-w-0">
                    {c.isSpecial ? (
                      <span aria-hidden className="grid h-[15px] w-[15px] place-items-center rounded-[4px] flex-shrink-0" style={{ backgroundColor: `${c.color}22`, color: c.color }}>
                        <Wallet className="h-2.5 w-2.5" />
                      </span>
                    ) : (
                      <i className="ft-swatch" aria-hidden style={{ backgroundColor: c.color }} />
                    )}
                    <span className="ft-trunc text-[12.5px] font-550">{c.name}</span>
                    {c.isSpecial && (
                      <span className="ft-tag">
                        {t('reports.analysis.specialBudget', { defaultValue: 'Special budget' })}
                      </span>
                    )}
                    {c.projected > 0 && (
                      <span className="ft-tag">
                        +{formatCurrency(c.projected)} {t('reports.analysis.projected', { defaultValue: 'projected' })}
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-2 flex-shrink-0">
                    <span className="ft-num ft-dim text-[10.5px]">{pct.toFixed(0)}%</span>
                    <span className="ft-num text-[12.5px] font-medium text-[hsl(var(--neg))]">
                      −{formatCurrency(total)}
                    </span>
                  </span>
                  <div className="ft-progress-track thin col-span-2">
                    <i className="ft-progress-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: c.color }} />
                  </div>
                </div>
              );
            })}
            {specialBudgetTotal > 0 && (
              <div className="ft-card-sunk mt-3.5 rounded-[15px] border p-3.5 flex items-start gap-2 text-[12px] text-muted-foreground">
                <Wallet className="h-3.5 w-3.5 mt-px flex-shrink-0" />
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
          </div>
        </div>
      </div>
    </div>
  );
};
