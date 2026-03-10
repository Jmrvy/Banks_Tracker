import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2, TrendingDown, TrendingUp, Wallet, ChevronDown, Pencil, Pause, Play, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RecurringTransaction, Transaction } from "@/hooks/useFinancialData";
import { InstallmentPayment } from "@/hooks/useInstallmentPayments";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, isBefore, startOfDay, addWeeks, addQuarters, addYears, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";

interface RecurringCalendarProps {
  transactions: RecurringTransaction[];
  actualTransactions?: Transaction[];
  installmentPayments?: InstallmentPayment[];
  onEdit: (transaction: RecurringTransaction) => void;
  onToggleActive: (id: string, currentStatus: boolean) => void;
  onDelete: (id: string, description: string) => void;
  onExecuteEarly?: (transactionId: string, executionDate: string) => Promise<{ error: any } | undefined>;
}

interface CalendarOccurrence {
  transaction: RecurringTransaction;
  isPast: boolean;
  displayAmount?: number;
  occurrenceDate: string; // YYYY-MM-DD
}

// Parse "YYYY-MM-DD" as local date to avoid UTC shift bugs
const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Helper to advance a date by recurrence type
function advanceDate(date: Date, recurrenceType: string): Date {
  switch (recurrenceType) {
    case 'weekly': return addWeeks(date, 1);
    case 'monthly': return addMonths(date, 1);
    case 'quarterly': return addQuarters(date, 1);
    case 'yearly': return addYears(date, 1);
    default: return addMonths(date, 1);
  }
}

