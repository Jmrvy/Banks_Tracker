import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ComposedChart, CartesianGrid, XAxis, YAxis, Area, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { GRID_PROPS } from "@/lib/chartConfig";
import { BalanceDataPoint, ReportsStats, RecurringData, ReportsPeriod } from "@/hooks/useReportsData";
import { TrendingUp, TrendingDown, Wallet, Target, ArrowUpRight, ArrowDownRight } from "lucide-react";
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
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

  // Evolution KPIs reuse stats already computed on accounting date
  // (Reports page passes overrideDateType='accounting').
  const evolutionStats = useMemo(
    () => ({
      initialBalance: stats.initialBalance,
      income: stats.income,
      expenses: stats.expenses,
      finalBalance: stats.finalBalance,
    }),
    [stats]
  );

  // Real chart endpoint (last actual solde, not projection) — what the curve visually reaches.
  const chartFinalBalance = useMemo(() => {
    for (let i = balanceEvolutionData.length - 1; i >= 0; i--) {
      const p = balanceEvolutionData[i];
      if (typeof p.solde === 'number') return p.solde;
    }
    return evolutionStats.finalBalance;
  }, [balanceEvolutionData, evolutionStats.finalBalance]);


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

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 ">
        <Card className="">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg grid place-items-center bg-muted/50">
                <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Début</span>
            </div>
            <p className="text-sm sm:text-base font-bold truncate">
              {formatCurrency(evolutionStats.initialBalance)}
            </p>
          </CardContent>
        </Card>

        <Card className="">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg grid place-items-center bg-success/10">
                <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-success" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Revenus</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-success truncate">
              +{formatCurrency(evolutionStats.income)}
            </p>
          </CardContent>
        </Card>

        <Card className="">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg grid place-items-center bg-destructive/10">
                <TrendingDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-destructive" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Dépenses</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-destructive truncate">
              -{formatCurrency(evolutionStats.expenses)}
            </p>
          </CardContent>
        </Card>

        <Card className="">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg grid place-items-center bg-primary/10">
                <Target className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Fin</span>
            </div>
            <p className={cn(
              "text-sm sm:text-base font-bold truncate",
              evolutionStats.finalBalance >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(evolutionStats.finalBalance)}
            </p>
          </CardContent>
        </Card>
      </div>


      {/* Reconciliation note: explain difference between stats "Fin" and the chart's real end-of-period balance */}
      {(() => {
        const kpiFinal = evolutionStats.finalBalance;
        const delta = chartFinalBalance - kpiFinal;
        if (Math.abs(delta) < 0.01) return null;
        return (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] sm:text-xs text-muted-foreground">
            <span>
              Solde réel en fin de période (graphique) :{" "}
              <span className={cn("font-semibold tabular-nums", chartFinalBalance >= 0 ? "text-success" : "text-destructive")}>
                {formatCurrency(chartFinalBalance)}
              </span>
            </span>
            <span>·</span>
            <span>
              Écart avec « Fin » :{" "}
              <span className="font-semibold tabular-nums">
                {delta >= 0 ? "+" : "−"}{formatCurrency(Math.abs(delta))}
              </span>
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px] text-xs">
                  « Fin » = Début + Revenus − Dépenses sur la période, en excluant les transactions « hors statistiques » et en utilisant le montant net des dépenses (déduit des remboursements).
                  Le graphique reflète tous les mouvements réels des comptes (y compris les exclus et les remboursements bruts), d'où l'écart.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      })()}

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
