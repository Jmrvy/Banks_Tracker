import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2, TrendingDown, TrendingUp, Wallet, ChevronDown, Pencil, Pause, Play, Trash2, Clock, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RecurringTransaction, Transaction } from "@/hooks/useFinancialData";
import { InstallmentPayment } from "@/hooks/useInstallmentPayments";
import { Debt, DebtPayment } from "@/hooks/useDebts";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface ScheduledDebtPayment {
  id: string;
  debt_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  actual_amount: number | null;
  is_paid: boolean | null;
  paid_date: string | null;
}
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, isBefore, startOfDay, addWeeks, addQuarters, addYears, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";

interface RecurringCalendarProps {
  transactions: RecurringTransaction[];
  actualTransactions?: Transaction[];
  installmentPayments?: InstallmentPayment[];
  debts?: Debt[];
  debtPayments?: DebtPayment[];
  scheduledDebtPayments?: ScheduledDebtPayment[];
  onEdit: (transaction: RecurringTransaction) => void;
  onToggleActive: (id: string, currentStatus: boolean) => void;
  onDelete: (id: string, description: string) => void;
  onExecuteEarly?: (transactionId: string, executionDate: string) => Promise<{ error: any } | undefined>;
  onRecordPayment?: (recurringTransactionId: string) => void;
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

const RecurringCalendar = ({ transactions, actualTransactions = [], installmentPayments = [], debts = [], debtPayments = [], scheduledDebtPayments = [], onEdit, onToggleActive, onDelete, onExecuteEarly, onRecordPayment }: RecurringCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const { formatCurrency, preferences } = useUserPreferences();
  const dateField = preferences.dateType === 'value' ? 'value_date' : 'transaction_date';
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
  // Uses the user's preferred date type (accounting or value date) for month matching
  const installmentActualAmounts = useMemo(() => {
    const map = new Map<string, number>();
    actualTransactions.forEach((tx) => {
      if (tx.installment_payment_id) {
        const txDate = (tx as any)[dateField] || tx.transaction_date;
        const monthKey = txDate.substring(0, 7);
        const key = `${tx.installment_payment_id}:${monthKey}`;
        map.set(key, (map.get(key) || 0) + tx.amount);
      }
    });
    return map;
  }, [actualTransactions, dateField]);

  // Build a day-level lookup of actual installment transactions using the preferred date
  // This is used to inject transactions on their actual date when it differs from the scheduled date
  const installmentActualByDay = useMemo(() => {
    const map = new Map<string, { installmentPaymentId: string; amount: number; recurringId: string | null }[]>();
    actualTransactions.forEach((tx) => {
      if (tx.installment_payment_id) {
        const txDate = (tx as any)[dateField] || tx.transaction_date;
        const dayKey = txDate.substring(0, 10);
        const existing = map.get(dayKey) || [];
        // Find the recurring transaction linked to this installment
        const recurringTx = transactions.find(rt => rt.installment_payment_id === tx.installment_payment_id);
        existing.push({
          installmentPaymentId: tx.installment_payment_id,
          amount: tx.amount,
          recurringId: recurringTx?.id || null,
        });
        map.set(dayKey, existing);
      }
    });
    return map;
  }, [actualTransactions, dateField, transactions]);

  // Build a month-level lookup of actual amounts for recurring transactions (by recurring_transaction_id)
  // Same pattern as installmentActualAmounts — used to show past occurrences with real amounts
  const recurringActualAmounts = useMemo(() => {
    const map = new Map<string, number>();
    actualTransactions.forEach((tx) => {
      const rtId = tx.recurring_transaction_id;
      if (!rtId || tx.installment_payment_id) return; // installments handled separately
      const txDate = (tx as any)[dateField] || tx.transaction_date;
      const monthKey = txDate.substring(0, 7);
      const key = `${rtId}:${monthKey}`;
      map.set(key, (map.get(key) || 0) + tx.amount);
    });
    return map;
  }, [actualTransactions, dateField]);

  // Build a day-level lookup of actual recurring transactions (by recurring_transaction_id)
  // so we can inject moved transactions on their real date
  const recurringActualByDay = useMemo(() => {
    const map = new Map<string, { recurringTx: RecurringTransaction; amount: number }[]>();
    actualTransactions.forEach((tx) => {
      const rtId = tx.recurring_transaction_id;
      // Skip installment-linked ones (handled separately)
      if (tx.installment_payment_id) return;
      // Only use the FK link — no description fallback to avoid false matches
      if (!rtId) return;
      const recurringTx = transactions.find(rt => rt.id === rtId);
      if (!recurringTx) return;
      const txDate = (tx as any)[dateField] || tx.transaction_date;
      const dayKey = txDate.substring(0, 10);
      const existing = map.get(dayKey) || [];
      existing.push({ recurringTx, amount: tx.amount });
      map.set(dayKey, existing);
    });
    return map;
  }, [actualTransactions, dateField, transactions]);

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

  // Build debt lookups
  const debtsById = useMemo(() => {
    const map = new Map<string, Debt>();
    debts.forEach((d) => map.set(d.id, d));
    return map;
  }, [debts]);

  // Build scheduled debt payments lookup by debt_id, keyed by month
  const scheduledDebtPaymentsByDebtMonth = useMemo(() => {
    const map = new Map<string, ScheduledDebtPayment>();
    scheduledDebtPayments.forEach((sp) => {
      const monthKey = sp.scheduled_date.substring(0, 7);
      const key = `${sp.debt_id}:${monthKey}`;
      map.set(key, sp);
    });
    return map;
  }, [scheduledDebtPayments]);

  // Build debt payments lookup by debt_id + month (actual amounts paid)
  const debtActualAmounts = useMemo(() => {
    const map = new Map<string, number>();
    debtPayments.forEach((dp) => {
      const monthKey = dp.payment_date.substring(0, 7);
      const key = `${dp.debt_id}:${monthKey}`;
      map.set(key, (map.get(key) || 0) + dp.amount);
    });
    return map;
  }, [debtPayments]);

  // Count paid scheduled debt payments per debt
  const debtPaidCounts = useMemo(() => {
    const map = new Map<string, number>();
    scheduledDebtPayments.forEach((sp) => {
      if (sp.is_paid) {
        map.set(sp.debt_id, (map.get(sp.debt_id) || 0) + 1);
      }
    });
    return map;
  }, [scheduledDebtPayments]);

  // Resolve debt for a transaction: by debt_id or description fallback
  const resolveDebt = useMemo(() => {
    return (transaction: RecurringTransaction): Debt | null => {
      if (transaction.debt_id) return debtsById.get(transaction.debt_id) || null;
      // Fallback: match by description pattern for old recurring transactions without debt_id
      if (transaction.description.includes('(Remboursement dette)') || transaction.description.includes('(Remboursement prêt)')) {
        for (const d of debts) {
          const suffixReceived = `${d.description} (Remboursement dette)`;
          const suffixGiven = `${d.description} (Remboursement prêt)`;
          if (transaction.description === suffixReceived || transaction.description === suffixGiven) return d;
        }
      }
      return null;
    };
  }, [debtsById, debts]);

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

      // For debt-linked transactions, limit future occurrences based on remaining amount
      const resolvedDebt = resolveDebt(transaction);
      const resolvedDebtId = resolvedDebt?.id || null;
      if (resolvedDebt) {
        const debt = resolvedDebt;
        if (debt.payment_amount > 0) {
          const maxFutureOccurrences = Math.ceil(debt.remaining_amount / debt.payment_amount);
          let lastOccurrence = new Date(nextDueDate);
          for (let i = 1; i < maxFutureOccurrences; i++) {
            lastOccurrence = advanceDate(lastOccurrence, transaction.recurrence_type);
          }
          if (maxFutureOccurrences <= 0) {
            if (!endDateLimit || lastOccurrence < endDateLimit) {
              effectiveEndDate = nextDueDate;
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

          // Regular recurring (non-installment, non-debt): use actual linked amount for past if available
          if (!transaction.installment_payment_id && !resolvedDebtId) {
            if (isPast) {
              const monthKey = format(currentOccurrence, 'yyyy-MM');
              const rtKey = `${transaction.id}:${monthKey}`;
              const actualAmount = recurringActualAmounts.get(rtKey);
              if (actualAmount !== undefined) {
                displayAmount = actualAmount;
              }
              // If no linked transaction exists, still show the occurrence with the default amount
              // (user can link it later via the "Lier / Enregistrer un paiement" button)
            }
          }

          // Debt-linked: use actual paid amount for past, scheduled amount for future
          if (resolvedDebtId) {
            const monthKey = format(currentOccurrence, 'yyyy-MM');
            const debtKey = `${resolvedDebtId}:${monthKey}`;
            if (isPast) {
              const actualAmount = debtActualAmounts.get(debtKey);
              if (actualAmount !== undefined) {
                displayAmount = actualAmount;
              } else {
                skipOccurrence = true;
              }
            } else {
              // Use scheduled amount for this month if available
              const scheduled = scheduledDebtPaymentsByDebtMonth.get(debtKey);
              if (scheduled) {
                displayAmount = scheduled.scheduled_amount;
              } else if (resolvedDebt) {
                displayAmount = resolvedDebt.payment_amount;
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

    // Post-processing: inject actual installment transactions that exist in this month
    // but weren't matched to any scheduled occurrence (e.g., user changed the transaction date)
    const currentMonthKey = format(currentMonth, 'yyyy-MM');
    const matchedInstallmentMonths = new Set<string>();
    // Collect which installment+month combos were already matched
    map.forEach((entries) => {
      entries.forEach((entry) => {
        if (entry.transaction.installment_payment_id) {
          matchedInstallmentMonths.add(`${entry.transaction.installment_payment_id}:${currentMonthKey}`);
        }
      });
    });

    // For each day in the current month, check if there are unmatched installment transactions
    installmentActualByDay.forEach((dayEntries, dayKey) => {
      if (!dayKey.startsWith(currentMonthKey)) return;
      
      dayEntries.forEach(({ installmentPaymentId, amount, recurringId }) => {
        const matchKey = `${installmentPaymentId}:${currentMonthKey}`;
        if (matchedInstallmentMonths.has(matchKey)) return; // Already shown via scheduled occurrence
        
        // Find the recurring transaction for this installment
        const recurringTx = transactions.find(rt => rt.installment_payment_id === installmentPaymentId);
        if (!recurringTx) return;
        
        // Get the total for this installment in this month
        const monthAmount = installmentActualAmounts.get(matchKey);
        if (monthAmount === undefined) return;
        
        // Only add once per installment per month (use the first day we encounter)
        matchedInstallmentMonths.add(matchKey);
        
        const existing = map.get(dayKey) || [];
        map.set(dayKey, [...existing, {
          transaction: recurringTx,
          isPast: true,
          displayAmount: monthAmount,
          occurrenceDate: dayKey,
        }]);
      });
    });

    // Post-processing: inject non-installment recurring transactions whose actual date
    // (per user preference) falls in this month but doesn't match a scheduled occurrence
    const matchedRecurringDays = new Set<string>();
    // Collect which recurring+day combos are already shown
    map.forEach((entries, dayKey) => {
      entries.forEach((entry) => {
        if (!entry.transaction.installment_payment_id) {
          matchedRecurringDays.add(`${entry.transaction.id}:${dayKey}`);
        }
      });
    });

    recurringActualByDay.forEach((dayEntries, dayKey) => {
      if (!dayKey.startsWith(currentMonthKey)) return;
      
      dayEntries.forEach(({ recurringTx, amount }) => {
        const matchKey = `${recurringTx.id}:${dayKey}`;
        if (matchedRecurringDays.has(matchKey)) return; // Already shown
        
        // Check if this recurring transaction already has an occurrence this month
        // (on its scheduled date) - if so, don't add a duplicate
        let alreadyInMonth = false;
        map.forEach((entries) => {
          entries.forEach((entry) => {
            if (entry.transaction.id === recurringTx.id) alreadyInMonth = true;
          });
        });
        if (alreadyInMonth) return;

        matchedRecurringDays.add(matchKey);
        const existing = map.get(dayKey) || [];
        map.set(dayKey, [...existing, {
          transaction: recurringTx,
          isPast: true,
          displayAmount: amount,
          occurrenceDate: dayKey,
        }]);
      });
    });

    return map;
  }, [transactions, currentMonth, installmentActualAmounts, installmentActualByDay, recurringActualAmounts, recurringActualByDay, installmentPaymentsById, resolveDebt, debtActualAmounts, scheduledDebtPaymentsByDebtMonth, dateField]);

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

  // Helper to get effective type: installment reimbursements are income in the DB
  // but represent an expense (money going into savings/repayment)
  const getEffectiveType = useCallback((transaction: RecurringTransaction): 'income' | 'expense' => {
    if (transaction.installment_payment_id) {
      const ip = installmentPaymentsById.get(transaction.installment_payment_id);
      if (ip?.payment_type === 'reimbursement') return 'expense';
    }
    return transaction.type;
  }, [installmentPaymentsById]);

  // Monthly summary
  const monthlySummary = useMemo(() => {
    let totalIncome = 0, totalExpense = 0, pastIncome = 0, pastExpense = 0;

    transactionsByDay.forEach((entries) => {
      entries.forEach(({ transaction, isPast, displayAmount }) => {
        const amount = displayAmount ?? transaction.amount;
        const effectiveType = getEffectiveType(transaction);
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
    const rawTotalCount = ip.installment_amount > 0 ? Math.ceil(ip.total_amount / ip.installment_amount) : 0;
    // When payment is completed (remaining_amount <= 0), totalCount should equal paidCount
    const totalCount = ip.remaining_amount <= 0 ? paidCount : rawTotalCount;
    const pct = ip.total_amount > 0 ? Math.min(100, Math.round((paid / ip.total_amount) * 1000) / 10) : 0;
    return { ip, paid, paidCount, totalCount, pct };
  };

  const getPaymentHistory = (installmentPaymentId: string) => {
    return actualTransactions
      .filter(tx => tx.installment_payment_id === installmentPaymentId)
      .sort((a, b) => {
        const dateA = (a as any)[dateField] || a.transaction_date;
        const dateB = (b as any)[dateField] || b.transaction_date;
        return dateA.localeCompare(dateB);
      });
  };

  // Get payment history for a regular recurring transaction (via recurring_transaction_id)
  const getRecurringPaymentHistory = (recurringTransactionId: string) => {
    return actualTransactions
      .filter(tx => tx.recurring_transaction_id === recurringTransactionId && !tx.installment_payment_id)
      .sort((a, b) => {
        const dateA = (a as any)[dateField] || a.transaction_date;
        const dateB = (b as any)[dateField] || b.transaction_date;
        return dateA.localeCompare(dateB);
      });
  };

  const getDebtInfo = (transaction: RecurringTransaction) => {
    const debt = resolveDebt(transaction);
    if (!debt) return null;
    const paid = debt.total_amount - debt.remaining_amount;
    const paidCount = debtPaidCounts.get(debt.id) || 0;
    const totalScheduled = scheduledDebtPayments.filter(sp => sp.debt_id === debt.id).length;
    const totalCount = totalScheduled > 0 ? totalScheduled : (debt.payment_amount > 0 ? Math.ceil(debt.total_amount / debt.payment_amount) : 0);
    const pct = debt.total_amount > 0 ? Math.min(100, Math.round((paid / debt.total_amount) * 1000) / 10) : 0;
    return { debt, paid, paidCount, totalCount, pct };
  };

  const getDebtPaymentHistoryForTransaction = (transaction: RecurringTransaction) => {
    const debt = resolveDebt(transaction);
    if (!debt) return [];
    return debtPayments
      .filter(dp => dp.debt_id === debt.id)
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date));
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
    const debtInfo = getDebtInfo(transaction);

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
            isPast ? 'bg-muted/30' : getEffectiveType(transaction) === 'income' ? 'bg-success/10' : 'bg-destructive/10'
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
            {debtInfo && (
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {isPast ? debtInfo.paidCount : debtInfo.paidCount + 1} sur {debtInfo.totalCount} ({formatCurrency(debtInfo.debt.total_amount)})
              </span>
            )}
          </div>

          {/* Amount + chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-sm sm:text-base font-bold ${
              isPast ? 'text-muted-foreground' : getEffectiveType(transaction) === 'income' ? 'text-success' : 'text-destructive'
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
                        {parseLocalDate((tx as any)[dateField] || tx.transaction_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
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

            {/* Debt progress */}
            {debtInfo && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm sm:text-base font-bold">{formatCurrency(debtInfo.paid)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Payé</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm sm:text-base font-bold">{formatCurrency(debtInfo.debt.remaining_amount)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Restant</p>
                    </div>
                  </div>
                  <Progress value={debtInfo.pct} className="h-2" />
                </div>

                {/* Debt payment timeline */}
                <div className="space-y-1">
                  {getDebtPaymentHistoryForTransaction(transaction).map((dp) => (
                    <div key={dp.id} className="flex items-center gap-2.5 py-1.5">
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      <span className="text-xs sm:text-sm flex-1">
                        {parseLocalDate(dp.payment_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                      </span>
                      <span className="text-xs sm:text-sm font-medium">{formatCurrency(dp.amount)}</span>
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

            {/* Regular recurring payment history (non-installment, non-debt) */}
            {!installmentInfo && !debtInfo && (() => {
              const history = getRecurringPaymentHistory(transaction.id);
              if (history.length === 0) return null;
              return (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Historique des paiements ({history.length})</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {history.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-2.5 py-1.5">
                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                        <span className="text-xs sm:text-sm flex-1">
                          {parseLocalDate((tx as any)[dateField] || tx.transaction_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        <span className="text-xs sm:text-sm font-medium">{formatCurrency(tx.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Link transaction button — for all recurring (non-installment, non-debt) */}
            {!installmentInfo && !debtInfo && onRecordPayment && (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-9 text-xs sm:text-sm gap-1.5"
                onClick={() => onRecordPayment(transaction.id)}
              >
                <Link className="h-3.5 w-3.5" />
                Lier / Enregistrer un paiement
              </Button>
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
                return sum + (getEffectiveType(transaction) === 'income' ? amount : -amount);
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
