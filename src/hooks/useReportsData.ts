import { useMemo } from "react";
import { useFinancialData, type Transaction, type RecurringTransaction } from "@/hooks/useFinancialData";
import { useIncomeAnalysis, IncomeCategory } from "@/hooks/useIncomeAnalysis";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, differenceInDays, subMonths, subYears, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";

export interface ReportsPeriod {
  from: Date;
  to: Date;
  label: string;
}

export interface ReportsStats {
  income: number;
  expenses: number;
  netPeriodBalance: number;
  initialBalance: number;
  finalBalance: number;
}

export interface SparklinePoint {
  label: string;
  net: number;
  income: number;
  expenses: number;
  isCurrent?: boolean;
}

export interface BalanceDataPoint {
  date: string;
  solde: number | null;
  soldeProjecte: number;
  dateObj: Date;
  isProjection?: boolean;
}

export interface CategoryData {
  name: string;
  spent: number;
  budget: number;
  color: string;
  percentage: string;
  remaining: number;
}

export interface PeriodOccurrenceDetail {
  date: string; // YYYY-MM-DD
  amount: number;
  isFuture: boolean;
}

export interface PeriodRecurringItem {
  recurring: RecurringTransaction;
  occurrences: number;
  periodAmount: number;
  effectiveType: 'income' | 'expense';
  pastOccurrences: number;
  futureOccurrences: number;
  pastAmount: number;
  futureAmount: number;
  futurePeriodAmount: number;
  occurrenceDetails: PeriodOccurrenceDetail[];
}

export interface RecurringData {
  activeRecurring: RecurringTransaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyNet: number;
  yearlyIncome: number;
  yearlyExpenses: number;
  yearlyNet: number;
  byCategory: { name: string; color: string; amount: number; count: number; type: 'income' | 'expense' }[];
  incomeCount: number;
  expenseCount: number;
  // Period-based data
  periodItems: PeriodRecurringItem[];
  periodIncome: number;
  periodExpenses: number;
  periodNet: number;
  periodIncomeCount: number;
  periodExpenseCount: number;
  periodByCategory: { name: string; color: string; amount: number; count: number; type: 'income' | 'expense' }[];
  gapBalance: number;
}

export interface SpendingPatternsData {
  dailyAvgIncome: number;
  dailyAvgExpenses: number;
  dailyNet: number;
  projectedMonthlyIncome: number;
  projectedMonthlyExpenses: number;
  projectedMonthlyNet: number;
}

export interface InstallmentPaymentInfo {
  id: string;
  remaining_amount: number;
  installment_amount: number;
  is_active: boolean;
}

export interface DebtInfo {
  id: string;
  description: string;
  total_amount: number;
  remaining_amount: number;
  payment_amount: number;
  status: string;
}

export interface ScheduledDebtPaymentInfo {
  debt_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  is_paid: boolean | null;
}

export interface DebtPaymentInfo {
  debt_id: string;
  payment_date: string;
  amount: number;
}

export interface UseReportsDataOptions {
  /** Skip heavy computations (balance evolution, recurring, spending patterns) when only stats/categories/income are needed */
  skipHeavyComputations?: boolean;
  /** Compute a second set of filteredTransactions/stats/categoryChartData/incomeAnalysis using this date type.
   * Used by the Reports page to show income/expense tabs with a user-selectable date type
   * while keeping balance evolution on the accounting date. Avoids calling the hook twice. */
  secondaryDateType?: 'accounting' | 'value';
}

