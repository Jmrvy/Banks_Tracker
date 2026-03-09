import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight, CheckCircle2, Loader2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecurringTransaction, Transaction } from "@/hooks/useFinancialData";
import { InstallmentPayment } from "@/hooks/useInstallmentPayments";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, isBefore, startOfDay, addWeeks, addQuarters, addYears } from "date-fns";
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

// Parse "YYYY-MM-DD" as local date to avoid UTC shift bugs
const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const RecurringCalendar = ({ transactions, actualTransactions = [], installmentPayments = [], onEdit, onToggleActive, onDelete, onExecuteEarly }: RecurringCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedTransaction, setSelectedTransaction] = useState<RecurringTransaction | null>(null);
  const [selectedDisplayAmount, setSelectedDisplayAmount] = useState<number | undefined>(undefined);
  const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState<string | null>(null);
  const [selectedDayTransactions, setSelectedDayTransactions] = useState<{ date: Date; transactions: { transaction: RecurringTransaction; isPast: boolean; displayAmount?: number }[] } | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const { formatCurrency } = useUserPreferences();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const daysOfWeek = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // Get all days in the current month view (including padding days)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Get the day of week for the first day (0 = Sunday, convert to Monday-based)
    let startDay = getDay(monthStart);
    startDay = startDay === 0 ? 6 : startDay - 1; // Convert to Monday-based (0 = Monday)
    
    // Add padding days at the beginning
    const paddingDays: (Date | null)[] = Array(startDay).fill(null);
    
    return [...paddingDays, ...days];
  }, [currentMonth]);

  // Build a lookup of actual transactions linked to installment payments
  // Key: "installmentPaymentId:YYYY-MM" → actual amount paid that month
  const installmentActualAmounts = useMemo(() => {
    const map = new Map<string, number>();
    actualTransactions.forEach((tx) => {
      if (tx.installment_payment_id) {
        const monthKey = tx.transaction_date.substring(0, 7); // "YYYY-MM"
        const key = `${tx.installment_payment_id}:${monthKey}`;
        map.set(key, (map.get(key) || 0) + tx.amount);
      }
    });
    return map;
  }, [actualTransactions]);

  // Build a lookup of installment payments by ID for quick access
  const installmentPaymentsById = useMemo(() => {
    const map = new Map<string, InstallmentPayment>();
    installmentPayments.forEach((ip) => map.set(ip.id, ip));
    return map;
  }, [installmentPayments]);

  // Map transactions to their due dates within the current month (including past occurrences)
  const transactionsByDay = useMemo(() => {
    const map = new Map<string, { transaction: RecurringTransaction; isPast: boolean; displayAmount?: number }[]>();
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

      // Calculate all occurrences of this transaction in the current month
      let currentOccurrence = new Date(startDate);

      // Move to first occurrence that could be in or before this month
      while (currentOccurrence < monthStart) {
        switch (transaction.recurrence_type) {
          case 'weekly':
            currentOccurrence = addWeeks(currentOccurrence, 1);
            break;
          case 'monthly':
            currentOccurrence = addMonths(currentOccurrence, 1);
            break;
          case 'quarterly':
            currentOccurrence = addQuarters(currentOccurrence, 1);
            break;
          case 'yearly':
            currentOccurrence = addYears(currentOccurrence, 1);
            break;
          default:
            currentOccurrence = addMonths(currentOccurrence, 1);
        }
      }

      // Add all occurrences within this month (respecting end_date)
      while (currentOccurrence <= monthEnd) {
        // Stop if past end_date
        if (endDateLimit && currentOccurrence > endDateLimit) break;

        if (isSameMonth(currentOccurrence, currentMonth)) {
          const key = format(currentOccurrence, 'yyyy-MM-dd');
          const isPast = isBefore(currentOccurrence, today);

          // For installment-linked recurring transactions, use the correct amount:
          // - Past: actual amount from the linked transaction that month
          //         If no actual transaction exists, skip (occurrence wasn't executed)
          // - Future: installment_amount from the installment payment (always up-to-date)
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
                // No actual transaction for this past month — occurrence wasn't executed
                skipOccurrence = true;
              }
            } else {
              // For future occurrences, use the installment payment's current amount
              const ip = installmentPaymentsById.get(transaction.installment_payment_id);
              if (ip) {
                displayAmount = ip.installment_amount;
              }
            }
          }

          if (!skipOccurrence) {
            const existing = map.get(key) || [];
            map.set(key, [...existing, { transaction, isPast, displayAmount }]);
          }
        }

        // Move to next occurrence
        switch (transaction.recurrence_type) {
          case 'weekly':
            currentOccurrence = addWeeks(currentOccurrence, 1);
            break;
          case 'monthly':
            currentOccurrence = addMonths(currentOccurrence, 1);
            break;
          case 'quarterly':
            currentOccurrence = addQuarters(currentOccurrence, 1);
            break;
          case 'yearly':
            currentOccurrence = addYears(currentOccurrence, 1);
            break;
          default:
            currentOccurrence = addMonths(currentOccurrence, 1);
        }
      }
    });

    return map;
  }, [transactions, currentMonth, installmentActualAmounts, installmentPaymentsById]);

  // Monthly summary: total, already passed, and upcoming amounts
  // Installment reimbursements (payment_type === 'reimbursement') are stored as 'income'
  // but are actually expenses — treat them accordingly.
  const monthlySummary = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let pastIncome = 0;
    let pastExpense = 0;

    transactionsByDay.forEach((entries) => {
      entries.forEach(({ transaction, isPast, displayAmount }) => {
        const amount = displayAmount ?? transaction.amount;

        // Determine effective type: reimbursement installments are expenses
        let effectiveType = transaction.type;
        if (transaction.installment_payment_id) {
          const ip = installmentPaymentsById.get(transaction.installment_payment_id);
          if (ip?.payment_type === 'reimbursement') {
            effectiveType = 'expense';
          }
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
      totalIncome,
      totalExpense,
      totalNet: totalIncome - totalExpense,
      pastIncome,
      pastExpense,
      pastNet: pastIncome - pastExpense,
      upcomingIncome: totalIncome - pastIncome,
      upcomingExpense: totalExpense - pastExpense,
      upcomingNet: (totalIncome - pastIncome) - (totalExpense - pastExpense),
    };
  }, [transactionsByDay, installmentPaymentsById]);

  const goToPreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  const getTypeColor = (type: string) => {
    return type === 'income' ? 'bg-success' : 'bg-destructive';
  };

  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Hebdomadaire';
      case 'monthly': return 'Mensuelle';
      case 'quarterly': return 'Trimestrielle';
      case 'yearly': return 'Annuelle';
      default: return type;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income': return 'Revenus';
      case 'expense': return 'Dépense';
      default: return type;
    }
  };

  return (
    <>
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
              <div
                key={day}
                className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1 sm:py-2"
              >
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

              return (
                <div
                  key={dateKey}
                  className={`aspect-square border rounded-md sm:rounded-lg p-0.5 sm:p-1 flex flex-col transition-colors ${
                    isToday 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border/50 hover:border-border'
                  } ${dayTransactions.length > 0 ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => {
                    if (dayTransactions.length > 0) {
                      // On mobile: always show day selection modal
                      // On desktop: show transaction directly if only one
                      if (isMobile) {
                        setSelectedDayTransactions({ date: day, transactions: dayTransactions });
                      } else if (dayTransactions.length === 1) {
                        setSelectedTransaction(dayTransactions[0].transaction);
                        setSelectedDisplayAmount(dayTransactions[0].displayAmount);
                        setSelectedOccurrenceDate(dateKey);
                      } else {
                        setSelectedDayTransactions({ date: day, transactions: dayTransactions });
                      }
                    }
                  }}
                >
                  <span className={`text-[10px] sm:text-xs font-medium ${
                    isToday ? 'text-primary' : 'text-foreground'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  
                  {/* Transaction indicators */}
                  <div className="flex-1 overflow-hidden space-y-0.5 mt-0.5">
                    {dayTransactions.slice(0, 3).map(({ transaction, isPast, displayAmount }) => (
                      <div
                        key={transaction.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isMobile) {
                            setSelectedTransaction(transaction);
                            setSelectedDisplayAmount(displayAmount);
                            setSelectedOccurrenceDate(dateKey);
                          }
                        }}
                        className={`rounded px-0.5 sm:px-1 py-0.5 sm:cursor-pointer hover:opacity-80 transition-opacity ${
                          isPast
                            ? 'bg-muted/50 text-muted-foreground'
                            : transaction.type === 'income' 
                              ? 'bg-success/20 text-success' 
                              : 'bg-destructive/20 text-destructive'
                        }`}
                      >
                        <p className={`text-[8px] sm:text-[10px] font-medium truncate leading-tight ${isPast ? 'line-through' : ''}`}>
                          {transaction.description}
                        </p>
                        <p className="text-[7px] sm:text-[9px] font-semibold hidden sm:block">
                          {formatCurrency(displayAmount ?? transaction.amount)}
                        </p>
                      </div>
                    ))}
                    {dayTransactions.length > 3 && (
                      <span className="text-[8px] sm:text-[10px] text-muted-foreground">
                        +{dayTransactions.length - 3}
                      </span>
                    )}
                  </div>
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
                {/* Total du mois */}
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

                {/* Déjà passé */}
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

                {/* À venir */}
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

      {/* Day Selection Modal (for mobile or multiple transactions) */}
      <Dialog open={!!selectedDayTransactions} onOpenChange={(open) => !open && setSelectedDayTransactions(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base">
              Transactions du {selectedDayTransactions && format(selectedDayTransactions.date, 'd MMMM yyyy', { locale: fr })}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectedDayTransactions?.transactions.map(({ transaction, isPast, displayAmount }) => (
              <div
                key={transaction.id}
                onClick={() => {
                  const dateKey = selectedDayTransactions ? format(selectedDayTransactions.date, 'yyyy-MM-dd') : null;
                  setSelectedDayTransactions(null);
                  setSelectedTransaction(transaction);
                  setSelectedDisplayAmount(displayAmount);
                  setSelectedOccurrenceDate(dateKey);
                }}
                className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                  isPast ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {transaction.type === 'income' ? (
                      <ArrowDownRight className="h-4 w-4 text-success flex-shrink-0" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-destructive flex-shrink-0" />
                    )}
                    <span className={`font-medium truncate text-sm ${isPast ? 'line-through' : ''}`}>
                      {transaction.description}
                    </span>
                  </div>
                  <span className={`font-bold text-sm flex-shrink-0 ${
                    transaction.type === 'income' ? 'text-success' : 'text-destructive'
                  }`}>
                    {formatCurrency(displayAmount ?? transaction.amount)}
                  </span>
                </div>
                {transaction.category && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: transaction.category.color }}
                    />
                    <span className="text-xs text-muted-foreground">{transaction.category.name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction Detail Modal */}
      <Dialog open={!!selectedTransaction} onOpenChange={(open) => { if (!open) { setSelectedTransaction(null); setSelectedDisplayAmount(undefined); setSelectedOccurrenceDate(null); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              {selectedTransaction?.type === 'income' ? (
                <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
              ) : (
                <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              )}
              {selectedTransaction?.description}
            </DialogTitle>
          </DialogHeader>
          
          {selectedTransaction && (
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Montant:</span>
                  <span className={`font-bold text-base sm:text-lg ${
                    selectedTransaction.type === 'income' ? 'text-success' : 'text-destructive'
                  }`}>
                    {formatCurrency(selectedDisplayAmount ?? selectedTransaction.amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Type:</span>
                  <span className="font-medium text-xs sm:text-sm">{getTypeLabel(selectedTransaction.type)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Fréquence:</span>
                  <span className="font-medium text-xs sm:text-sm">{getRecurrenceLabel(selectedTransaction.recurrence_type)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Prochain paiement:</span>
                  <span className="font-medium text-xs sm:text-sm">
                    {parseLocalDate(selectedTransaction.next_due_date).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Compte:</span>
                  <span className="font-medium text-xs sm:text-sm truncate max-w-[150px]">{selectedTransaction.account?.name}</span>
                </div>
                {selectedTransaction.category && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Catégorie:</span>
                    <Badge variant="outline" className="gap-1.5 text-xs">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: selectedTransaction.category.color }}
                      />
                      {selectedTransaction.category.name}
                    </Badge>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Statut:</span>
                  <Badge variant={selectedTransaction.is_active ? 'default' : 'secondary'} className="text-xs">
                    {selectedTransaction.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
                {selectedTransaction.installment_payment_id && (() => {
                  const ip = installmentPaymentsById.get(selectedTransaction.installment_payment_id);
                  if (!ip) return null;
                  const paid = ip.total_amount - ip.remaining_amount;
                  const pct = ip.total_amount > 0 ? Math.min(100, Math.round((paid / ip.total_amount) * 1000) / 10) : 0;
                  return (
                    <div className="bg-muted/30 rounded-lg p-2.5 space-y-1.5 mt-1">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">
                          {ip.payment_type === 'reimbursement' ? 'Remboursement' : 'Paiement'} échelonné
                        </span>
                        <span className="text-xs font-medium">{pct}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{formatCurrency(paid)} payé</span>
                        <span>{formatCurrency(ip.remaining_amount)} restant</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Execute early button — only for future/today non-past occurrences */}
              {onExecuteEarly && selectedOccurrenceDate && (() => {
                const occDate = parseLocalDate(selectedOccurrenceDate);
                const today = startOfDay(new Date());
                const isNotPast = !isBefore(occDate, today);
                return isNotPast ? (
                  <div className="pt-3 border-t border-border">
                    <Button
                      size="sm"
                      className="w-full h-8 sm:h-9 text-xs sm:text-sm gap-1.5"
                      disabled={executingId === selectedTransaction.id}
                      onClick={async () => {
                        setExecutingId(selectedTransaction.id);
                        const result = await onExecuteEarly(selectedTransaction.id, selectedOccurrenceDate);
                        setExecutingId(null);
                        if (!result?.error) {
                          setSelectedTransaction(null);
                          setSelectedDisplayAmount(undefined);
                          setSelectedOccurrenceDate(null);
                        }
                      }}
                    >
                      {executingId === selectedTransaction.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Passer la transaction
                    </Button>
                  </div>
                ) : null;
              })()}

              <div className="flex gap-2 pt-3 border-t border-border">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 sm:h-9 text-xs sm:text-sm"
                  onClick={() => {
                    onEdit(selectedTransaction);
                    setSelectedTransaction(null);
                    setSelectedDisplayAmount(undefined);
                    setSelectedOccurrenceDate(null);
                  }}
                >
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 sm:h-9 text-xs sm:text-sm"
                  onClick={() => {
                    onToggleActive(selectedTransaction.id, selectedTransaction.is_active);
                    setSelectedTransaction(null);
                    setSelectedDisplayAmount(undefined);
                    setSelectedOccurrenceDate(null);
                  }}
                >
                  {selectedTransaction.is_active ? 'Désactiver' : 'Activer'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 h-8 sm:h-9 text-xs sm:text-sm"
                  onClick={() => {
                    onDelete(selectedTransaction.id, selectedTransaction.description);
                    setSelectedTransaction(null);
                    setSelectedDisplayAmount(undefined);
                    setSelectedOccurrenceDate(null);
                  }}
                >
                  Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RecurringCalendar;