const RecurringCalendar = ({ transactions, actualTransactions = [], installmentPayments = [], onEdit, onToggleActive, onDelete, onExecuteEarly }: RecurringCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const { formatCurrency } = useUserPreferences();
  const transactionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const daysOfWeek = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // Get all days in the current month view (including padding days)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    let startDay = getDay(monthStart);
    startDay = startDay === 0 ? 6 : startDay - 1;

    const paddingDays: (Date | null)[] = Array(startDay).fill(null);
    return [...paddingDays, ...days];
  }, [currentMonth]);

  // Build a lookup of actual transactions linked to installment payments
  const installmentActualAmounts = useMemo(() => {
    const map = new Map<string, number>();
    actualTransactions.forEach((tx) => {
      if (tx.installment_payment_id) {
        const monthKey = tx.transaction_date.substring(0, 7);
        const key = `${tx.installment_payment_id}:${monthKey}`;
        map.set(key, (map.get(key) || 0) + tx.amount);
      }
    });
    return map;
  }, [actualTransactions]);

  // Build a lookup of installment payments by ID
  const installmentPaymentsById = useMemo(() => {
    const map = new Map<string, InstallmentPayment>();
    installmentPayments.forEach((ip) => map.set(ip.id, ip));
    return map;
  }, [installmentPayments]);

  // Count actual installment transactions to know how many have been paid
  const installmentPaidCounts = useMemo(() => {
    const map = new Map<string, number>();
    actualTransactions.forEach((tx) => {
      if (tx.installment_payment_id) {
        map.set(tx.installment_payment_id, (map.get(tx.installment_payment_id) || 0) + 1);
      }
    });
    return map;
  }, [actualTransactions]);

  // Map transactions to their due dates within the current month
  const transactionsByDay = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    const today = startOfDay(new Date());
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    transactions.forEach((transaction) => {
      if (!transaction.is_active) return;

      // Skip if end_date has passed before this month
      let endDateLimit: Date | null = null;
      if (transaction.end_date) {
        endDateLimit = parseLocalDate(transaction.end_date);
        if (endDateLimit < monthStart) return;
      }

      const startDate = parseLocalDate(transaction.start_date);
      const nextDueDate = parseLocalDate(transaction.next_due_date);

      // For installment-linked transactions, calculate max future occurrences
      // and compute the effective last occurrence date
      let effectiveEndDate: Date | null = endDateLimit;
      if (transaction.installment_payment_id) {
        const ip = installmentPaymentsById.get(transaction.installment_payment_id);
        if (ip && ip.installment_amount > 0) {
          const maxFutureOccurrences = Math.ceil(ip.remaining_amount / ip.installment_amount);
          // Calculate the last valid future occurrence date from next_due_date
          let lastOccurrence = new Date(nextDueDate);
          for (let i = 1; i < maxFutureOccurrences; i++) {
            lastOccurrence = advanceDate(lastOccurrence, transaction.recurrence_type);
          }
          // Use the stricter limit
          if (maxFutureOccurrences <= 0) {
            // No remaining payments - don't show any future occurrences
            if (!endDateLimit || lastOccurrence < endDateLimit) {
              effectiveEndDate = nextDueDate; // Set to before next_due_date effectively
            }
          } else if (!effectiveEndDate || lastOccurrence < effectiveEndDate) {
            effectiveEndDate = lastOccurrence;
          }
        }
      }

      // Skip if effective end date is before this month
      if (effectiveEndDate && effectiveEndDate < monthStart) return;

      // Calculate all occurrences of this transaction in the current month
      let currentOccurrence = new Date(startDate);

      // Move to first occurrence that could be in or before this month
      while (currentOccurrence < monthStart) {
        currentOccurrence = advanceDate(currentOccurrence, transaction.recurrence_type);
      }

      // Add all occurrences within this month
      while (currentOccurrence <= monthEnd) {
        // Stop if past effective end date
        if (effectiveEndDate && currentOccurrence > effectiveEndDate) break;

        if (isSameMonth(currentOccurrence, currentMonth)) {
          const key = format(currentOccurrence, 'yyyy-MM-dd');
          const isPast = isBefore(currentOccurrence, today);

          // For future occurrences, skip if before next_due_date
          // (these have already been executed)
          if (!isPast && isBefore(currentOccurrence, nextDueDate)) {
            currentOccurrence = advanceDate(currentOccurrence, transaction.recurrence_type);
            continue;
          }

          let displayAmount: number | undefined;
          let skipOccurrence = false;

          if (transaction.installment_payment_id) {
            if (isPast) {
              const monthKey = format(currentOccurrence, 'yyyy-MM');
              const actualKey = `${transaction.installment_payment_id}:${monthKey}`;
              const actualAmount = installmentActualAmounts.get(actualKey);
              if (actualAmount !== undefined) {
                displayAmount = actualAmount;
              } else {
                skipOccurrence = true;
              }
            } else {
              const ip = installmentPaymentsById.get(transaction.installment_payment_id);
              if (ip) {
                displayAmount = ip.installment_amount;
              }
            }
          }

          if (!skipOccurrence) {
            const existing = map.get(key) || [];
            map.set(key, [...existing, { transaction, isPast, displayAmount, occurrenceDate: key }]);
          }
        }

        currentOccurrence = advanceDate(currentOccurrence, transaction.recurrence_type);
      }
    });

    return map;
  }, [transactions, currentMonth, installmentActualAmounts, installmentPaymentsById]);

  // Build the list of occurrences for the Klarna-style list below calendar
  const { upcomingOccurrences, pastOccurrences } = useMemo(() => {
    const upcoming: CalendarOccurrence[] = [];
    const past: CalendarOccurrence[] = [];

    transactionsByDay.forEach((entries) => {
      entries.forEach((entry) => {
        if (entry.isPast) {
          past.push(entry);
        } else {
          upcoming.push(entry);
        }
      });
    });

    upcoming.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
    past.sort((a, b) => b.occurrenceDate.localeCompare(a.occurrenceDate));

    return { upcomingOccurrences: upcoming, pastOccurrences: past };
  }, [transactionsByDay]);

  // Monthly summary
  const monthlySummary = useMemo(() => {
    let totalIncome = 0, totalExpense = 0, pastIncome = 0, pastExpense = 0;

    transactionsByDay.forEach((entries) => {
      entries.forEach(({ transaction, isPast, displayAmount }) => {
        const amount = displayAmount ?? transaction.amount;
        let effectiveType = transaction.type;
        if (transaction.installment_payment_id) {
          const ip = installmentPaymentsById.get(transaction.installment_payment_id);
          if (ip?.payment_type === 'reimbursement') effectiveType = 'expense';
        }
        if (effectiveType === 'income') {
          totalIncome += amount;
          if (isPast) pastIncome += amount;
        } else {
          totalExpense += amount;
          if (isPast) pastExpense += amount;
        }
      });
    });

    return {
      totalIncome, totalExpense, totalNet: totalIncome - totalExpense,
      pastIncome, pastExpense, pastNet: pastIncome - pastExpense,
      upcomingIncome: totalIncome - pastIncome,
      upcomingExpense: totalExpense - pastExpense,
      upcomingNet: (totalIncome - pastIncome) - (totalExpense - pastExpense),
    };
  }, [transactionsByDay, installmentPaymentsById]);

  const goToPreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Hebdomadaire';
      case 'monthly': return 'Mensuelle';
      case 'quarterly': return 'Trimestrielle';
      case 'yearly': return 'Annuelle';
      default: return type;
    }
  };

  const monthName = format(currentMonth, 'MMMM', { locale: fr });

  const sectionTotal = (occurrences: CalendarOccurrence[]) => {
    return occurrences.reduce((sum, o) => sum + (o.displayAmount ?? o.transaction.amount), 0);
  };

  const getInstallmentInfo = (transaction: RecurringTransaction) => {
    if (!transaction.installment_payment_id) return null;
    const ip = installmentPaymentsById.get(transaction.installment_payment_id);
    if (!ip) return null;
    const paid = ip.total_amount - ip.remaining_amount;
    const paidCount = installmentPaidCounts.get(ip.id) || 0;
    const totalCount = ip.installment_amount > 0 ? Math.ceil(ip.total_amount / ip.installment_amount) : 0;
    const pct = ip.total_amount > 0 ? Math.min(100, Math.round((paid / ip.total_amount) * 1000) / 10) : 0;
    return { ip, paid, paidCount, totalCount, pct };
  };

  const getPaymentHistory = (installmentPaymentId: string) => {
    return actualTransactions
      .filter(tx => tx.installment_payment_id === installmentPaymentId)
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  };

  // Handle calendar day click: scroll to the first transaction of that day
  const handleDayClick = useCallback((dateKey: string, dayTransactions: CalendarOccurrence[]) => {
    if (dayTransactions.length === 0) return;

    const firstOccurrence = dayTransactions[0];
    const isPast = firstOccurrence.isPast;
    const cardId = isPast
      ? `past:${firstOccurrence.transaction.id}:${firstOccurrence.occurrenceDate}`
      : `${firstOccurrence.transaction.id}:${firstOccurrence.occurrenceDate}`;

    setExpandedTransactionId(cardId);

    // Scroll to the card after React renders
    requestAnimationFrame(() => {
      const el = transactionRefs.current.get(cardId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, []);

  const setRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      transactionRefs.current.set(id, el);
    } else {
      transactionRefs.current.delete(id);
    }
  }, []);

  // Render an occurrence card (shared between upcoming and past)
  const renderOccurrenceCard = (occurrence: CalendarOccurrence, keyPrefix: string) => {
    const { transaction, displayAmount, occurrenceDate, isPast } = occurrence;
    const occDate = parseLocalDate(occurrenceDate);
    const today = startOfDay(new Date());
    const daysUntil = differenceInDays(occDate, today);
    const cardId = keyPrefix === 'past' ? `past:${transaction.id}:${occurrenceDate}` : `${transaction.id}:${occurrenceDate}`;
    const isExpanded = expandedTransactionId === cardId;
    const installmentInfo = getInstallmentInfo(transaction);

    return (
      <Card
        key={cardId}
        ref={(el) => setRef(cardId, el)}
        className={`overflow-hidden border-border/50 ${isPast ? 'bg-card/50 opacity-70' : 'bg-card/80'}`}
      >
        {/* Main row */}
        <div
          className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setExpandedTransactionId(isExpanded ? null : cardId)}
        >
          {/* Date badge */}
          <div className={`flex-shrink-0 w-11 sm:w-12 h-11 sm:h-12 rounded-xl flex flex-col items-center justify-center ${
            isPast ? 'bg-muted/30' : transaction.type === 'income' ? 'bg-success/10' : 'bg-destructive/10'
          }`}>
            <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground uppercase">
              {format(occDate, 'MMM', { locale: fr })}
            </span>
            <span className={`text-sm sm:text-base font-bold leading-none ${isPast ? 'text-muted-foreground' : ''}`}>
              {format(occDate, 'd')}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm sm:text-base font-semibold truncate ${isPast ? 'text-muted-foreground' : ''}`}>
              {transaction.description}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isPast ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    Payé le {format(occDate, 'd MMM', { locale: fr })}
                  </span>
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? 'Demain' : `Dans ${daysUntil} jours`}
                  </span>
                </>
              )}
            </div>
            {installmentInfo && (
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {isPast ? installmentInfo.paidCount : installmentInfo.paidCount + 1} sur {installmentInfo.totalCount} ({formatCurrency(installmentInfo.ip.total_amount)})
              </span>
            )}
          </div>

          {/* Amount + chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-sm sm:text-base font-bold ${
              isPast ? 'text-muted-foreground' : transaction.type === 'income' ? 'text-success' : 'text-destructive'
            }`}>
              {formatCurrency(displayAmount ?? transaction.amount)}
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-border/50 p-3 sm:p-4 space-y-4 bg-muted/10">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Fréquence</span>
                <span className="font-medium text-xs sm:text-sm">{getRecurrenceLabel(transaction.recurrence_type)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Compte</span>
                <span className="font-medium text-xs sm:text-sm truncate max-w-[150px]">{transaction.account?.name}</span>
              </div>
              {transaction.category && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Catégorie</span>
                  <Badge variant="outline" className="gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: transaction.category.color }} />
                    {transaction.category.name}
                  </Badge>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Prochain paiement</span>
                <span className="font-medium text-xs sm:text-sm">
                  {parseLocalDate(transaction.next_due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Statut</span>
                <Badge variant={transaction.is_active ? 'default' : 'secondary'} className="text-xs">
                  {transaction.is_active ? 'Actif' : 'Inactif'}
                </Badge>
              </div>
            </div>

            {/* Installment progress */}
            {installmentInfo && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm sm:text-base font-bold">{formatCurrency(installmentInfo.paid)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Payé</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm sm:text-base font-bold">{formatCurrency(installmentInfo.ip.remaining_amount)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Restant</p>
                    </div>
                  </div>
                  <Progress value={installmentInfo.pct} className="h-2" />
                </div>

                {/* Payment timeline */}
                <div className="space-y-1">
                  {getPaymentHistory(transaction.installment_payment_id!).map((tx) => (
                    <div key={tx.id} className="flex items-center gap-2.5 py-1.5">
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      <span className="text-xs sm:text-sm flex-1">
                        {parseLocalDate(tx.transaction_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                      </span>
                      <span className="text-xs sm:text-sm font-medium">{formatCurrency(tx.amount)}</span>
                    </div>
                  ))}
                  {/* Show next pending payment for upcoming */}
                  {!isPast && (
                    <div className="flex items-center gap-2.5 py-1.5">
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                      <span className="text-xs sm:text-sm flex-1">
                        {occDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                      </span>
                      <span className="text-xs sm:text-sm font-medium">
                        {formatCurrency(displayAmount ?? transaction.amount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Execute early button - only for upcoming */}
            {!isPast && onExecuteEarly && (
              <Button
                size="sm"
                className="w-full h-9 text-xs sm:text-sm gap-1.5"
                disabled={executingId === transaction.id}
                onClick={async () => {
                  setExecutingId(transaction.id);
                  const result = await onExecuteEarly(transaction.id, occurrenceDate);
                  setExecutingId(null);
                  if (!result?.error) {
                    setExpandedTransactionId(null);
                  }
                }}
              >
                {executingId === transaction.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Passer la transaction
              </Button>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-border/50">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => onEdit(transaction)}>
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => onToggleActive(transaction.id, transaction.is_active)}>
                {transaction.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {transaction.is_active ? 'Désactiver' : 'Activer'}
              </Button>
              <Button size="sm" variant="destructive" className="h-8 text-xs gap-1.5 px-3"
                onClick={() => onDelete(transaction.id, transaction.description)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Calendar Card */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={goToPreviousMonth} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-sm sm:text-lg font-semibold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: fr })}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={goToNextMonth} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-6 pt-0">
          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
            {daysOfWeek.map((day) => (
              <div key={day} className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1 sm:py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }

              const dateKey = format(day, 'yyyy-MM-dd');
              const dayTransactions = transactionsByDay.get(dateKey) || [];
              const isToday = isSameDay(day, new Date());

              const dayTotal = dayTransactions.reduce((sum, { transaction, displayAmount }) => {
                const amount = displayAmount ?? transaction.amount;
                return sum + (transaction.type === 'income' ? amount : -amount);
              }, 0);

              return (
                <div
                  key={dateKey}
                  className={`aspect-square border rounded-md sm:rounded-lg p-0.5 sm:p-1 flex flex-col items-center justify-center transition-colors ${
                    isToday
                      ? 'border-primary bg-primary/5'
                      : dayTransactions.length > 0
                        ? 'border-border/50 bg-muted/20'
                        : 'border-border/30'
                  } ${dayTransactions.length > 0 ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                  onClick={() => handleDayClick(dateKey, dayTransactions)}
                >
                  <span className={`text-[10px] sm:text-xs font-medium ${
                    isToday ? 'text-primary' : 'text-foreground'
                  }`}>
                    {format(day, 'd')}
                  </span>

                  {dayTransactions.length > 0 && (
                    <span className={`text-[7px] sm:text-[10px] font-bold mt-0.5 ${
                      dayTransactions.every(d => d.isPast)
                        ? 'text-muted-foreground line-through'
                        : dayTotal >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(Math.abs(dayTotal))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 mt-3 sm:mt-4 pt-3 border-t border-border/50 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-success/20" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Revenus</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-destructive/20" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Dépenses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-muted/50" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Passées</span>
            </div>
          </div>

          {/* Monthly Summary */}
          {(monthlySummary.totalIncome > 0 || monthlySummary.totalExpense > 0) && (
            <div className="mt-3 sm:mt-4 pt-3 border-t border-border/50">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-muted/30 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
                    <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">Total du mois</span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-success text-[10px] sm:text-xs font-medium">+{formatCurrency(monthlySummary.totalIncome)}</p>
                    <p className="text-destructive text-[10px] sm:text-xs font-medium">-{formatCurrency(monthlySummary.totalExpense)}</p>
                    <p className={`text-xs sm:text-sm font-bold ${monthlySummary.totalNet >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {monthlySummary.totalNet >= 0 ? '+' : ''}{formatCurrency(monthlySummary.totalNet)}
                    </p>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                    <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">Déjà passé</span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-success text-[10px] sm:text-xs font-medium">+{formatCurrency(monthlySummary.pastIncome)}</p>
                    <p className="text-destructive text-[10px] sm:text-xs font-medium">-{formatCurrency(monthlySummary.pastExpense)}</p>
                    <p className={`text-xs sm:text-sm font-bold ${monthlySummary.pastNet >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {monthlySummary.pastNet >= 0 ? '+' : ''}{formatCurrency(monthlySummary.pastNet)}
                    </p>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
                    <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">À venir</span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-success text-[10px] sm:text-xs font-medium">+{formatCurrency(monthlySummary.upcomingIncome)}</p>
                    <p className="text-destructive text-[10px] sm:text-xs font-medium">-{formatCurrency(monthlySummary.upcomingExpense)}</p>
                    <p className={`text-xs sm:text-sm font-bold ${monthlySummary.upcomingNet >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {monthlySummary.upcomingNet >= 0 ? '+' : ''}{formatCurrency(monthlySummary.upcomingNet)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming / Due section */}
      {upcomingOccurrences.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm sm:text-base font-bold capitalize">
              À venir en {monthName}
            </h3>
            <span className="text-sm sm:text-base text-muted-foreground font-medium">
              {formatCurrency(sectionTotal(upcomingOccurrences))}
            </span>
          </div>
          <div className="space-y-2">
            {upcomingOccurrences.map((o) => renderOccurrenceCard(o, 'upcoming'))}
          </div>
        </div>
      )}

      {/* Past / Paid section */}
      {pastOccurrences.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm sm:text-base font-bold capitalize">
              Passé en {monthName}
            </h3>
            <span className="text-sm sm:text-base text-muted-foreground font-medium">
              {formatCurrency(sectionTotal(pastOccurrences))}
            </span>
          </div>
          <div className="space-y-2">
            {pastOccurrences.map((o) => renderOccurrenceCard(o, 'past'))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurringCalendar;