export const useReportsData = (
  periodType: "month" | "year" | "custom",
  selectedDate: Date,
  dateRange: { from: Date; to: Date },
  useSpendingPatterns: boolean,
  overrideDateType?: 'accounting' | 'value',
  installmentPayments?: InstallmentPaymentInfo[],
  options?: UseReportsDataOptions,
  debtInfos?: DebtInfo[],
  scheduledDebtPaymentInfos?: ScheduledDebtPaymentInfo[],
  debtPaymentInfos?: DebtPaymentInfo[],
) => {
  const skipHeavy = options?.skipHeavyComputations ?? false;
  const { transactions, categories, accounts, recurringTransactions, loading } = useFinancialData();
  const { preferences } = useUserPreferences();
  
  // Use override dateType if provided, otherwise use preference
  const activeDateType = overrideDateType ?? preferences.dateType;

  // Calcul de la période sélectionnée
  const period = useMemo<ReportsPeriod>(() => {
    switch (periodType) {
      case "month":
        return {
          from: startOfMonth(selectedDate),
          to: endOfMonth(selectedDate),
          label: format(selectedDate, "MMMM yyyy", { locale: fr })
        };
      case "year":
        return {
          from: startOfYear(selectedDate),
          to: endOfYear(selectedDate),
          label: format(selectedDate, "yyyy", { locale: fr })
        };
      case "custom":
        return {
          from: dateRange.from,
          to: dateRange.to,
          label: `${format(dateRange.from, "dd/MM/yyyy")} - ${format(dateRange.to, "dd/MM/yyyy")}`
        };
    }
  }, [periodType, selectedDate, dateRange]);

  // Filtrage des transactions pour la période
  // Utiliser la préférence de date (comptable ou valeur)
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const dateToUse = activeDateType === 'value'
        ? parseLocalDate(transaction.value_date || transaction.transaction_date)
        : parseLocalDate(transaction.transaction_date);
      return isWithinInterval(dateToUse, { start: period.from, end: period.to });
    });
  }, [transactions, period, activeDateType]);

  // Shared initial balance calculation (used by stats and balance evolution)
  // O(n) approach: single pass through transactions, accumulate per-account net changes
  const initialBalance = useMemo(() => {
    const accountIds = new Set(accounts.map(a => a.id));

    const netChangeByAccount = new Map<string, number>();
    for (const t of transactions) {
      const transactionDate = activeDateType === 'value'
        ? parseLocalDate(t.value_date || t.transaction_date)
        : parseLocalDate(t.transaction_date);
      if (transactionDate < period.from) continue;

      const srcId = t.account_id;
      const dstId = t.transfer_to_account_id;

      if (srcId && accountIds.has(srcId)) {
        const prev = netChangeByAccount.get(srcId) || 0;
        switch (t.type) {
          case 'income':
            netChangeByAccount.set(srcId, prev - Number(t.amount));
            break;
          case 'expense':
            netChangeByAccount.set(srcId, prev + Number(t.amount));
            break;
          case 'transfer':
            netChangeByAccount.set(srcId, prev + Number(t.amount) + Number(t.transfer_fee || 0));
            break;
        }
      }
      if (dstId && accountIds.has(dstId)) {
        const prev = netChangeByAccount.get(dstId) || 0;
        netChangeByAccount.set(dstId, prev - Number(t.amount));
      }
    }

    return accounts.reduce((sum, account) => {
      const netChange = netChangeByAccount.get(account.id) || 0;
      return sum + Number(account.balance) + netChange;
    }, 0);
  }, [accounts, transactions, period, activeDateType]);

  // Calculs des statistiques avec soldes initiaux
  const stats = useMemo<ReportsStats>(() => {
    // Filtrer uniquement les transactions qui doivent être incluses dans les stats
    const statsTransactions = filteredTransactions.filter(t => t.include_in_stats !== false);

    // Income: exclude refund transactions (they're handled via net amount on expenses)
    const income = statsTransactions
      .filter(t => t.type === 'income' && !t.refund_of_transaction_id)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Expenses: use NET amount (original - refunded) so only unreimbursed portion counts
    // If fully refunded (refunded >= amount), net is 0 (excess becomes separate income)
    const expenses = statsTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        const refundedAmount = t.refunded_amount || 0;
        const netAmount = Math.max(0, Number(t.amount) - refundedAmount);
        return sum + netAmount;
      }, 0);

    const transferFees = statsTransactions
      .filter(t => t.type === 'transfer')
      .reduce((sum, t) => sum + Number(t.transfer_fee || 0), 0);

    const netPeriodBalance = income - expenses - transferFees;
    const finalBalance = initialBalance + netPeriodBalance;

    return {
      income,
      expenses,
      netPeriodBalance,
      initialBalance,
      finalBalance
    };
  }, [filteredTransactions, initialBalance]);

  // Compute stats (income, expenses, net) for an arbitrary date range using same rules as `stats`.
  const computeStatsForRange = useMemo(() => {
    return (start: Date, end: Date, dateType: 'accounting' | 'value' = activeDateType) => {
      let income = 0, expenses = 0, transferFees = 0;
      for (const t of transactions) {
        const dateToUse = dateType === 'value'
          ? parseLocalDate(t.value_date || t.transaction_date)
          : parseLocalDate(t.transaction_date);
        if (!isWithinInterval(dateToUse, { start, end })) continue;
        if (t.include_in_stats === false) continue;
        if (t.type === 'income' && !t.refund_of_transaction_id) {
          income += Number(t.amount);
        } else if (t.type === 'expense') {
          expenses += Math.max(0, Number(t.amount) - Number(t.refunded_amount || 0));
        } else if (t.type === 'transfer') {
          transferFees += Number(t.transfer_fee || 0);
        }
      }
      return { income, expenses, transferFees, net: income - expenses - transferFees };
    };
  }, [transactions, activeDateType]);

  // Prior period: previous slot of equivalent length (month→prev month, year→prev year, custom→same span shifted back).
  const priorPeriod = useMemo<{ from: Date; to: Date; label: string }>(() => {
    switch (periodType) {
      case 'month': {
        const prev = subMonths(selectedDate, 1);
        return { from: startOfMonth(prev), to: endOfMonth(prev), label: format(prev, 'MMMM yyyy', { locale: fr }) };
      }
      case 'year': {
        const prev = subYears(selectedDate, 1);
        return { from: startOfYear(prev), to: endOfYear(prev), label: format(prev, 'yyyy', { locale: fr }) };
      }
      case 'custom': {
        const days = differenceInDays(period.to, period.from) + 1;
        const to = addDays(period.from, -1);
        const from = addDays(to, -(days - 1));
        return { from, to, label: `${format(from, 'dd/MM/yy')} – ${format(to, 'dd/MM/yy')}` };
      }
    }
  }, [periodType, selectedDate, period]);

  const priorStats = useMemo<ReportsStats>(() => {
    const r = computeStatsForRange(priorPeriod.from, priorPeriod.to);
    return {
      income: r.income,
      expenses: r.expenses,
      netPeriodBalance: r.net,
      initialBalance: 0,
      finalBalance: 0,
    };
  }, [priorPeriod, computeStatsForRange]);

  // 3-month average stats (mean of three preceding months) for the "3-mo avg" compare option.
  const threeMoAvgStats = useMemo<ReportsStats>(() => {
    const anchor = periodType === 'month' ? selectedDate : period.from;
    let inc = 0, exp = 0, net = 0;
    for (let i = 1; i <= 3; i++) {
      const ref = subMonths(anchor, i);
      const r = computeStatsForRange(startOfMonth(ref), endOfMonth(ref));
      inc += r.income; exp += r.expenses; net += r.net;
    }
    return { income: inc / 3, expenses: exp / 3, netPeriodBalance: net / 3, initialBalance: 0, finalBalance: 0 };
  }, [periodType, selectedDate, period, computeStatsForRange]);

  // Same period one year ago.
  const yearAgoPeriod = useMemo<{ from: Date; to: Date; label: string }>(() => {
    const from = subYears(period.from, 1);
    const to = subYears(period.to, 1);
    return { from, to, label: format(from, 'MMM yyyy', { locale: fr }) };
  }, [period]);

  const yearAgoStats = useMemo<ReportsStats>(() => {
    const r = computeStatsForRange(yearAgoPeriod.from, yearAgoPeriod.to);
    return { income: r.income, expenses: r.expenses, netPeriodBalance: r.net, initialBalance: 0, finalBalance: 0 };
  }, [yearAgoPeriod, computeStatsForRange]);

  // 6-month sparkline ending at the period's anchor month (current period's end month).
  const sparklineData = useMemo<SparklinePoint[]>(() => {
    const anchor = periodType === 'month' ? selectedDate : period.to;
    const out: SparklinePoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = subMonths(anchor, i);
      const start = startOfMonth(ref);
      const end = endOfMonth(ref);
      const r = computeStatsForRange(start, end);
      out.push({
        label: format(ref, 'MMM', { locale: fr }),
        net: r.net,
        income: r.income,
        expenses: r.expenses,
        isCurrent: i === 0,
      });
    }
    return out;
  }, [periodType, selectedDate, period, computeStatsForRange]);


  // Données pour l'évolution des soldes avec projection
  // Always uses transaction_date (accounting date) for chart positioning, regardless of date type setting
  const balanceEvolutionData = useMemo<BalanceDataPoint[]>(() => {
    if (skipHeavy) return [];
    // Always use transaction_date (accounting date) for the evolution chart
    const getAccountingDate = (t: Transaction) => parseLocalDate(t.transaction_date);
    
    // Utiliser filteredTransactions qui sont déjà filtrés par période selon le dateType
    // Puis trier par date comptable pour l'affichage
    const sortedTransactions = [...filteredTransactions]
      .sort((a, b) => getAccountingDate(a).getTime() - getAccountingDate(b).getTime());
    
    const dailyData: BalanceDataPoint[] = [];

    let runningBalance = initialBalance;
    
    // Ajouter le point de départ
    const startDate = period.from;
    dailyData.push({
      date: format(startDate, "dd/MM", { locale: fr }),
      solde: runningBalance,
      soldeProjecte: runningBalance,
      dateObj: startDate
    });

    // Grouper les transactions par date comptable (transaction_date)
    const transactionsByDate = new Map();
    sortedTransactions.forEach(t => {
      const date = format(getAccountingDate(t), "yyyy-MM-dd");
      if (!transactionsByDate.has(date)) {
        transactionsByDate.set(date, []);
      }
      transactionsByDate.get(date).push(t);
    });

    // Créer les points pour chaque jour de transaction
    const sortedDates = Array.from(transactionsByDate.keys()).sort();
    sortedDates.forEach(dateStr => {
      const dateObj = parseLocalDate(dateStr);
      const dayTransactions = transactionsByDate.get(dateStr);
      
      const dayBalance = dayTransactions.reduce((sum: number, t: Transaction) => {
        if (t.type === 'income') return sum + Number(t.amount);
        if (t.type === 'expense') return sum - Number(t.amount);
        return sum - Number(t.transfer_fee || 0);
      }, 0);
      
      runningBalance += dayBalance;
      
      dailyData.push({
        date: format(dateObj, "dd/MM", { locale: fr }),
        solde: runningBalance,
        soldeProjecte: runningBalance,
        dateObj: dateObj
      });
    });

    return dailyData;
  }, [filteredTransactions, period, initialBalance, skipHeavy]);

  // Données pour les catégories avec budgets
  const categoryChartData = useMemo<CategoryData[]>(() => {
    // Calculer le multiplicateur de budget selon la période
    let budgetMultiplier = 1;
    
    if (periodType === 'year') {
      budgetMultiplier = 12;
    } else if (periodType === 'custom') {
      const daysInPeriod = differenceInDays(period.to, period.from) + 1;
      budgetMultiplier = daysInPeriod / 30; // 1 mois = 30 jours
    }
    // periodType === 'month' → budgetMultiplier = 1 (pas de changement)
    
    // Filtrer uniquement les transactions qui doivent être incluses dans les stats
    // Utiliser le montant NET (original - remboursé) pour les dépenses
    // Pre-build category budget lookup (O(1) instead of O(n) per transaction)
    const categoryBudgetMap = new Map(categories.map(c => [c.id, c.budget || 0]));

    const expensesByCategory = filteredTransactions
      .filter(t => t.type === 'expense' && t.include_in_stats !== false)
      .reduce((acc, t) => {
        const categoryId = t.category?.id || 'uncategorized';
        const categoryName = t.category?.name || 'Non catégorisé';
        const categoryBudget = categoryBudgetMap.get(categoryId) || 0;
        const categoryColor = t.category?.color || '#6b7280';
        
        // Calculer le montant net (après remboursement)
        const refundedAmount = t.refunded_amount || 0;
        const netAmount = Math.max(0, Number(t.amount) - refundedAmount);
        
        if (!acc[categoryId]) {
          acc[categoryId] = {
            name: categoryName,
            spent: 0,
            budget: Number(categoryBudget) * budgetMultiplier,
            color: categoryColor
          };
        }
        acc[categoryId].spent += netAmount;
        return acc;
      }, {} as Record<string, { name: string; spent: number; budget: number; color: string }>);

    // Ajouter les catégories avec budget mais sans dépenses
    categories.forEach(category => {
      if (category.budget && category.budget > 0 && !expensesByCategory[category.id]) {
        expensesByCategory[category.id] = {
          name: category.name,
          spent: 0,
          budget: Number(category.budget) * budgetMultiplier,
          color: category.color
        };
      }
    });

    return Object.entries(expensesByCategory)
      .map(([_, data]) => ({
        ...data,
        percentage: data.budget > 0 ? (data.spent / data.budget * 100).toFixed(1) : "0",
        remaining: data.budget > 0 ? Math.max(0, data.budget - data.spent) : 0
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [filteredTransactions, categories, periodType, period]);

  // Données pour les transactions récurrentes
  const emptyRecurringData: RecurringData = {
    activeRecurring: [], monthlyIncome: 0, monthlyExpenses: 0, monthlyNet: 0,
    yearlyIncome: 0, yearlyExpenses: 0, yearlyNet: 0, byCategory: [],
    incomeCount: 0, expenseCount: 0, periodItems: [], periodIncome: 0,
    periodExpenses: 0, periodNet: 0, periodIncomeCount: 0, periodExpenseCount: 0,
    periodByCategory: [], gapBalance: 0,
  };

  const recurringData = useMemo<RecurringData>(() => {
    if (skipHeavy) return emptyRecurringData;
    const activeRecurring = recurringTransactions.filter(rt => rt.is_active);

    // Build debt lookup maps
    const debtMap = new Map<string, DebtInfo>();
    if (debtInfos) {
      for (const d of debtInfos) debtMap.set(d.id, d);
    }

    // Resolve the linked debt for a recurring transaction (by debt_id or description fallback)
    const resolveDebt = (rt: RecurringTransaction): DebtInfo | null => {
      if (rt.debt_id) return debtMap.get(rt.debt_id) || null;
      // Fallback: match by description pattern for old recurring transactions
      if (rt.description.includes('(Remboursement dette)') || rt.description.includes('(Remboursement prêt)')) {
        for (const d of debtMap.values()) {
          const suffixReceived = `${d.description} (Remboursement dette)`;
          const suffixGiven = `${d.description} (Remboursement prêt)`;
          if (rt.description === suffixReceived || rt.description === suffixGiven) return d;
        }
      }
      return null;
    };

    // Build scheduled debt payment lookup by debt_id:YYYY-MM for per-month amounts
    const sdpLookup = new Map<string, number>();
    if (scheduledDebtPaymentInfos) {
      for (const sp of scheduledDebtPaymentInfos) {
        sdpLookup.set(`${sp.debt_id}:${sp.scheduled_date.substring(0, 7)}`, sp.scheduled_amount);
      }
    }

    // Get the effective amount for a debt-linked recurring transaction
    // dateStr is YYYY-MM-DD so we can look up the scheduled amount for that specific month
    const getDebtAmount = (rt: RecurringTransaction, debt: DebtInfo, dateStr?: string): number => {
      if (dateStr && scheduledDebtPaymentInfos) {
        const monthKey = dateStr.substring(0, 7);
        const scheduled = sdpLookup.get(`${debt.id}:${monthKey}`);
        if (scheduled !== undefined) return scheduled;
      }
      if (scheduledDebtPaymentInfos) {
        const nextUnpaid = scheduledDebtPaymentInfos.find(sp => sp.debt_id === debt.id && !sp.is_paid);
        if (nextUnpaid) return nextUnpaid.scheduled_amount;
      }
      return debt.payment_amount > 0 ? debt.payment_amount : rt.amount;
    };

    const toMonthly = (amount: number, recurrenceType: string) => {
      switch (recurrenceType) {
        case 'weekly': return amount * 52 / 12;
        case 'monthly': return amount;
        case 'quarterly': return amount / 3;
        case 'yearly': return amount / 12;
        default: return amount;
      }
    };

    // Determine effective type: reimbursement installment-linked recurring are expenses
    const getEffectiveType = (rt: RecurringTransaction): 'income' | 'expense' => {
      if (rt.installment_payment_id && rt.type === 'income') return 'expense';
      return rt.type;
    };

    // Safe date advancement helper
    const advanceDate = (date: Date, recurrenceType: string): Date => {
      const y = date.getFullYear();
      const m = date.getMonth();
      const d = date.getDate();
      switch (recurrenceType) {
        case 'weekly':
          return new Date(y, m, d + 7);
        case 'monthly': {
          const next = new Date(y, m + 1, d);
          return next.getMonth() !== (m + 1) % 12 ? new Date(y, m + 2, 0) : next;
        }
        case 'quarterly': {
          const nextQ = new Date(y, m + 3, d);
          return nextQ.getMonth() !== (m + 3) % 12 ? new Date(y, m + 4, 0) : nextQ;
        }
        case 'yearly':
          return new Date(y + 1, m, d);
        default:
          return new Date(y, m + 1, d);
      }
    };

    // Build installment lookup for remaining payment caps
    const installmentMap = new Map<string, InstallmentPaymentInfo>();
    if (installmentPayments) {
      for (const ip of installmentPayments) {
        installmentMap.set(ip.id, ip);
      }
    }

    // Count occurrences of a recurring transaction in the period
    // Mirrors the calendar logic: past occurrences before next_due_date are counted,
    // future occurrences start from next_due_date and are capped by installment/debt limits
    const getOccurrencesInPeriod = (rt: RecurringTransaction): { total: number; past: number; future: number; details: PeriodOccurrenceDetail[] } => {
      if (!rt.start_date || !rt.next_due_date) return { total: 0, past: 0, future: 0, details: [] };
      const [sy, sm, sd] = rt.start_date.split('-').map(Number);
      if (isNaN(sy) || isNaN(sm) || isNaN(sd)) return { total: 0, past: 0, future: 0, details: [] };
      let current = new Date(sy, sm - 1, sd);
      const endDate = rt.end_date && rt.end_date.length >= 10 ? parseLocalDate(rt.end_date) : null;
      if (endDate && isNaN(endDate.getTime())) return { total: 0, past: 0, future: 0, details: [] };
      // Cap is wide enough for ~190 years of weekly recurrences. Long-running
      // weekly recurrences started years ago (e.g., 2014) used to silently
      // hit the previous 500 cap and never reach far-future periods like
      // "Full year 2026", which is why projections diverged from the Budget
      // page (which walks from next_due_date and never has this problem).
      const maxIterations = 10000;
      let iterations = 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [ny, nm, nd] = rt.next_due_date.split('-').map(Number);
      const nextDueDate = new Date(ny, nm - 1, nd);

      // Compute effective end date based on installment/debt remaining payments
      let effectiveEndDate: Date | null = endDate;

      if (rt.installment_payment_id) {
        const ip = installmentMap.get(rt.installment_payment_id);
        if (ip) {
          if (!ip.is_active || ip.installment_amount <= 0) {
            if (!effectiveEndDate || nextDueDate < effectiveEndDate) {
              effectiveEndDate = new Date(nextDueDate.getTime() - 86400000);
            }
          } else {
            const maxFuture = Math.ceil(ip.remaining_amount / ip.installment_amount);
            if (maxFuture <= 0) {
              if (!effectiveEndDate || nextDueDate < effectiveEndDate) {
                effectiveEndDate = new Date(nextDueDate.getTime() - 86400000);
              }
            } else {
              let lastOccurrence = new Date(nextDueDate);
              for (let i = 1; i < maxFuture; i++) {
                lastOccurrence = advanceDate(lastOccurrence, rt.recurrence_type);
              }
              if (!effectiveEndDate || lastOccurrence < effectiveEndDate) {
                effectiveEndDate = lastOccurrence;
              }
            }
          }
        }
      }

      const linkedDebt = resolveDebt(rt);
      if (linkedDebt) {
        if (linkedDebt.status === 'completed') {
          if (!effectiveEndDate || nextDueDate < effectiveEndDate) {
            effectiveEndDate = new Date(nextDueDate.getTime() - 86400000);
          }
        } else {
          // Use count of unpaid scheduled payments if available (more accurate for variable schedules)
          let maxFuture = 0;
          if (scheduledDebtPaymentInfos) {
            maxFuture = scheduledDebtPaymentInfos.filter(sp => sp.debt_id === linkedDebt.id && !sp.is_paid).length;
          }
          if (maxFuture === 0 && linkedDebt.payment_amount > 0) {
            maxFuture = Math.ceil(linkedDebt.remaining_amount / linkedDebt.payment_amount);
          }
          if (maxFuture <= 0) {
            if (!effectiveEndDate || nextDueDate < effectiveEndDate) {
              effectiveEndDate = new Date(nextDueDate.getTime() - 86400000);
            }
          } else {
            let lastOccurrence = new Date(nextDueDate);
            for (let i = 1; i < maxFuture; i++) {
              lastOccurrence = advanceDate(lastOccurrence, rt.recurrence_type);
            }
            if (!effectiveEndDate || lastOccurrence < effectiveEndDate) {
              effectiveEndDate = lastOccurrence;
            }
          }
        }
      }

      let past = 0;
      let future = 0;
      const details: PeriodOccurrenceDetail[] = [];

      while (current <= period.to && iterations < maxIterations) {
        if (effectiveEndDate && current > effectiveEndDate) break;
        if (current >= period.from && current <= period.to) {
          const isPast = current < today;
          const isFuture = !isPast;

          // Mirror calendar: future occurrences before next_due_date are skipped
          if (isFuture && current < nextDueDate) {
            current = advanceDate(current, rt.recurrence_type);
            iterations++;
            continue;
          }
          if (isPast) past++;
          else future++;
          const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          details.push({ date: dateStr, amount: getEffectiveAmount(rt, dateStr), isFuture });
        }
        current = advanceDate(current, rt.recurrence_type);
        iterations++;
      }

      return { total: past + future, past, future, details };
    };

    // Monthly/yearly sums (kept for evolution tab projections)
    // Helper to get effective display amount for a recurring transaction
    const getEffectiveAmount = (rt: RecurringTransaction, dateStr?: string): number => {
      const debt = resolveDebt(rt);
      if (debt) return getDebtAmount(rt, debt, dateStr);
      if (rt.installment_payment_id) {
        const ip = installmentMap.get(rt.installment_payment_id);
        if (ip) return ip.installment_amount;
      }
      return Number(rt.amount);
    };

    const monthlyIncome = activeRecurring
      .filter(rt => getEffectiveType(rt) === 'income')
      .reduce((sum, rt) => sum + toMonthly(getEffectiveAmount(rt), rt.recurrence_type), 0);

    const monthlyExpenses = activeRecurring
      .filter(rt => getEffectiveType(rt) === 'expense')
      .reduce((sum, rt) => sum + toMonthly(getEffectiveAmount(rt), rt.recurrence_type), 0);

    const incomeCount = activeRecurring.filter(rt => getEffectiveType(rt) === 'income').length;
    const expenseCount = activeRecurring.filter(rt => getEffectiveType(rt) === 'expense').length;

    // Group by category for chart data (monthly-based, kept for compatibility)
    const categoryMap = new Map<string, { name: string; color: string; amount: number; count: number; type: 'income' | 'expense' }>();
    for (const rt of activeRecurring) {
      const catName = rt.category?.name || 'Sans catégorie';
      const catColor = rt.category?.color || '#94a3b8';
      const effectiveType = getEffectiveType(rt);
      const key = `${catName}-${effectiveType}`;
      const existing = categoryMap.get(key);
      const monthlyAmount = toMonthly(getEffectiveAmount(rt), rt.recurrence_type);
      if (existing) {
        existing.amount += monthlyAmount;
        existing.count += 1;
      } else {
        categoryMap.set(key, { name: catName, color: catColor, amount: monthlyAmount, count: 1, type: effectiveType });
      }
    }

    // Period-based computation: only recurring transactions with occurrences in the period
    const periodItems: PeriodRecurringItem[] = [];
    for (const rt of activeRecurring) {
      const occ = getOccurrencesInPeriod(rt);
      if (occ.total > 0) {
        const effectiveType = getEffectiveType(rt);
        const totalAmount = occ.details.reduce((s, d) => s + d.amount, 0);
        const futureAmt = occ.details.filter(d => d.isFuture).reduce((s, d) => s + d.amount, 0);
        const pastAmt = occ.details.filter(d => !d.isFuture).reduce((s, d) => s + d.amount, 0);
        periodItems.push({
          recurring: rt,
          occurrences: occ.total,
          periodAmount: totalAmount,
          effectiveType,
          pastOccurrences: occ.past,
          futureOccurrences: occ.future,
          pastAmount: pastAmt,
          futureAmount: futureAmt,
          futurePeriodAmount: futureAmt,
          occurrenceDetails: occ.details,
        });
      }
    }

    const periodIncome = periodItems
      .filter(pi => pi.effectiveType === 'income')
      .reduce((sum, pi) => sum + pi.periodAmount, 0);
    const periodExpenses = periodItems
      .filter(pi => pi.effectiveType === 'expense')
      .reduce((sum, pi) => sum + pi.periodAmount, 0);
    const periodIncomeCount = periodItems.filter(pi => pi.effectiveType === 'income').length;
    const periodExpenseCount = periodItems.filter(pi => pi.effectiveType === 'expense').length;

    // Period-based category grouping
    const periodCategoryMap = new Map<string, { name: string; color: string; amount: number; count: number; type: 'income' | 'expense' }>();
    for (const pi of periodItems) {
      const catName = pi.recurring.category?.name || 'Sans catégorie';
      const catColor = pi.recurring.category?.color || '#94a3b8';
      const key = `${catName}-${pi.effectiveType}`;
      const existing = periodCategoryMap.get(key);
      if (existing) {
        existing.amount += pi.periodAmount;
        existing.count += pi.occurrences;
      } else {
        periodCategoryMap.set(key, { name: catName, color: catColor, amount: pi.periodAmount, count: pi.occurrences, type: pi.effectiveType });
      }
    }

    // For future periods, compute net impact of recurring transactions between today and period.from
    let gapBalance = 0;
    const todayGap = new Date();
    todayGap.setHours(0, 0, 0, 0);
    if (period.from > todayGap) {
      for (const rt of activeRecurring) {
        if (!rt.next_due_date) continue;
        const [gny, gnm, gnd] = rt.next_due_date.split('-').map(Number);
        if (isNaN(gny) || isNaN(gnm) || isNaN(gnd)) continue;

        if (rt.installment_payment_id) {
          const ip = installmentMap.get(rt.installment_payment_id);
          if (!ip || !ip.is_active || ip.remaining_amount <= 0) continue;
        }
        const linkedDebt = resolveDebt(rt);
        if (linkedDebt && (linkedDebt.status === 'completed' || linkedDebt.remaining_amount <= 0)) continue;

        let cur = new Date(gny, gnm - 1, gnd);
        const effectiveType = getEffectiveType(rt);
        let gapIter = 0;
        while (cur < period.from && gapIter < 500) {
          if (cur > todayGap) {
            const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
            const amt = getEffectiveAmount(rt, ds);
            gapBalance += effectiveType === 'income' ? amt : -amt;
          }
          cur = advanceDate(cur, rt.recurrence_type);
          gapIter++;
        }
      }
    }

    return {
      activeRecurring,
      monthlyIncome,
      monthlyExpenses,
      monthlyNet: monthlyIncome - monthlyExpenses,
      yearlyIncome: monthlyIncome * 12,
      yearlyExpenses: monthlyExpenses * 12,
      yearlyNet: (monthlyIncome - monthlyExpenses) * 12,
      byCategory: Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount),
      incomeCount,
      expenseCount,
      // Period-based
      periodItems,
      periodIncome,
      periodExpenses,
      periodNet: periodIncome - periodExpenses,
      periodIncomeCount,
      periodExpenseCount,
      periodByCategory: Array.from(periodCategoryMap.values()).sort((a, b) => b.amount - a.amount),
      gapBalance,
    };
  }, [recurringTransactions, period, installmentPayments, debtInfos, scheduledDebtPaymentInfos, debtPaymentInfos, transactions, activeDateType]);

  // Augment balance evolution with projections from recurringData.periodItems
  // For future periods, adjust starting balance with gapBalance (projected recurring between today and period start)
  const balanceEvolutionWithProjection = useMemo<BalanceDataPoint[]>(() => {
    if (skipHeavy || balanceEvolutionData.length === 0) return balanceEvolutionData;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodEnd = new Date(period.to);
    periodEnd.setHours(0, 0, 0, 0);

    if (periodEnd < today) return balanceEvolutionData;

    const gap = recurringData.gapBalance;

    // Adjust base data points by gapBalance for future periods
    const adjustedBase = gap !== 0
      ? balanceEvolutionData.map(d => ({
          ...d,
          solde: d.solde !== null ? d.solde + gap : null,
          soldeProjecte: d.soldeProjecte + gap,
        }))
      : balanceEvolutionData;

    const futureItems: Array<{ date: Date; amount: number; type: 'income' | 'expense' }> = [];
    for (const pi of recurringData.periodItems) {
      for (const occ of pi.occurrenceDetails) {
        if (occ.isFuture) {
          futureItems.push({
            date: parseLocalDate(occ.date),
            amount: occ.amount,
            type: pi.effectiveType,
          });
        }
      }
    }

    if (futureItems.length === 0) return adjustedBase;

    futureItems.sort((a, b) => a.date.getTime() - b.date.getTime());

    const lastPoint = adjustedBase[adjustedBase.length - 1];
    let currentProjected = lastPoint?.soldeProjecte ?? lastPoint?.solde ?? 0;

    const projectionPoints: BalanceDataPoint[] = futureItems.map(ft => {
      if (ft.type === 'income') currentProjected += ft.amount;
      else currentProjected -= ft.amount;
      return {
        date: format(ft.date, "dd/MM", { locale: fr }),
        solde: null,
        soldeProjecte: currentProjected,
        dateObj: new Date(ft.date),
        isProjection: true,
      };
    });

    return [...adjustedBase, ...projectionPoints];
  }, [balanceEvolutionData, recurringData.periodItems, recurringData.gapBalance, period, skipHeavy]);

  // Données spending patterns si activé
  const spendingPatternsData = useMemo<SpendingPatternsData | null>(() => {
    if (skipHeavy) return null;
    // Filtrer uniquement les transactions qui doivent être incluses dans les stats
    const statsTransactions = filteredTransactions.filter(t => t.include_in_stats !== false);
    if (!useSpendingPatterns || statsTransactions.length === 0) return null;

    const daysInPeriod = differenceInDays(period.to, period.from) + 1;
    const dailyAvgIncome = stats.income / daysInPeriod;
    const dailyAvgExpenses = stats.expenses / daysInPeriod;

    return {
      dailyAvgIncome,
      dailyAvgExpenses,
      dailyNet: dailyAvgIncome - dailyAvgExpenses,
      projectedMonthlyIncome: dailyAvgIncome * 30,
      projectedMonthlyExpenses: dailyAvgExpenses * 30,
      projectedMonthlyNet: (dailyAvgIncome - dailyAvgExpenses) * 30
    };
  }, [useSpendingPatterns, filteredTransactions, stats, period]);

  // Analyse des revenus par catégories automatiques
  const incomeAnalysis = useIncomeAnalysis(filteredTransactions);

  // Secondary date-type computations (used by Reports.tsx to show income/expense tabs
  // with a user-selectable date type while the evolution/recurring tabs always use accounting date).
  const secondaryDateType = options?.secondaryDateType;
  const useSecondary = secondaryDateType !== undefined && secondaryDateType !== activeDateType;

  const secondaryFilteredTransactions = useMemo(() => {
    if (!useSecondary) return filteredTransactions;
    return transactions.filter(transaction => {
      const dateToUse = secondaryDateType === 'value'
        ? parseLocalDate(transaction.value_date || transaction.transaction_date)
        : parseLocalDate(transaction.transaction_date);
      return isWithinInterval(dateToUse, { start: period.from, end: period.to });
    });
  }, [useSecondary, filteredTransactions, transactions, period, secondaryDateType]);

  const secondaryInitialBalance = useMemo(() => {
    if (!useSecondary) return initialBalance;
    const accountIds = new Set(accounts.map(a => a.id));
    const netChangeByAccount = new Map<string, number>();
    for (const t of transactions) {
      const transactionDate = secondaryDateType === 'value'
        ? parseLocalDate(t.value_date || t.transaction_date)
        : parseLocalDate(t.transaction_date);
      if (transactionDate < period.from) continue;
      const srcId = t.account_id;
      const dstId = t.transfer_to_account_id;
      if (srcId && accountIds.has(srcId)) {
        const prev = netChangeByAccount.get(srcId) || 0;
        switch (t.type) {
          case 'income': netChangeByAccount.set(srcId, prev - Number(t.amount)); break;
          case 'expense': netChangeByAccount.set(srcId, prev + Number(t.amount)); break;
          case 'transfer': netChangeByAccount.set(srcId, prev + Number(t.amount) + Number(t.transfer_fee || 0)); break;
        }
      }
      if (dstId && accountIds.has(dstId)) {
        const prev = netChangeByAccount.get(dstId) || 0;
        netChangeByAccount.set(dstId, prev - Number(t.amount));
      }
    }
    return accounts.reduce((sum, account) => sum + Number(account.balance) + (netChangeByAccount.get(account.id) || 0), 0);
  }, [useSecondary, initialBalance, accounts, transactions, period, secondaryDateType]);

  const secondaryStats = useMemo<ReportsStats>(() => {
    if (!useSecondary) return stats;
    const statsTransactions = secondaryFilteredTransactions.filter(t => t.include_in_stats !== false);
    const income = statsTransactions
      .filter(t => t.type === 'income' && !t.refund_of_transaction_id)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expenses = statsTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Math.max(0, Number(t.amount) - (t.refunded_amount || 0)), 0);
    const transferFees = statsTransactions
      .filter(t => t.type === 'transfer')
      .reduce((sum, t) => sum + Number(t.transfer_fee || 0), 0);
    const netPeriodBalance = income - expenses - transferFees;
    return {
      income,
      expenses,
      netPeriodBalance,
      initialBalance: secondaryInitialBalance,
      finalBalance: secondaryInitialBalance + netPeriodBalance,
    };
  }, [useSecondary, stats, secondaryFilteredTransactions, secondaryInitialBalance]);

  const secondaryCategoryChartData = useMemo<CategoryData[]>(() => {
    if (!useSecondary) return categoryChartData;
    let budgetMultiplier = 1;
    if (periodType === 'year') budgetMultiplier = 12;
    else if (periodType === 'custom') budgetMultiplier = (differenceInDays(period.to, period.from) + 1) / 30;

    const categoryBudgetMap = new Map(categories.map(c => [c.id, c.budget || 0]));
    const expensesByCategory = secondaryFilteredTransactions
      .filter(t => t.type === 'expense' && t.include_in_stats !== false)
      .reduce((acc, t) => {
        const categoryId = t.category?.id || 'uncategorized';
        const categoryName = t.category?.name || 'Non catégorisé';
        const categoryBudget = categoryBudgetMap.get(categoryId) || 0;
        const categoryColor = t.category?.color || '#6b7280';
        const netAmount = Math.max(0, Number(t.amount) - (t.refunded_amount || 0));
        if (!acc[categoryId]) {
          acc[categoryId] = { name: categoryName, spent: 0, budget: Number(categoryBudget) * budgetMultiplier, color: categoryColor };
        }
        acc[categoryId].spent += netAmount;
        return acc;
      }, {} as Record<string, { name: string; spent: number; budget: number; color: string }>);

    categories.forEach(category => {
      if (category.budget && category.budget > 0 && !expensesByCategory[category.id]) {
        expensesByCategory[category.id] = { name: category.name, spent: 0, budget: Number(category.budget) * budgetMultiplier, color: category.color };
      }
    });

    return Object.entries(expensesByCategory)
      .map(([_, data]) => ({
        ...data,
        percentage: data.budget > 0 ? (data.spent / data.budget * 100).toFixed(1) : "0",
        remaining: data.budget > 0 ? Math.max(0, data.budget - data.spent) : 0,
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [useSecondary, categoryChartData, secondaryFilteredTransactions, categories, periodType, period]);

  const secondaryIncomeAnalysisComputed = useIncomeAnalysis(useSecondary ? secondaryFilteredTransactions : []);
  const secondaryIncomeAnalysis = useSecondary ? secondaryIncomeAnalysisComputed : incomeAnalysis;

  return {
    loading,
    period,
    priorPeriod,
    priorStats,
    sparklineData,
    filteredTransactions,
    stats,
    balanceEvolutionData: balanceEvolutionWithProjection,
    categoryChartData,
    recurringData,
    spendingPatternsData,
    incomeAnalysis,
    accounts,
    // Secondary date-type views (same as primary when secondaryDateType is absent or equal)
    secondaryFilteredTransactions,
    secondaryStats,
    secondaryCategoryChartData,
    secondaryIncomeAnalysis,
  };
};