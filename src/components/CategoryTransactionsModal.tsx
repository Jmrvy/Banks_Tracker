import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, CalendarDays, Clock, CalendarClock } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BANK_COLORS, getBankLabel } from "@/lib/constants";
import { ChartTouchFrame } from "@/components/charts/ChartTouchFrame";
import { CategoryData, PeriodRecurringItem } from "@/hooks/useReportsData";
import { type Transaction as FinancialTransaction } from "@/hooks/useFinancialData";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Area,
} from "recharts";
import { eachDayOfInterval, differenceInDays, format, addDays, addWeeks, addMonths, addYears } from "date-fns";
import { fr } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseLocalDate } from "@/lib/dateUtils";

/** View-model for transactions displayed in the category modal */
export interface CategoryTransaction {
  id: string;
  description: string;
  amount: number;
  netAmount?: number;
  refundedAmount?: number;
  isFullyRefunded?: boolean;
  hasRefund?: boolean;
  bank: string;
  date: string;
  valueDate?: string;
  type: 'expense' | 'income' | 'transfer';
  isProjected?: boolean;
}

interface CategoryTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  transactions: CategoryTransaction[];
  categoryData?: CategoryData;
  allTransactions?: FinancialTransaction[];
  periodStart?: Date;
  periodEnd?: Date;
  dateType?: 'accounting' | 'value';
  includeUpcoming?: boolean;
  upcomingItems?: PeriodRecurringItem[];
}

/** Legacy rows stored 'sg' before the bank ids were normalised. */
const normalizeBank = (bank: string) => (bank === 'sg' ? 'societe_generale' : bank);

/** One source of truth for bank accents — lib/constants, shared with
    Comptes, Nouvelle transaction and Paramètres. Neutral fallback for
    banks without a brand colour. */
const bankAccent = (bank: string) => BANK_COLORS[normalizeBank(bank)] ?? BANK_COLORS.other;

