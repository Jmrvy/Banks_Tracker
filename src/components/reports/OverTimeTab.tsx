import { useMemo, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ComposedChart, CartesianGrid, XAxis, YAxis, Area, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/contexts/PrivacyContext";
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

export const OverTimeTab = ({ balanceEvolutionData, stats, recurringData, period, dateType }: OverTimeTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
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
          else if (!isExcluded && !t.refund_of_transaction_id) {
            // computePeriodStats: net of what has been repaid, and income
            // marked as having come back on its category is a reduction of
            // spend rather than earnings.
            const net = Math.max(0, amount - Number(t.repaid_amount || 0));
            if (t.offsets_category) expenses -= net;
            else income += net;
          }
          if (isExcluded) { excludedIncome += amount; excludedCount++; }
        } else if (t.type === 'expense') {
          if (mode === 'real') expenses += amount;
          else if (!isExcluded && !t.repayment_of_transaction_id) {
            // Signed, not floored — this row is the reconciliation table's
            // own definition of the number printed in the card header.
            expenses += amount - refunded;
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
    <div className="flex flex-col gap-3.5">
      {/* Balance chart card */}
      <div className="ft-card">
        <div className="ft-card-head">
          <div className="min-w-0">
            <h3 className="ft-card-title">{t('reports.balanceEvolution')}</h3>
            <div className="ft-card-sub">
              {t('reports.analysis.acrossAccounts', { count: accounts.length, defaultValue: 'Across {{count}} accounts · projection based on recurring transactions' })}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="ft-legend hidden sm:flex">
              <span>
                <i className="ft-swatch bg-[hsl(var(--pos))]" aria-hidden />
                {t('reports.analysis.actual', { defaultValue: 'Actual' })}
              </span>
              <span>
                <i aria-hidden className="inline-block w-3.5 border-t-[1.5px] border-dashed border-fg-dim" />
                {t('reports.analysis.projection', { defaultValue: 'Projection' })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPriorOverlay(v => !v)}
              aria-pressed={showPriorOverlay}
              className={cn("ft-chip", showPriorOverlay && "active")}
            >
              <span aria-hidden className="inline-block h-[2px] w-3 rounded-sm" style={{ backgroundImage: 'linear-gradient(to right, currentColor 50%, transparent 50%)', backgroundSize: '4px 2px' }} />
              {showPriorOverlay
                ? t('reports.analysis.priorOverlayHide', { defaultValue: 'Hide prior period' })
                : t('reports.analysis.priorOverlay', { defaultValue: 'Show prior period' })}
            </button>
          </div>
        </div>
        <div>
          {chartData.length > 0 ? (
            <>
                <ChartContainer config={chartConfig} className="w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartDataWithPrior} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--grid))" />
                      <XAxis dataKey="date" fontSize={9} tickLine={false} axisLine={false} className="text-muted-foreground" interval={xTickInterval} />
                      {/* The Y ticks are money read-outs: blur the tick layer
                          under privacy while the line itself stays visible. */}
                      <YAxis fontSize={9} tickLine={false} axisLine={false} className={cn("text-muted-foreground", isPrivacyMode && "ft-priv")} width={50} domain={yDomain} tickFormatter={yTickFormatter} />
                      {/* Tooltip skin per the chart spec: card surface, line
                          border, 11px radius, sh-2 — overriding the shadcn
                          defaults. Amounts blur under privacy. */}
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            className={cn("bg-card border-line rounded-md shadow-sh-2 text-foreground", isPrivacyMode && "ft-priv")}
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
              {/* Three sunk read-outs closing the chart: where the period
                  started, where it stands, where it lands. */}
              <div className="ft-g3 mt-5">
                <div className="ft-card ft-card-sunk p-[15px]">
                  <div className="ft-eyebrow">{t('reports.analysis.initialBalance', { defaultValue: 'Starting' })}</div>
                  <div className={cn("ft-num text-[20px] font-medium mt-1.5 mb-0.5", isPrivacyMode && "ft-priv")}>{formatCurrency(views[dateType].initial)}</div>
                  <div className="ft-dim text-[11.5px]">{format(period.from, 'd MMM yyyy', { locale: dateLocale })}</div>
                </div>
                <div className="ft-card ft-card-sunk p-[15px]">
                  <div className="ft-eyebrow">{t('reports.analysis.currentBalance', { defaultValue: 'Current' })}</div>
                  <div className={cn("ft-num text-[20px] font-medium mt-1.5 mb-0.5", isPrivacyMode && "ft-priv")}>{formatCurrency(chartFinalBalance)}</div>
                  <div className="ft-dim text-[11.5px]">{t('reports.analysis.today', { defaultValue: 'today' })}</div>
                </div>
                <div className="ft-card ft-card-sunk p-[15px]">
                  <div className="ft-eyebrow">{t('reports.analysis.projectedEnd', { defaultValue: 'Projected end' })}</div>
                  <div className={cn("ft-num text-[20px] font-medium mt-1.5 mb-0.5", projectedFinalBalance >= 0 ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]", isPrivacyMode && "ft-priv")}>
                    {formatCurrency(projectedFinalBalance)}
                  </div>
                  <div className="ft-dim text-[11.5px]">
                    {format(period.to, 'd MMM yyyy', { locale: dateLocale })} · {projectedTransactions.length}{' '}
                    {t('reports.analysis.projected', { defaultValue: 'projected' })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-[200px] w-full items-center justify-center">
              <p className="text-sm text-muted-foreground">{t('reports.analysis.noData', { defaultValue: 'No data available' })}</p>
            </div>
          )}
        </div>
      </div>

      {/* Reconciliation disclosure */}
      <Collapsible open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <div className="ft-card p-0">
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between gap-3 px-[22px] py-3.5 hover:bg-bg-subtle transition-colors">
              <div className="flex items-center gap-[13px] min-w-0">
                <div className="ft-glyph sq">
                  <Info className="h-4 w-4" />
                </div>
                <div className="text-left min-w-0">
                  <div className="ft-row-title truncate">
                    {dateType === 'value'
                      ? t('reports.analysis.usingValueDate', { defaultValue: 'Using value date' })
                      : t('reports.analysis.usingAccountingDate', { defaultValue: 'Using accounting date' })} ·{' '}
                    <b className={cn("font-medium font-mono tabular-nums", stats.netPeriodBalance >= 0 ? "text-foreground" : "text-[hsl(var(--neg))]", isPrivacyMode && "ft-priv")}>
                      {formatCurrency(stats.netPeriodBalance)}
                    </b>{' '}
                    {t('reports.analysis.net', { defaultValue: 'net' })}
                  </div>
                  <div className="ft-row-sub truncate">
                    {views[dateType].excludedCount > 0 && (
                      <>
                        <b className="font-medium font-mono text-foreground">{views[dateType].excludedCount}</b>{' '}
                        {t('reports.analysis.excludedTx', { defaultValue: 'excluded' })}
                      </>
                    )}
                    {views[dateType].refundedCount > 0 && (
                      <>
                        {views[dateType].excludedCount > 0 && ' · '}
                        <b className={cn("font-medium font-mono text-foreground", isPrivacyMode && "ft-priv")}>{formatCurrency(views[dateType].refundOffset)}</b>{' '}
                        {t('reports.analysis.inRefundsNetted', { defaultValue: 'refunds netted' })}
                      </>
                    )}
                    {Math.abs(dateShiftDelta) > 0.01 && (
                      <>
                        {(views[dateType].excludedCount > 0 || views[dateType].refundedCount > 0) && ' · '}
                        {t('reports.analysis.valueDiffersBy', { defaultValue: 'value date differs by' })}{' '}
                        <b className={cn("font-medium font-mono", dateShiftDelta >= 0 ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]", isPrivacyMode && "ft-priv")}>
                          {dateShiftDelta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(dateShiftDelta))}
                        </b>
                      </>
                    )}
                  </div>

                </div>
              </div>
              <span className="ft-chip flex-shrink-0">
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
                    const isCurrent = k === dateType;
                    return (
                      <tr key={k} className={cn(isCurrent && "bg-bg-subtle")}>
                        <td className="border-b border-line px-3 py-2.5 last:border-b-0">
                          <div className="font-medium text-foreground">{meta.label}</div>
                          <div className="text-[10.5px] text-muted-foreground mt-[1px]">
                            {meta.sub}
                            {isCurrent && <> · <b className="font-medium text-foreground">{t('reports.analysis.current', { defaultValue: 'current' })}</b></>}
                          </div>
                        </td>
                        <td className={cn("border-b border-line px-3 py-2.5 text-right font-mono font-medium tabular-nums text-foreground last:border-b-0", isPrivacyMode && "ft-priv")}>{formatCurrency(v.initial)}</td>
                        <td className={cn("border-b border-line px-3 py-2.5 text-right font-mono font-medium tabular-nums text-[hsl(var(--pos))] last:border-b-0", isPrivacyMode && "ft-priv")}>+{formatCurrency(v.income)}</td>
                        <td className={cn("border-b border-line px-3 py-2.5 text-right font-mono font-medium tabular-nums text-[hsl(var(--neg))] last:border-b-0", isPrivacyMode && "ft-priv")}>−{formatCurrency(v.expenses)}</td>
                        <td className={cn("border-b border-line px-3 py-2.5 text-right font-mono tabular-nums last:border-b-0", isCurrent ? "font-semibold" : "font-medium", isPrivacyMode && "ft-priv")}>
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
                    {t('reports.analysis.chartEndpoint', { defaultValue: 'Chart endpoint' })}: <b className={cn("font-medium text-foreground", isPrivacyMode && "ft-priv")}>{formatCurrency(chartFinalBalance)}</b>
                  </span>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Projected transactions list */}
      {projectedTransactions.length > 0 && (
        <div className="ft-card-flush">
          <div className="ft-card-head">
            <div className="min-w-0">
              <h3 className="ft-card-title">{t('reports.analysis.recurringProjection', { defaultValue: 'Recurring projection' })}</h3>
              <div className="ft-card-sub">
                {projectedTransactions.length}{' '}
                {projectedTransactions.length > 1
                  ? t('reports.analysis.txComing', { defaultValue: 'transactions coming up' })
                  : t('reports.analysis.txComingOne', { defaultValue: 'transaction coming up' })}
              </div>
            </div>
          </div>
          <div className="ft-sect-p">
            <div className="ft-g3">
              <SummaryTile label={t('reports.analysis.moneyIn', { defaultValue: 'Money in' })} value={`+${formatCurrency(projectedIncome)}`} tone="pos" />
              <SummaryTile label={t('reports.analysis.moneyOut', { defaultValue: 'Money out' })} value={`−${formatCurrency(projectedExpenses)}`} tone="neg" />
              <SummaryTile label={t('dashboard.projectedBalanceShort')} value={formatCurrency(projectedFinalBalance)} tone={projectedFinalBalance >= 0 ? "pos" : "neg"} />
            </div>
          </div>
          <div className="flex flex-col border-t border-line-soft">
            {projectedTransactions.map(tx => (
              <div key={tx.id} className="ft-list-row tx">
                <div
                  aria-hidden
                  className={cn("ft-glyph sq border-transparent",
                    tx.type === 'income'
                      ? "bg-[hsl(var(--pos-soft))] text-[hsl(var(--pos))]"
                      : "bg-[hsl(var(--neg-soft))] text-[hsl(var(--neg))]")}
                >
                  {tx.type === 'income'
                    ? <ArrowDownRight className="h-4 w-4" />
                    : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="ft-row-title ft-trunc">{tx.description}</div>
                  <div className="ft-row-sub ft-trunc">
                    {[
                      format(parseLocalDate(tx.date), 'd MMM', { locale: dateLocale }),
                      tx.account,
                      tx.category?.name,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className={cn("ft-row-amt",
                  tx.type === 'income' ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]",
                  isPrivacyMode && "ft-priv")}>
                  {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryTile = ({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' }) => {
  const { isPrivacyMode } = usePrivacy();
  return (
    <div className={cn("rounded-[15px] border p-[15px]",
      tone === 'pos'
        ? "border-transparent bg-[hsl(var(--pos-soft))]"
        : "border-transparent bg-[hsl(var(--neg-soft))]")}>
      <div className="ft-eyebrow">{label}</div>
      <div className={cn("ft-num text-[20px] font-medium mt-1.5 leading-none",
        tone === 'pos' ? "text-[hsl(var(--pos))]" : "text-[hsl(var(--neg))]",
        isPrivacyMode && "ft-priv")}>{value}</div>
    </div>
  );
};
