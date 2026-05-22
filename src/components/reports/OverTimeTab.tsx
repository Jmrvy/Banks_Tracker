import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ComposedChart, CartesianGrid, XAxis, YAxis, Area, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { GRID_PROPS } from "@/lib/chartConfig";
import { BalanceDataPoint, ReportsStats, RecurringData, ReportsPeriod } from "@/hooks/useReportsData";
import { ArrowUpRight, ArrowDownRight, ChevronDown, Info, CalendarCheck2, Activity, CalendarClock } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useTranslation } from "react-i18next";
import { format, differenceInDays, isWithinInterval, addDays, subMonths, subYears, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";
import { parseLocalDate } from "@/lib/dateUtils";
import { useFinancialData } from "@/hooks/useFinancialData";

interface OverTimeTabProps {
  balanceEvolutionData: BalanceDataPoint[];
  stats: ReportsStats;
  recurringData: RecurringData;
  period: ReportsPeriod;
  dateType: 'accounting' | 'value';
}


const chartConfig = {
  solde: { label: "Balance", color: "hsl(var(--pos))" },
  soldeProjecte: { label: "Projected", color: "hsl(var(--pos) / 0.6)" },
  soldePrior: { label: "Prior period", color: "hsl(var(--muted-foreground))" },
};

export const OverTimeTab = ({ balanceEvolutionData, stats, recurringData, period }: OverTimeTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const { accounts, transactions } = useFinancialData();
  const isMobile = useIsMobile();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [showPriorOverlay, setShowPriorOverlay] = useState(false);

  // Reconciliation data: real / accounting / value views
  const views = useMemo(() => {
    const accountIds = new Set(accounts.map(a => a.id));
    const rollBackInitial = (getDate: (t: typeof transactions[number]) => Date) => {
      const net = new Map<string, number>();
      for (const t of transactions) {
        if (getDate(t) < period.from) continue;
        const srcId = t.account_id;
        const dstId = t.transfer_to_account_id;
        if (srcId && accountIds.has(srcId)) {
          const prev = net.get(srcId) || 0;
          if (t.type === 'income') net.set(srcId, prev - Number(t.amount));
          else if (t.type === 'expense') net.set(srcId, prev + Number(t.amount));
          else if (t.type === 'transfer') net.set(srcId, prev + Number(t.amount) + Number(t.transfer_fee || 0));
        }
        if (dstId && accountIds.has(dstId)) {
          const prev = net.get(dstId) || 0;
          net.set(dstId, prev - Number(t.amount));
        }
      }
      return accounts.reduce((s, a) => s + Number(a.balance) + (net.get(a.id) || 0), 0);
    };

    const compute = (getDate: (t: typeof transactions[number]) => Date, mode: 'real' | 'stats') => {
      const initial = rollBackInitial(getDate);
      const inPeriod = transactions.filter(t => isWithinInterval(getDate(t), { start: period.from, end: period.to }));
      let income = 0, expenses = 0, transferFees = 0;
      let excludedCount = 0, refundedCount = 0, excludedIncome = 0, excludedExpenses = 0, refundOffset = 0;
      for (const t of inPeriod) {
        const isExcluded = t.include_in_stats === false;
        const amount = Number(t.amount);
        const refunded = Number(t.refunded_amount || 0);
        if (t.type === 'income') {
          if (mode === 'real') income += amount;
          else if (!isExcluded && !t.refund_of_transaction_id) income += amount;
          if (isExcluded) { excludedIncome += amount; excludedCount++; }
        } else if (t.type === 'expense') {
          if (mode === 'real') expenses += amount;
          else if (!isExcluded) {
            expenses += Math.max(0, amount - refunded);
            if (refunded > 0) { refundOffset += Math.min(refunded, amount); refundedCount++; }
          }
          if (isExcluded) { excludedExpenses += amount; excludedCount++; }
        } else if (t.type === 'transfer') {
          transferFees += Number(t.transfer_fee || 0);
        }
      }
      const finalBalance = initial + income - expenses - transferFees;
      return { initial, income, expenses, finalBalance, net: income - expenses - transferFees,
        excludedCount, refundedCount, excludedIncome, excludedExpenses, refundOffset };
    };

    return {
      real: compute(t => parseLocalDate(t.transaction_date), 'real'),
      accounting: compute(t => parseLocalDate(t.transaction_date), 'stats'),
      value: compute(t => parseLocalDate(t.value_date || t.transaction_date), 'stats'),
    };
  }, [accounts, transactions, period]);

  const dateShiftDelta = views.accounting.net - views.value.net;
  const exclusionDelta = views.real.net - views.accounting.net;

  // Chart sampling
  const chartData = useMemo(() => {
    if (!balanceEvolutionData || balanceEvolutionData.length === 0) return [];
    const data = balanceEvolutionData;
    const firstDate = data[0]?.dateObj;
    const lastDate = data[data.length - 1]?.dateObj;
    if (!firstDate || !lastDate) return data;
    const totalDays = Math.max(1, differenceInDays(lastDate, firstDate));
    const labelFmt = totalDays > 180 ? (isMobile ? 'MMM' : 'MMM yyyy') : (isMobile ? 'dd/MM' : 'dd MMM');
    const maxPoints = isMobile ? 20 : 40;
    if (data.length <= maxPoints) {
      return data.map(d => ({ ...d, date: format(d.dateObj, labelFmt, { locale: dateLocale }) }));
    }
    const step = Math.max(1, Math.floor(data.length / maxPoints));
    const sampled: BalanceDataPoint[] = [];
    for (let i = 0; i < data.length; i++) {
      const isFirst = i === 0;
      const isLast = i === data.length - 1;
      const isSamplePoint = i % step === 0;
      const isTransition = i > 0 && (
        (data[i].solde === null && data[i - 1].solde !== null) ||
        (data[i].solde !== null && data[i - 1].solde === null)
      );
      if (isFirst || isLast || isSamplePoint || isTransition) {
        sampled.push({ ...data[i], date: format(data[i].dateObj, labelFmt, { locale: dateLocale }) });
      }
    }
    return sampled;
  }, [balanceEvolutionData, isMobile, dateLocale]);

  // Prior-period balance series: shift the prior period onto the current period's day-offset axis,
  // then attach per-sample value to chartData by offset from period.from.
  const priorByOffset = useMemo(() => {
    if (!showPriorOverlay) return null;
    const days = differenceInDays(period.to, period.from);
    const priorFrom = days >= 360
      ? subYears(period.from, 1)
      : addDays(period.from, -(days + 1));
    const priorTo = addDays(priorFrom, days);

    // Compute prior initial balance (roll-back accounts to priorFrom)
    const accountIds = new Set(accounts.map(a => a.id));
    const net = new Map<string, number>();
    for (const tx of transactions) {
      const d = parseLocalDate(tx.transaction_date);
      if (d < priorFrom) continue;
      const srcId = tx.account_id;
      const dstId = tx.transfer_to_account_id;
      if (srcId && accountIds.has(srcId)) {
        const prev = net.get(srcId) || 0;
        if (tx.type === 'income') net.set(srcId, prev - Number(tx.amount));
        else if (tx.type === 'expense') net.set(srcId, prev + Number(tx.amount));
        else if (tx.type === 'transfer') net.set(srcId, prev + Number(tx.amount) + Number(tx.transfer_fee || 0));
      }
      if (dstId && accountIds.has(dstId)) net.set(dstId, (net.get(dstId) || 0) - Number(tx.amount));
    }
    const priorInitial = accounts.reduce((s, a) => s + Number(a.balance) + (net.get(a.id) || 0), 0);

    // Build daily balance map across prior period
    const inPrior = transactions
      .filter(tx => isWithinInterval(parseLocalDate(tx.transaction_date), { start: priorFrom, end: priorTo }))
      .sort((a, b) => parseLocalDate(a.transaction_date).getTime() - parseLocalDate(b.transaction_date).getTime());

    const byOffset = new Map<number, number>();
    let running = priorInitial;
    byOffset.set(0, running);
    for (const tx of inPrior) {
      const delta = tx.type === 'income' ? Number(tx.amount)
        : tx.type === 'expense' ? -Number(tx.amount)
        : -Number(tx.transfer_fee || 0);
      running += delta;
      const offset = differenceInDays(parseLocalDate(tx.transaction_date), priorFrom);
      byOffset.set(offset, running);
    }
    // Fill forward so each day-offset has a value
    const filled = new Map<number, number>();
    let last = priorInitial;
    for (let i = 0; i <= days; i++) {
      if (byOffset.has(i)) last = byOffset.get(i)!;
      filled.set(i, last);
    }
    return filled;
  }, [showPriorOverlay, period, accounts, transactions]);

  const chartDataWithPrior = useMemo(() => {
    if (!priorByOffset) return chartData;
    return chartData.map(d => {
      const offset = differenceInDays(d.dateObj, period.from);
      return { ...d, soldePrior: priorByOffset.get(offset) ?? null };
    });
  }, [chartData, priorByOffset, period.from]);

  const yDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [0, 1000];
    let min = Infinity, max = -Infinity;
    for (const d of chartData) {
      if (d.solde !== null && d.solde !== undefined) { min = Math.min(min, d.solde); max = Math.max(max, d.solde); }
      if (d.soldeProjecte !== undefined) { min = Math.min(min, d.soldeProjecte); max = Math.max(max, d.soldeProjecte); }
    }
    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = 1000;
    const range = max - min || 1;
    const padding = range * 0.1;
    return [Math.floor((min - padding) / 100) * 100, Math.ceil((max + padding) / 100) * 100];
  }, [chartData]);

  const yTickFormatter = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${Math.round(value)}`;
  };

  const xTickInterval = Math.max(0, Math.floor(chartData.length / (isMobile ? 5 : 8)) - 1);

  // Projected transaction list
  const projectedTransactions = useMemo(() => {
    const items: Array<{ id: string; description: string; amount: number; date: string; type: 'income' | 'expense'; category?: { name: string; color: string }; account?: string }> = [];
    for (const pi of recurringData.periodItems) {
      const futureDetails = (pi.occurrenceDetails || []).filter(d => d.isFuture);
      futureDetails.forEach((occ, idx) => {
        items.push({
          id: `${pi.recurring.id}-${idx}`,
          description: resolveNamePlaceholders(pi.recurring.description, parseLocalDate(occ.date)),
          amount: occ.amount,
          date: occ.date,
          type: pi.effectiveType,
          category: pi.recurring.category ? { name: pi.recurring.category.name, color: pi.recurring.category.color } : undefined,
          account: pi.recurring.account?.name,
        });
      });
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    return items;
  }, [recurringData.periodItems]);

  const projectedIncome = projectedTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const projectedExpenses = projectedTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const chartFinalBalance = useMemo(() => {
    for (let i = balanceEvolutionData.length - 1; i >= 0; i--) {
      const p = balanceEvolutionData[i];
      if (typeof p.solde === 'number') return p.solde;
    }
    return views.real.finalBalance;
  }, [balanceEvolutionData, views.real.finalBalance]);

  const projectedFinalBalance = useMemo(() => {
    for (let i = balanceEvolutionData.length - 1; i >= 0; i--) {
      const p = balanceEvolutionData[i];
      if (typeof p.soldeProjecte === 'number') return p.soldeProjecte;
    }
    return chartFinalBalance;
  }, [balanceEvolutionData, chartFinalBalance]);

  const viewMeta = {
    real: { label: t('reports.analysis.viewReal', { defaultValue: 'Real' }), sub: t('reports.analysis.viewRealSub', { defaultValue: 'All movements, gross' }), Icon: Activity },
    accounting: { label: t('reports.analysis.viewAccounting', { defaultValue: 'Accounting' }), sub: t('reports.analysis.viewAccountingSub', { defaultValue: 'Excludes flagged, nets refunds' }), Icon: CalendarCheck2 },
    value: { label: t('reports.analysis.viewValue', { defaultValue: 'Value date' }), sub: t('reports.analysis.viewValueSub', { defaultValue: 'Same rules, posted by clearing date' }), Icon: CalendarClock },
  } as const;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Balance chart card */}
      <Card>
        <CardHeader className="pb-2 px-3 sm:px-4 pt-3 sm:pt-4 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm sm:text-base">{t('reports.balanceEvolution')}</CardTitle>
            <CardDescription className="text-[10.5px] sm:text-xs">
              {t('reports.analysis.acrossAccounts', { count: accounts.length, defaultValue: 'Across {{count}} accounts · projection based on recurring transactions' })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-muted-foreground">
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-3.5 rounded-sm bg-[hsl(var(--pos))]" />
              {t('reports.analysis.actual', { defaultValue: 'Actual' })}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3.5 rounded-sm bg-[hsl(var(--pos)/0.18)]" />
              {t('reports.analysis.projection', { defaultValue: 'Projection' })}
            </span>
            <button
              type="button"
              onClick={() => setShowPriorOverlay(v => !v)}
              className={cn(
                "h-7 px-2.5 rounded-md border text-[10.5px] font-medium inline-flex items-center gap-1.5 transition-colors",
                showPriorOverlay
                  ? "border-foreground/30 bg-secondary text-foreground"
                  : "border-line bg-card text-muted-foreground hover:bg-bg-hover"
              )}
            >
              <span className="inline-block h-[2px] w-3 rounded-sm bg-muted-foreground" style={{ backgroundImage: 'linear-gradient(to right, hsl(var(--muted-foreground)) 50%, transparent 50%)', backgroundSize: '4px 2px' }} />
              {showPriorOverlay
                ? t('reports.analysis.priorOverlayHide', { defaultValue: 'Hide prior period' })
                : t('reports.analysis.priorOverlay', { defaultValue: 'Show prior period' })}
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-1.5 sm:px-4 pb-2 sm:pb-4">
          {chartData.length > 0 ? (
            <>
              <div className="w-full h-[200px] sm:h-[260px] lg:h-[300px] overflow-hidden">
                <ChartContainer config={chartConfig} className="w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartDataWithPrior} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis dataKey="date" fontSize={9} tickLine={false} axisLine={false} className="text-muted-foreground" interval={xTickInterval} />
                      <YAxis fontSize={9} tickLine={false} axisLine={false} className="text-muted-foreground" width={50} domain={yDomain} tickFormatter={yTickFormatter} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => [
                              typeof value === 'number' ? formatCurrency(value) : 'N/A',
                              name === 'solde' ? t('reports.analysis.actual', { defaultValue: 'Actual' })
                                : name === 'soldePrior' ? t('reports.analysis.priorOverlay', { defaultValue: 'Prior period' })
                                : t('reports.analysis.projection', { defaultValue: 'Projection' }),
                            ]}
                            labelFormatter={(label) => label}
                          />
                        }
                      />
                      {showPriorOverlay && (
                        <Line type="monotone" dataKey="soldePrior" stroke={chartConfig.soldePrior.color} strokeWidth={1.25} strokeDasharray="3 3" dot={false} connectNulls />
                      )}
                      <Area type="monotone" dataKey="solde" stroke={chartConfig.solde.color} fill={chartConfig.solde.color} fillOpacity={0.2} strokeWidth={2.25} connectNulls={false} />
                      <Line type="monotone" dataKey="soldeProjecte" stroke={chartConfig.soldeProjecte.color} strokeWidth={1.5} strokeDasharray="2 4" dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
              {/* Inline annotation strip */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg-subtle px-3 py-2 text-[11.5px] font-medium text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    <b className="font-medium tabular-nums font-mono text-foreground">{formatCurrency(chartFinalBalance)}</b> {t('reports.analysis.today', { defaultValue: 'today' })}
                  </span>
                  <span className="text-fg-dim">·</span>
                  <span>
                    {t('reports.analysis.projectedEndOfPeriod', { defaultValue: 'Projected end' })}{' '}
                    <b className={cn("font-medium tabular-nums font-mono", projectedFinalBalance >= 0 ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>
                      {formatCurrency(projectedFinalBalance)}
                    </b>
                  </span>
                </div>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-fg-dim">
                  {projectedTransactions.length} {t('reports.analysis.projected', { defaultValue: 'projected' })}
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-[200px] w-full items-center justify-center">
              <p className="text-sm text-muted-foreground">{t('reports.analysis.noData', { defaultValue: 'No data available' })}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconciliation disclosure */}
      <Collapsible open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <div className="rounded-xl border border-line bg-card">
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-bg-hover/50 transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                </div>
                <div className="text-left min-w-0">
                  <div className="text-[12.5px] font-medium text-foreground truncate">
                    {t('reports.analysis.usingAccountingDate', { defaultValue: 'Using accounting date' })} ·{' '}
                    <b className={cn("font-medium font-mono tabular-nums", stats.netPeriodBalance >= 0 ? "text-foreground" : "text-[hsl(var(--neg))]")}>
                      {formatCurrency(stats.netPeriodBalance)}
                    </b>{' '}
                    {t('reports.analysis.net', { defaultValue: 'net' })}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {views.accounting.excludedCount > 0 && (
                      <>
                        <b className="font-medium font-mono text-foreground">{views.accounting.excludedCount}</b>{' '}
                        {t('reports.analysis.excludedTx', { defaultValue: 'excluded' })}
                      </>
                    )}
                    {views.accounting.refundedCount > 0 && (
                      <>
                        {views.accounting.excludedCount > 0 && ' · '}
                        <b className="font-medium font-mono text-foreground">{formatCurrency(views.accounting.refundOffset)}</b>{' '}
                        {t('reports.analysis.inRefundsNetted', { defaultValue: 'refunds netted' })}
                      </>
                    )}
                    {Math.abs(dateShiftDelta) > 0.01 && (
                      <>
                        {(views.accounting.excludedCount > 0 || views.accounting.refundedCount > 0) && ' · '}
                        {t('reports.analysis.valueDiffersBy', { defaultValue: 'value date differs by' })}{' '}
                        <b className={cn("font-medium font-mono", dateShiftDelta >= 0 ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>
                          {dateShiftDelta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(dateShiftDelta))}
                        </b>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground font-mono flex-shrink-0">
                {reconcileOpen
                  ? t('reports.analysis.hide', { defaultValue: 'Hide' })
                  : t('reports.analysis.viewOtherConventions', { defaultValue: 'View other conventions' })}
                <ChevronDown className={cn("h-3 w-3 transition-transform", reconcileOpen && "rotate-180")} />
              </span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-line">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="border-b border-line px-3 py-2 text-left font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
                      {t('reports.analysis.view', { defaultValue: 'View' })}
                    </th>
                    <th className="border-b border-line px-3 py-2 text-right font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
                      {t('reports.analysis.starting', { defaultValue: 'Starting' })}
                    </th>
                    <th className="border-b border-line px-3 py-2 text-right font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
                      {t('reports.analysis.income', { defaultValue: 'Income' })}
                    </th>
                    <th className="border-b border-line px-3 py-2 text-right font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
                      {t('reports.analysis.expenses', { defaultValue: 'Expenses' })}
                    </th>
                    <th className="border-b border-line px-3 py-2 text-right font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
                      {t('reports.analysis.net', { defaultValue: 'Net' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(['real', 'accounting', 'value'] as const).map(k => {
                    const v = views[k];
                    const meta = viewMeta[k];
                    const isCurrent = k === 'accounting';
                    return (
                      <tr key={k} className={cn(isCurrent && "bg-bg-subtle")}>
                        <td className="border-b border-line px-3 py-2.5 last:border-b-0">
                          <div className="font-medium text-foreground">{meta.label}</div>
                          <div className="text-[10.5px] text-muted-foreground mt-[1px]">
                            {meta.sub}
                            {isCurrent && <> · <b className="font-medium text-foreground">{t('reports.analysis.current', { defaultValue: 'current' })}</b></>}
                          </div>
                        </td>
                        <td className="border-b border-line px-3 py-2.5 text-right font-mono font-medium tabular-nums text-foreground last:border-b-0">{formatCurrency(v.initial)}</td>
                        <td className="border-b border-line px-3 py-2.5 text-right font-mono font-medium tabular-nums text-[hsl(var(--pos))] last:border-b-0">+{formatCurrency(v.income)}</td>
                        <td className="border-b border-line px-3 py-2.5 text-right font-mono font-medium tabular-nums text-[hsl(var(--neg))] last:border-b-0">−{formatCurrency(v.expenses)}</td>
                        <td className={cn("border-b border-line px-3 py-2.5 text-right font-mono tabular-nums last:border-b-0", isCurrent ? "font-semibold" : "font-medium")}>
                          {formatCurrency(v.net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg-subtle px-3.5 py-2.5 text-[11px] font-medium text-muted-foreground">
                <span>
                  {t('reports.analysis.reconcileExplain', {
                    defaultValue: 'Differences come from excluded transactions, refund netting, and value-date shifts.',
                  })}
                </span>
                {Math.abs(chartFinalBalance - views.real.finalBalance) > 0.01 && (
                  <span className="font-mono text-[10.5px]">
                    {t('reports.analysis.chartEndpoint', { defaultValue: 'Chart endpoint' })}: <b className="font-medium text-foreground">{formatCurrency(chartFinalBalance)}</b>
                  </span>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Projected transactions list */}
      {projectedTransactions.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-4 pt-3 sm:pt-4">
            <CardTitle className="text-sm sm:text-base">{t('reports.analysis.recurringProjection', { defaultValue: 'Recurring projection' })}</CardTitle>
            <CardDescription className="text-[10.5px] sm:text-xs">
              {projectedTransactions.length}{' '}
              {projectedTransactions.length > 1
                ? t('reports.analysis.txComing', { defaultValue: 'transactions coming up' })
                : t('reports.analysis.txComingOne', { defaultValue: 'transaction coming up' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <SummaryTile label={t('reports.analysis.moneyIn', { defaultValue: 'Money in' })} value={`+${formatCurrency(projectedIncome)}`} tone="pos" />
              <SummaryTile label={t('reports.analysis.moneyOut', { defaultValue: 'Money out' })} value={`−${formatCurrency(projectedExpenses)}`} tone="neg" />
              <SummaryTile label={t('dashboard.projectedBalanceShort')} value={formatCurrency(projectedFinalBalance)} tone={projectedFinalBalance >= 0 ? "pos" : "neg"} />
            </div>
            <div className="space-y-1">
              {projectedTransactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-muted/20 p-2 sm:p-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className={cn("grid h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0 place-items-center rounded-md",
                      tx.type === 'income' ? "bg-[hsl(var(--pos)/0.12)]" : "bg-[hsl(var(--neg)/0.12)]")}>
                      {tx.type === 'income'
                        ? <ArrowDownRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[hsl(var(--pos))]" />
                        : <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[hsl(var(--neg))]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium truncate">{tx.description}</p>
                      <div className="flex items-center gap-1.5 text-[10.5px] sm:text-xs text-muted-foreground">
                        <span className="font-mono">{format(parseLocalDate(tx.date), 'dd MMM', { locale: dateLocale })}</span>
                        {tx.account && (<><span>•</span><span className="truncate">{tx.account}</span></>)}
                        {tx.category && (
                          <><span>•</span>
                            <div className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tx.category.color }} />
                              <span className="truncate">{tx.category.name}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={cn("flex-shrink-0 font-mono text-xs sm:text-sm font-semibold tabular-nums",
                    tx.type === 'income' ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>
                    {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const SummaryTile = ({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' }) => (
  <div className={cn("rounded-xl border p-2 sm:p-2.5 text-center",
    tone === 'pos'
      ? "border-[hsl(var(--pos)/0.15)] bg-[hsl(var(--pos)/0.05)]"
      : "border-[hsl(var(--neg)/0.15)] bg-[hsl(var(--neg)/0.05)]")}>
    <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
    <p className={cn("text-xs sm:text-sm font-bold font-mono tabular-nums",
      tone === 'pos' ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]")}>{value}</p>
  </div>
);
