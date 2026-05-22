import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ComposedChart, CartesianGrid, XAxis, YAxis, Area, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { GRID_PROPS } from "@/lib/chartConfig";
import { BalanceDataPoint, ReportsStats, RecurringData, ReportsPeriod } from "@/hooks/useReportsData";
import { ArrowUpRight, ArrowDownRight, Activity, CalendarClock, CalendarCheck2, Info } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format, differenceInDays, isWithinInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { enUS } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveNamePlaceholders } from "@/utils/namePlaceholders";
import { parseLocalDate } from "@/lib/dateUtils";
import { useFinancialData } from "@/hooks/useFinancialData";

interface EvolutionTabProps {
  balanceEvolutionData: BalanceDataPoint[];
  stats: ReportsStats;
  recurringData: RecurringData;
  period: ReportsPeriod;
}

const chartConfig = {
  solde: {
    label: "Solde",
    color: "hsl(var(--primary))"
  },
  soldeProjecte: {
    label: "Solde Projeté",
    color: "hsl(var(--primary) / 0.6)"
  }
};

export const EvolutionTab = ({
  balanceEvolutionData,
  stats,
  recurringData,
  period,
}: EvolutionTabProps) => {
  const { formatCurrency } = useUserPreferences();
  const { accounts, transactions } = useFinancialData();
  const isMobile = useIsMobile();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;

  const actualTotalBalance = useMemo(
    () => accounts.reduce((s, a) => s + Number(a.balance), 0),
    [accounts]
  );

  // Compute three views of the same period: REAL (all tx, gross), ACCOUNTING (stats, accounting date),
  // VALUE (stats, value date). All three rolled back from current account balances.
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

    const compute = (
      getDate: (t: typeof transactions[number]) => Date,
      mode: 'real' | 'stats'
    ) => {
      const initial = rollBackInitial(getDate);
      const inPeriod = transactions.filter(t =>
        isWithinInterval(getDate(t), { start: period.from, end: period.to })
      );
      let income = 0, expenses = 0, transferFees = 0;
      let excludedIncome = 0, excludedExpenses = 0, refundOffset = 0;
      let excludedCount = 0, refundedCount = 0;

      for (const t of inPeriod) {
        const isExcluded = t.include_in_stats === false;
        const amount = Number(t.amount);
        const refunded = Number(t.refunded_amount || 0);

        if (t.type === 'income') {
          if (mode === 'real') income += amount;
          else if (!isExcluded && !t.refund_of_transaction_id) income += amount;
          if (isExcluded) { excludedIncome += amount; excludedCount++; }
        } else if (t.type === 'expense') {
          if (mode === 'real') {
            expenses += amount;
          } else if (!isExcluded) {
            expenses += Math.max(0, amount - refunded);
            if (refunded > 0) { refundOffset += Math.min(refunded, amount); refundedCount++; }
          }
          if (isExcluded) { excludedExpenses += amount; excludedCount++; }
        } else if (t.type === 'transfer') {
          transferFees += Number(t.transfer_fee || 0);
        }
      }

      const finalBalance = initial + income - expenses - transferFees;
      return {
        initial, income, expenses, transferFees, finalBalance,
        excludedIncome, excludedExpenses, refundOffset,
        excludedCount, refundedCount,
        count: inPeriod.length,
      };
    };

    return {
      real: compute(t => parseLocalDate(t.transaction_date), 'real'),
      accounting: compute(t => parseLocalDate(t.transaction_date), 'stats'),
      value: compute(t => parseLocalDate(t.value_date || t.transaction_date), 'stats'),
    };
  }, [accounts, transactions, period]);

  // Real chart endpoint (last actual solde) — should equal views.real.finalBalance.
  const chartFinalBalance = useMemo(() => {
    for (let i = balanceEvolutionData.length - 1; i >= 0; i--) {
      const p = balanceEvolutionData[i];
      if (typeof p.solde === 'number') return p.solde;
    }
    return views.real.finalBalance;
  }, [balanceEvolutionData, views.real.finalBalance]);


  // Process chart data: smart sampling + adaptive date labels
  const chartData = useMemo(() => {
    if (!balanceEvolutionData || balanceEvolutionData.length === 0) return [];

    const data = balanceEvolutionData;
    const firstDate = data[0]?.dateObj;
    const lastDate = data[data.length - 1]?.dateObj;
    if (!firstDate || !lastDate) return data;

    const totalDays = Math.max(1, differenceInDays(lastDate, firstDate));

    const labelFmt = totalDays > 180
      ? (isMobile ? 'MMM' : 'MMM yyyy')
      : totalDays > 60
        ? (isMobile ? 'dd/MM' : 'dd MMM')
        : (isMobile ? 'dd/MM' : 'dd MMM');

    const maxPoints = isMobile ? 20 : 30;
    if (data.length <= maxPoints) {
      return data.map(d => ({
        ...d,
        date: format(d.dateObj, labelFmt, { locale: dateLocale }),
      }));
    }

    const sampled: BalanceDataPoint[] = [];
    const step = Math.max(1, Math.floor(data.length / maxPoints));

    for (let i = 0; i < data.length; i++) {
      const isFirst = i === 0;
      const isLast = i === data.length - 1;
      const isSamplePoint = i % step === 0;
      const isTransition = i > 0 && (
        (data[i].solde === null && data[i - 1].solde !== null) ||
        (data[i].solde !== null && data[i - 1].solde === null)
      );

      if (isFirst || isLast || isSamplePoint || isTransition) {
        sampled.push({
          ...data[i],
          date: format(data[i].dateObj, labelFmt, { locale: dateLocale }),
        });
      }
    }

    return sampled;
  }, [balanceEvolutionData, isMobile]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 1000];
    let min = Infinity, max = -Infinity;
    for (const d of chartData) {
      if (d.solde !== null) { min = Math.min(min, d.solde); max = Math.max(max, d.solde); }
      if (d.soldeProjecte !== undefined) { min = Math.min(min, d.soldeProjecte); max = Math.max(max, d.soldeProjecte); }
    }
    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = 1000;
    const range = max - min || 1;
    const padding = range * 0.1;
    const yMin = Math.floor((min - padding) / 100) * 100;
    const yMax = Math.ceil((max + padding) / 100) * 100;
    return [yMin, yMax] as [number, number];
  }, [chartData]);

  const yTickFormatter = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${Math.round(value)}`;
  };

  const xTickInterval = Math.max(0, Math.floor(chartData.length / (isMobile ? 5 : 8)) - 1);

  // Build flat list of future projected transactions sorted by date
  const projectedTransactions = useMemo(() => {
    const items: Array<{
      id: string;
      description: string;
      amount: number;
      date: string;
      type: 'income' | 'expense';
      category?: { name: string; color: string };
      account?: string;
    }> = [];

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

  // Compute projected balance from the actual balance curve (always accounting date)
  const gapBalance = recurringData.gapBalance || 0;
  const projectedFinalBalance = useMemo(() => {
    const lastProjectedPoint = [...balanceEvolutionData]
      .reverse()
      .find(point => typeof point.soldeProjecte === 'number');

    if (lastProjectedPoint) return lastProjectedPoint.soldeProjecte;

    let balance = actualTotalBalance;
    for (const tx of projectedTransactions) {
      balance += tx.type === 'income' ? tx.amount : -tx.amount;
    }
    return balance;
  }, [actualTotalBalance, balanceEvolutionData, projectedTransactions]);

  const projectedIncome = projectedTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const projectedExpenses = projectedTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  type ViewKey = 'real' | 'accounting' | 'value';
  const viewMeta: Record<ViewKey, { label: string; sub: string; Icon: typeof Activity; tone: string }> = {
    real: {
      label: 'Réel',
      sub: 'Tous les mouvements (date comptable, montants bruts)',
      Icon: Activity,
      tone: 'text-foreground',
    },
    accounting: {
      label: 'Date comptable',
      sub: 'Statistiques — exclus retirés, dépenses nettes des remboursements',
      Icon: CalendarCheck2,
      tone: 'text-foreground',
    },
    value: {
      label: 'Date valeur',
      sub: 'Mêmes règles, basé sur la date valeur',
      Icon: CalendarClock,
      tone: 'text-foreground',
    },
  };

  const ViewRow = ({ k }: { k: ViewKey }) => {
    const v = views[k];
    const meta = viewMeta[k];
    const Icon = meta.Icon;
    return (
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg grid place-items-center bg-muted/50 flex-shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold">{meta.label}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{meta.sub}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border border-border/40 bg-muted/20 p-2">
              <p className="text-[10px] text-muted-foreground">Début</p>
              <p className="text-xs sm:text-sm font-bold tabular-nums">{formatCurrency(v.initial)}</p>
            </div>
            <div className="rounded-lg border border-success/15 bg-success/5 p-2">
              <p className="text-[10px] text-muted-foreground">Revenus</p>
              <p className="text-xs sm:text-sm font-bold text-success tabular-nums">+{formatCurrency(v.income)}</p>
            </div>
            <div className="rounded-lg border border-destructive/15 bg-destructive/5 p-2">
              <p className="text-[10px] text-muted-foreground">Dépenses</p>
              <p className="text-xs sm:text-sm font-bold text-destructive tabular-nums">−{formatCurrency(v.expenses)}</p>
            </div>
            <div className="rounded-lg border border-primary/15 bg-primary/5 p-2">
              <p className="text-[10px] text-muted-foreground">Fin</p>
              <p className={cn(
                "text-xs sm:text-sm font-bold tabular-nums",
                v.finalBalance >= 0 ? "text-success" : "text-destructive"
              )}>{formatCurrency(v.finalBalance)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const dateShiftDelta = views.accounting.finalBalance - views.value.finalBalance;
  const exclusionDelta = views.real.finalBalance - views.accounting.finalBalance;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Three views: real / accounting / value */}
      <div className="grid grid-cols-1 gap-2 sm:gap-3">
        <ViewRow k="real" />
        <ViewRow k="accounting" />
        <ViewRow k="value" />
      </div>

      {/* What drives the differences */}
      {(Math.abs(exclusionDelta) > 0.01 || Math.abs(dateShiftDelta) > 0.01) && (
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-4 pt-3 sm:pt-4">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Ce qui explique les écarts
            </CardTitle>
            <CardDescription className="text-[10px] sm:text-xs">
              Comparaison des trois vues sur la même période
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 text-xs sm:text-sm">
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/20 border border-border/30">
              <span className="text-muted-foreground">
                Réel − Date comptable
                <span className="block text-[10px]">Transactions exclues + remboursements bruts vs nets</span>
              </span>
              <span className={cn("font-semibold tabular-nums", exclusionDelta >= 0 ? "text-success" : "text-destructive")}>
                {exclusionDelta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(exclusionDelta))}
              </span>
            </div>
            {(views.accounting.excludedCount > 0 || views.accounting.refundedCount > 0) && (
              <div className="grid grid-cols-2 gap-2 pl-2">
                {views.accounting.excludedCount > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    {views.accounting.excludedCount} exclue{views.accounting.excludedCount > 1 ? 's' : ''} ·
                    {' '}+{formatCurrency(views.accounting.excludedIncome)} / −{formatCurrency(views.accounting.excludedExpenses)}
                  </div>
                )}
                {views.accounting.refundedCount > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    {views.accounting.refundedCount} remboursée{views.accounting.refundedCount > 1 ? 's' : ''} ·
                    {' '}−{formatCurrency(views.accounting.refundOffset)} de dépenses déduites
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/20 border border-border/30">
              <span className="text-muted-foreground">
                Date comptable − Date valeur
                <span className="block text-[10px]">Transactions dont la date valeur tombe hors période</span>
              </span>
              <span className={cn("font-semibold tabular-nums", dateShiftDelta >= 0 ? "text-success" : "text-destructive")}>
                {dateShiftDelta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(dateShiftDelta))}
              </span>
            </div>
            {Math.abs(chartFinalBalance - views.real.finalBalance) > 0.01 && (
              <div className="text-[11px] text-muted-foreground pl-2">
                Solde de fin du graphique : {formatCurrency(chartFinalBalance)}
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {/* Balance evolution chart */}
      <Card className="">
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-4 pt-3 sm:pt-4">
          <div>
            <CardTitle className="text-sm sm:text-base">{t('reports.balanceEvolution')}</CardTitle>
            <CardDescription className="text-[10px] sm:text-xs hidden sm:block">
              Projection basée sur les transactions récurrentes
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-1.5 sm:px-4 pb-2 sm:pb-4">
          {chartData.length > 0 ? (
            <div className="w-full h-[180px] sm:h-[250px] lg:h-[300px] overflow-hidden">
              <ChartContainer config={chartConfig} className="w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis
                      dataKey="date"
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                      interval={xTickInterval}
                    />
                    <YAxis
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                      width={50}
                      domain={yDomain}
                      tickFormatter={yTickFormatter}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => [
                            typeof value === 'number'
                              ? formatCurrency(value)
                              : 'N/A',
                            name === 'solde' ? 'Solde réel' : 'Projeté'
                          ]}
                          labelFormatter={(label) => label}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="solde"
                      stroke={chartConfig.solde.color}
                      fill={chartConfig.solde.color}
                      fillOpacity={0.2}
                      strokeWidth={2}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="soldeProjecte"
                      stroke={chartConfig.soldeProjecte.color}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls={true}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          ) : (
            <div className="w-full h-[200px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Aucune donnée disponible</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projected recurring summary + transaction breakdown */}
      {projectedTransactions.length > 0 && (
        <Card className="">
          <CardHeader className="pb-2 px-3 sm:px-4 pt-3 sm:pt-4">
            <CardTitle className="text-sm sm:text-base">Projection récurrente</CardTitle>
            <CardDescription className="text-[10px] sm:text-xs">
              {projectedTransactions.length} transaction{projectedTransactions.length > 1 ? 's' : ''} à venir sur la période
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 sm:p-2.5 rounded-xl bg-success/5 border border-success/10 text-center">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Revenus</p>
                <p className="text-xs sm:text-sm font-bold text-success">+{formatCurrency(projectedIncome)}</p>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-destructive/5 border border-destructive/10 text-center">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Dépenses</p>
                <p className="text-xs sm:text-sm font-bold text-destructive">-{formatCurrency(projectedExpenses)}</p>
              </div>
              <div className="p-2 sm:p-2.5 rounded-xl bg-primary/5 border border-primary/10 text-center">
                <p className="text-[10px] sm:text-xs text-muted-foreground">{t('dashboard.projectedBalanceShort')}</p>
                <p className={cn(
                  "text-xs sm:text-sm font-bold",
                  projectedFinalBalance >= 0 ? "text-success" : "text-destructive"
                )}>
                  {formatCurrency(projectedFinalBalance)}
                </p>
              </div>
            </div>

            {/* Transaction list */}
            <div className="space-y-1">
              {projectedTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-lg bg-muted/20 border border-border/30"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={cn(
                      "w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                      tx.type === 'income' ? "bg-success/10" : "bg-destructive/10"
                    )}>
                      {tx.type === 'income'
                        ? <ArrowDownRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-success" />
                        : <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-destructive" />
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium truncate">{tx.description}</p>
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
                        <span>{format(parseLocalDate(tx.date), 'dd MMM', { locale: dateLocale })}</span>
                        {tx.account && (
                          <>
                            <span>•</span>
                            <span className="truncate">{tx.account}</span>
                          </>
                        )}
                        {tx.category && (
                          <>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tx.category.color }} />
                              <span className="truncate">{tx.category.name}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={cn(
                    "text-xs sm:text-sm font-semibold flex-shrink-0",
                    tx.type === 'income' ? "text-success" : "text-destructive"
                  )}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
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
