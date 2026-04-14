import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, CalendarDays, Clock, CalendarClock } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
import { eachDayOfInterval, format, addDays, addWeeks, addMonths, addYears } from "date-fns";
import { fr } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";

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

const bankColors: Record<string, string> = {
  societe_generale: 'bg-red-500',
  revolut: 'bg-blue-500',
  boursorama: 'bg-orange-500',
  bnp_paribas: 'bg-green-600',
  credit_agricole: 'bg-green-700',
  lcl: 'bg-blue-700',
  caisse_epargne: 'bg-yellow-600',
  credit_mutuel: 'bg-blue-800',
  sg: 'bg-red-500', // Legacy support
  other: 'bg-gray-500'
};

const bankNames: Record<string, string> = {
  societe_generale: 'Société Générale',
  revolut: 'Revolut',
  boursorama: 'Boursorama',
  bnp_paribas: 'BNP Paribas',
  credit_agricole: 'Crédit Agricole',
  lcl: 'LCL',
  caisse_epargne: 'Caisse d\'Épargne',
  credit_mutuel: 'Crédit Mutuel',
  sg: 'Société Générale', // Legacy support
  other: 'Autre'
};

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
  const { formatCurrency, preferences } = useUserPreferences();
  const isMobile = useIsMobile();
  const activeDateType = dateType || preferences.dateType;

  // Calculer le total en utilisant les montants nets si disponibles
  const totalAmount = transactions.reduce((sum, t) => {
    const netAmount = t.netAmount ?? t.amount;
    return sum + Math.abs(netAmount);
  }, 0);

  // Vérifier si une transaction a une date valeur différente de la date comptable
  const hasValueDateDifference = (t: CategoryTransaction) => {
    if (!t.valueDate) return false;
    const accountingDate = new Date(t.date).toDateString();
    const valueDate = new Date(t.valueDate).toDateString();
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

    const catTxs = allTransactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.include_in_stats !== false &&
          t.category?.name === categoryName
      )
      .sort(
        (a, b) =>
          new Date(getTransactionDate(a)).getTime() -
          new Date(getTransactionDate(b)).getTime()
      );

    let running = 0;
    const today = format(new Date(), "yyyy-MM-dd");

    const chartPoints = days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      // Use NET amounts (amount - refunded_amount) for each transaction
      const dayTotal = catTxs
        .filter((t) => getTransactionDate(t) === dayStr)
        .reduce((s, t) => {
          const gross = Number(t.amount);
          const refunded = Number((t as any).refunded_amount || 0);
          return s + Math.max(0, gross - refunded);
        }, 0);
      running += dayTotal;

      return {
        date: format(day, isMobile ? "dd" : "dd MMM", { locale: fr }),
        spent: running,
        budget: Number(categoryData.budget),
        isFuture: dayStr > today,
      };
    });

    // If includeUpcoming, add projected recurring amounts to future days
    if (includeUpcoming && upcomingItems && upcomingItems.length > 0) {
      const advanceDate = (d: Date, type: string): Date => {
        switch (type) {
          case 'daily': return addDays(d, 1);
          case 'weekly': return addWeeks(d, 1);
          case 'monthly': return addMonths(d, 1);
          case 'quarterly': return addMonths(d, 3);
          case 'yearly': return addYears(d, 1);
          default: return addMonths(d, 1);
        }
      };

      // Compute future occurrence dates for each upcoming item
      const futureAdditions = new Map<string, number>();
      for (const item of upcomingItems) {
        if (item.futureOccurrences <= 0) continue;
        const rt = item.recurring;
        const amount = Number(rt.amount);
        // Walk from next_due_date forward within the period
        let current = new Date(rt.next_due_date + 'T00:00:00');
        let count = 0;
        while (current <= periodEnd! && count < item.futureOccurrences) {
          const dateStr = format(current, 'yyyy-MM-dd');
          if (dateStr > today && current >= periodStart!) {
            futureAdditions.set(dateStr, (futureAdditions.get(dateStr) || 0) + amount);
            count++;
          }
          current = advanceDate(current, rt.recurrence_type);
        }
      }
      
      // Re-accumulate with projections
      if (futureAdditions.size > 0) {
        let projRunning = 0;
        for (let i = 0; i < chartPoints.length; i++) {
          const dayStr = format(days[i], "yyyy-MM-dd");
          const projected = futureAdditions.get(dayStr) || 0;
          projRunning += projected;
          if (projRunning > 0) {
            chartPoints[i].spent += projRunning;
          }
        }
      }
    }

    return chartPoints;
  }, [hasBudget, allTransactions, days, categoryName, isMobile, categoryData, includeUpcoming, upcomingItems]);

  // Use the final chart value (which includes net amounts + projections) for display
  const chartFinalSpent = budgetChartData.length > 0 ? budgetChartData[budgetChartData.length - 1].spent : 0;
  const effectiveSpent = hasBudget && budgetChartData.length > 0 ? chartFinalSpent : Number(categoryData?.spent || 0);
  
  const yMax = hasBudget
    ? Math.max(Number(categoryData.budget) * 1.15, effectiveSpent * 1.05, 100)
    : 100;
  const isOverBudget = hasBudget && effectiveSpent > Number(categoryData.budget);
  const percentUsed = hasBudget
    ? Math.round((effectiveSpent / Number(categoryData.budget)) * 100)
    : 0;

  const BudgetChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length || !categoryData) return null;
    const spentValue = payload.find((p: any) => p.dataKey === "spent")?.value || 0;
    const isOver = spentValue > categoryData.budget;

    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border/50 rounded-lg shadow-xl p-2.5 text-xs">
        <p className="font-semibold text-foreground mb-1.5 pb-1 border-b border-border/30">
          {label}
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Dépensé</span>
            <span className={isOver ? "text-destructive font-semibold" : "font-medium"}>
              {formatCurrency(spentValue)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-medium">{formatCurrency(categoryData.budget)}</span>
          </div>
          {isOver && (
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-border/30">
              <span className="text-destructive">Dépassement</span>
              <span className="text-destructive font-semibold">
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
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center justify-between text-sm sm:text-lg pr-8">
            <span className="truncate">{categoryName}</span>
            <Badge variant="secondary" className="text-xs sm:text-sm ml-2 flex-shrink-0">
              {formatCurrency(totalAmount)}
            </Badge>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {transactions.length} transaction{transactions.length > 1 ? 's' : ''}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
          {/* Budget Evolution Chart (only if category has a budget) */}
          {hasBudget && budgetChartData.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-[11px] sm:text-xs font-semibold text-foreground">
                Évolution des dépenses vs budget
              </h4>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{percentUsed}% utilisé</span>
                  <span>{formatCurrency(effectiveSpent)} / {formatCurrency(categoryData.budget)}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      isOverBudget ? "bg-destructive" : "bg-success"
                    )}
                    style={{ width: `${Math.min(100, percentUsed)}%` }}
                  />
                </div>
              </div>

              {/* Chart */}
              <div style={{ height: isMobile ? 160 : 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={budgetChartData}
                    margin={{ top: 8, right: 12, left: isMobile ? -8 : 0, bottom: 8 }}
                  >
                    <defs>
                      <linearGradient id={`spentGradient-${categoryName}`} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor={categoryData.color || "#8884d8"}
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor={categoryData.color || "#8884d8"}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: isMobile ? 9 : 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                      interval={isMobile ? 6 : 4}
                    />
                    <YAxis
                      domain={[0, yMax]}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
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
                      stroke={categoryData.color || "#8884d8"}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                      animationDuration={500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
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
                        <div className={`w-1.5 sm:w-2 h-5 sm:h-6 rounded-full ${
                          bankColors[transaction.bank] || 'bg-gray-500'
                        }`} />
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
                          <p className="font-medium text-xs sm:text-sm truncate">{transaction.description}</p>
                          {hasRefund && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant={isFullyRefunded ? "secondary" : "outline"}
                                  className={cn(
                                    "text-[9px] px-1 py-0 h-4 flex-shrink-0",
                                    isFullyRefunded ? "bg-muted text-muted-foreground" : "border-amber-500 text-amber-600"
                                  )}
                                >
                                  {isFullyRefunded ? "Remboursé" : "Partiel"}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <div className="space-y-1">
                                  <p>Brut: {formatCurrency(transaction.amount)}</p>
                                  <p>Remboursé: {formatCurrency(transaction.refundedAmount || 0)}</p>
                                  <p className="font-semibold">Net: {formatCurrency(netAmount)}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-2 py-0 h-4 sm:h-5">
                            {bankNames[transaction.bank] || transaction.bank}
                          </Badge>
                          <span className="text-[10px] sm:text-sm text-muted-foreground">
                            {new Date(transaction.date).toLocaleDateString('fr-FR')}
                          </span>
                          {showValueDate && transaction.valueDate && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-0.5 text-[9px] sm:text-xs text-primary">
                                  <CalendarDays className="w-3 h-3" />
                                  {new Date(transaction.valueDate).toLocaleDateString('fr-FR')}
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
                          <span className="text-[10px] sm:text-xs text-muted-foreground line-through">
                            {formatCurrency(transaction.amount)}
                          </span>
                          <span className={cn(
                            "font-semibold text-xs sm:text-sm",
                            isFullyRefunded ? "text-muted-foreground" : "text-foreground"
                          )}>
                            {formatCurrency(netAmount)}
                          </span>
                        </div>
                      ) : (
                        <span
                          className={`font-semibold text-xs sm:text-sm ${
                            transaction.type === 'income' ? 'text-success' : 'text-foreground'
                          }`}
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