export const CategoryTransactionsModal = ({
  open,
  onOpenChange,
  categoryName,
  transactions,
  categoryData,
  allTransactions,
  periodStart,
  periodEnd,
  dateType,
  includeUpcoming,
  upcomingItems,
}: CategoryTransactionsModalProps) => {
  const { t } = useTranslation();
  const { formatCurrency, preferences } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const isMobile = useIsMobile();
  const activeDateType = dateType || preferences.dateType;

  const projectedCount = transactions.filter(t => t.isProjected).length;
  const realCount = transactions.length - projectedCount;
  
  // Calculer le total en utilisant les montants nets si disponibles
  const totalAmount = transactions.reduce((sum, t) => {
    // Not Math.abs: a net-negative row (refunded past its value) has to pull
    // the total down, otherwise it is counted as if it were spending.
    const netAmount = t.netAmount ?? t.amount;
    return sum + netAmount;
  }, 0);
  const projectedTotal = transactions.filter(t => t.isProjected).reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Vérifier si une transaction a une date valeur différente de la date comptable
  const hasValueDateDifference = (t: CategoryTransaction) => {
    if (!t.valueDate) return false;
    const accountingDate = parseLocalDate(t.date).toDateString();
    const valueDate = parseLocalDate(t.valueDate).toDateString();
    return accountingDate !== valueDate;
  };

  // Budget evolution chart data
  const hasBudget = categoryData && categoryData.budget > 0;

  const getTransactionDate = (t: FinancialTransaction): string => {
    if (activeDateType === 'value') {
      return (t as any).value_date || t.transaction_date;
    }
    return t.transaction_date;
  };

  const days = useMemo(
    () => periodStart && periodEnd ? eachDayOfInterval({ start: periodStart, end: periodEnd }) : [],
    [periodStart, periodEnd]
  );

  const budgetChartData = useMemo(() => {
    if (!hasBudget || !allTransactions || !periodStart || !periodEnd) return [];

    // The same predicate computeCategoryNets uses. Without the last two
    // guards this chart counted special-budget rows and advance
    // settlements, which is how the dialog came to draw 823,88 € above a
    // list of transactions summing to 588,88 €.
    const catTxs = allTransactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.include_in_stats !== false &&
          !t.special_budget_id &&
          !t.repayment_of_transaction_id &&
          t.category?.name === categoryName
      )
      .sort(
        (a, b) =>
          parseLocalDate(getTransactionDate(a)).getTime() -
          parseLocalDate(getTransactionDate(b)).getTime()
      );

    let running = 0;
    const today = format(new Date(), "yyyy-MM-dd");
    const totalDays = days.length;
    const budgetVal = Number(categoryData.budget);

    // Determine label format based on period length
    const labelFmt = totalDays > 180
      ? (isMobile ? 'MMM' : 'MMM yyyy')
      : totalDays > 60
        ? (isMobile ? 'dd/MM' : 'dd MMM')
        : (isMobile ? 'dd' : 'dd MMM');

    // Build cumulative spend per day (real transactions)
    const spentByDay = new Map<string, number>();
    let cumulative = 0;
    for (const day of days) {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayTotal = catTxs
        .filter((t) => getTransactionDate(t) === dayStr)
        .reduce((s, t) => {
          // Signed: an over-refunded day genuinely walks the cumulative
          // line back down.
          const gross = Number(t.amount);
          const refunded = Number((t as any).refunded_amount || 0);
          return s + (gross - refunded);
        }, 0);
      cumulative += dayTotal;
      spentByDay.set(dayStr, cumulative);
    }

    // Add projected recurring amounts
    if (includeUpcoming && upcomingItems && upcomingItems.length > 0) {
      const futureAdditions = new Map<string, number>();
      for (const item of upcomingItems) {
        const futureDetails = (item.occurrenceDetails || []).filter(d => d.isFuture);
        for (const occ of futureDetails) {
          if (occ.date > today) {
            futureAdditions.set(occ.date, (futureAdditions.get(occ.date) || 0) + occ.amount);
          }
        }
      }
      if (futureAdditions.size > 0) {
        let projRunning = 0;
        for (const day of days) {
          const dayStr = format(day, "yyyy-MM-dd");
          const projected = futureAdditions.get(dayStr) || 0;
          projRunning += projected;
          if (projRunning > 0) {
            spentByDay.set(dayStr, (spentByDay.get(dayStr) || 0) + projRunning);
          }
        }
      }
    }

    // Determine sampling: pick evenly-spaced days to keep the chart readable
    // For 1 month (~30 days): every day or every other day → ~15-30 points
    // For 3 months (~90 days): weekly → ~13 points
    // For 1 year (~365 days): bi-weekly → ~26 points
    const sampleEvery = totalDays <= 45 ? 1 : totalDays <= 100 ? 3 : totalDays <= 200 ? 7 : 14;

    // Build sampled chart points, always including the first and last day
    const chartPoints: Array<{ date: string; spent: number; budget: number; isFuture: boolean }> = [];

    // Always start at 0
    const firstDay = days[0];
    const firstDayStr = format(firstDay, "yyyy-MM-dd");
    const firstSpent = spentByDay.get(firstDayStr) || 0;
    chartPoints.push({
      date: format(firstDay, labelFmt, { locale: fr }),
      spent: 0,
      budget: budgetVal,
      isFuture: firstDayStr > today,
    });

    // If first day already has spending, add it as a second point (same label)
    if (firstSpent > 0) {
      chartPoints.push({
        date: format(firstDay, labelFmt, { locale: fr }),
        spent: firstSpent,
        budget: budgetVal,
        isFuture: firstDayStr > today,
      });
    }

    for (let i = 1; i < totalDays; i++) {
      const isLastDay = i === totalDays - 1;
      const isSamplePoint = i % sampleEvery === 0;
      if (!isSamplePoint && !isLastDay) continue;

      const day = days[i];
      const dayStr = format(day, "yyyy-MM-dd");
      chartPoints.push({
        date: format(day, labelFmt, { locale: fr }),
        spent: spentByDay.get(dayStr) || 0,
        budget: budgetVal,
        isFuture: dayStr > today,
      });
    }

    return chartPoints;
  }, [hasBudget, allTransactions, days, categoryName, isMobile, categoryData, includeUpcoming, upcomingItems]);

  // End of the cumulative line, including projections. Used for the chart's
  // own scaling only — never as the category's spend, which comes from the
  // engine via categoryData.spent.
  const chartFinalSpent = budgetChartData.length > 0 ? budgetChartData[budgetChartData.length - 1].spent : 0;
  // The engine figure always wins. This used to prefer the chart's own
  // running total whenever the category had a budget, which let the dialog
  // contradict both the row that opened it and its own transaction list.
  const effectiveSpent = Number(categoryData?.spent || 0);
  
  const yMaxRaw = hasBudget
    ? Math.max(Number(categoryData.budget) * 1.15, effectiveSpent * 1.05, 100)
    : 100;
  const step = yMaxRaw <= 200 ? 10 : yMaxRaw <= 1000 ? 50 : yMaxRaw <= 5000 ? 100 : 500;
  const yMax = Math.ceil(yMaxRaw / step) * step;
  const isOverBudget = hasBudget && effectiveSpent > Number(categoryData.budget);
  const percentUsed = hasBudget
    ? Math.round((effectiveSpent / Number(categoryData.budget)) * 100)
    : 0;

  const BudgetChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length || !categoryData) return null;
    const spentValue = payload.find((p: any) => p.dataKey === "spent")?.value || 0;
    const isOver = spentValue > categoryData.budget;

    return (
      <div className="bg-card border border-line rounded-[11px] shadow-sh-2 p-2.5 text-xs text-foreground">
        <p className="font-semibold text-foreground mb-1.5 pb-1 border-b border-line-soft">
          {label}
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Dépensé</span>
            <span className={cn("font-mono tabular-nums", isOver ? "text-neg font-semibold" : "font-medium")}>
              {formatCurrency(spentValue)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-medium font-mono tabular-nums">{formatCurrency(categoryData.budget)}</span>
          </div>
          {isOver && (
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-line-soft">
              <span className="text-neg">Dépassement</span>
              <span className="text-neg font-semibold font-mono tabular-nums">
                +{formatCurrency(spentValue - categoryData.budget)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
          <DialogTitle className="flex items-center justify-between text-[15px] font-semibold tracking-tight pr-8">
            <span className="truncate">{categoryName}</span>
            <Badge variant="secondary" className={cn("text-xs sm:text-sm ml-2 flex-shrink-0 font-mono tabular-nums", isPrivacyMode && "ft-priv")}>
              {formatCurrency(totalAmount)}
            </Badge>
          </DialogTitle>
          <p className="text-xs text-fg-mute mt-0.5">
            <span className="font-mono tabular-nums">{realCount}</span> transaction{realCount > 1 ? 's' : ''}
            {projectedCount > 0 && (
              <span className="text-accent-deep"> + <span className="font-mono tabular-nums">{projectedCount}</span> projetée{projectedCount > 1 ? 's' : ''}</span>
            )}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3 sm:space-y-4">
          {/* Budget Evolution Chart (only if category has a budget) */}
          {hasBudget && budgetChartData.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-[11px] sm:text-xs font-semibold text-foreground">
                Évolution des dépenses vs budget
              </h4>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span><span className="font-mono tabular-nums">{percentUsed}%</span> utilisé</span>
                  <span>
                    <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(effectiveSpent)}</span>
                    {' / '}
                    <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(categoryData.budget)}</span>
                  </span>
                </div>
                <div className="ft-progress-track">
                  <div
                    className={cn("ft-progress-fill", isOverBudget && "bg-neg")}
                    style={{ width: `${Math.min(100, percentUsed)}%` }}
                  />
                </div>
              </div>

              {/* Chart — the frame owns touch-action and outside-tap tooltip
                  clearing; the whole read-out blurs under privacy since the
                  axis and tooltip are SVG/portal content no span can reach. */}
              <ChartTouchFrame className={cn(isMobile ? "h-40" : "h-[200px]", isPrivacyMode && "ft-priv")}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={budgetChartData}
                    margin={{ top: 8, right: 12, left: isMobile ? -8 : 0, bottom: 8 }}
                  >
                    <defs>
                      <linearGradient id={`spentGradient-${categoryName}`} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor={categoryData.color || "hsl(var(--chart-1))"}
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor={categoryData.color || "hsl(var(--chart-1))"}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: isMobile ? 9 : 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(var(--line))" }}
                      interval={Math.max(0, Math.floor(budgetChartData.length / (isMobile ? 5 : 7)) - 1)}
                    />
                    <YAxis
                      domain={[0, yMax]}
                      tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${Math.round(v)}`)}
                      tick={{ fontSize: isMobile ? 9 : 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      width={isMobile ? 32 : 44}
                    />
                    <RechartsTooltip content={<BudgetChartTooltip />} animationDuration={100} />

                    {/* Budget threshold line */}
                    <ReferenceLine
                      y={categoryData.budget}
                      stroke="hsl(var(--destructive))"
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                      label={{
                        value: `Budget: ${formatCurrency(categoryData.budget)}`,
                        position: "insideTopRight",
                        fill: "hsl(var(--destructive))",
                        fontSize: isMobile ? 9 : 11,
                      }}
                    />

                    {/* Area fill */}
                    <Area
                      type="monotone"
                      dataKey="spent"
                      stroke="none"
                      fill={`url(#spentGradient-${categoryName})`}
                      animationDuration={500}
                    />

                    {/* Spending line */}
                    <Line
                      type="monotone"
                      dataKey="spent"
                      stroke={categoryData.color || "hsl(var(--chart-1))"}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                      animationDuration={500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartTouchFrame>
            </div>
          )}

          {/* Transaction list */}
          {transactions.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground text-sm">
              Aucune transaction trouvée
            </div>
          ) : (
            <TooltipProvider>
              {transactions.map((transaction) => {
                const hasRefund = transaction.hasRefund || false;
                const isFullyRefunded = transaction.isFullyRefunded || false;
                const netAmount = transaction.netAmount ?? transaction.amount;
                const showValueDate = hasValueDateDifference(transaction) && preferences.dateType === 'value';

                return (
                  <div
                    key={transaction.id}
                    className={cn(
                      "flex items-center justify-between p-2 sm:p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors gap-2",
                      transaction.isProjected && "border-dashed border-primary/30 bg-primary/5"
                    )}
                  >
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <div
                          className="w-1.5 sm:w-2 h-5 sm:h-6 rounded-full"
                          style={{ background: bankAccent(transaction.bank) }}
                        />
                        <div className="flex items-center justify-center w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-muted">
                          {transaction.type === 'income' ? (
                            <ArrowDownRight className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-success" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-destructive" />
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={cn("font-medium text-xs sm:text-sm truncate", transaction.isProjected && "italic text-muted-foreground")}>{transaction.description}</p>
                          {transaction.isProjected && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="ft-tag acc !text-[10px] flex-shrink-0">
                                  <CalendarClock className="w-2.5 h-2.5" />
                                  Projeté
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Transaction récurrente projetée
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {hasRefund && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={cn("ft-tag !text-[10px] flex-shrink-0", !isFullyRefunded && "warn")}>
                                  {isFullyRefunded ? t('transactions.refunded') : t('transactions.partialRefund')}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <div className="space-y-1">
                                  <p>Brut: <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(transaction.amount)}</span></p>
                                  <p>Remboursé: <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(transaction.refundedAmount || 0)}</span></p>
                                  <p className="font-semibold">Net: <span className={cn("font-mono tabular-nums", isPrivacyMode && "ft-priv")}>{formatCurrency(netAmount)}</span></p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-2 py-0 h-4 sm:h-5">
                            {getBankLabel(normalizeBank(transaction.bank), t)}
                          </Badge>
                          <span className="text-[10px] sm:text-sm text-muted-foreground">
                            {parseLocalDate(transaction.date).toLocaleDateString('fr-FR')}
                          </span>
                          {showValueDate && transaction.valueDate && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-0.5 text-[9px] sm:text-xs text-primary">
                                  <CalendarDays className="w-3 h-3" />
                                  {parseLocalDate(transaction.valueDate).toLocaleDateString('fr-FR')}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Date valeur (effective)
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      {transaction.type === 'expense' && hasRefund ? (
                        <div className="flex flex-col items-end">
                          <span className={cn("text-[10px] sm:text-xs font-mono tabular-nums text-muted-foreground line-through", isPrivacyMode && "ft-priv")}>
                            {formatCurrency(transaction.amount)}
                          </span>
                          <span className={cn(
                            "font-semibold font-mono tabular-nums text-xs sm:text-sm",
                            isFullyRefunded ? "text-muted-foreground" : "text-foreground",
                            isPrivacyMode && "ft-priv",
                          )}>
                            {formatCurrency(netAmount)}
                          </span>
                        </div>
                      ) : (
                        <span
                          className={cn(
                            "font-semibold font-mono tabular-nums text-xs sm:text-sm",
                            transaction.type === 'income' ? 'text-pos' : 'text-foreground',
                            isPrivacyMode && "ft-priv",
                          )}
                        >
                          {formatCurrency(transaction.amount)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </TooltipProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
