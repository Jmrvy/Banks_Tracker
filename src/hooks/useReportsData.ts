import { useMemo } from "react";
import { useFinancialData, type Transaction, type RecurringTransaction } from "@/hooks/useFinancialData";
import { useIncomeAnalysis, IncomeCategory } from "@/hooks/useIncomeAnalysis";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";

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

export interface PeriodRecurringItem {
  recurring: RecurringTransaction;
  occurrences: number;
  periodAmount: number;
  effectiveType: 'income' | 'expense';
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
}

export interface SpendingPatternsData {
  dailyAvgIncome: number;
  dailyAvgExpenses: number;
  dailyNet: number;
  projectedMonthlyIncome: number;
  projectedMonthlyExpenses: number;
  projectedMonthlyNet: number;
}

export const useReportsData = (
  periodType: "month" | "year" | "custom",
  selectedDate: Date,
  dateRange: { from: Date; to: Date },
  useSpendingPatterns: boolean,
  overrideDateType?: 'accounting' | 'value'
) => {
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
        ? new Date(transaction.value_date || transaction.transaction_date)
        : new Date(transaction.transaction_date);
      return isWithinInterval(dateToUse, { start: period.from, end: period.to });
    });
  }, [transactions, period, activeDateType]);

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

    // Calcul du solde initial basé sur les comptes actuels moins les transactions de la période
    const initialBalance = accounts.reduce((sum, account) => {
      const accountTransactionsSincePeriodStart = transactions.filter(t => {
        const transactionDate = activeDateType === 'value'
          ? new Date(t.value_date || t.transaction_date)
          : new Date(t.transaction_date);
        return transactionDate >= period.from &&
               (t.account?.name === account.name || t.transfer_to_account?.name === account.name);
      });
      
      const accountNetChange = accountTransactionsSincePeriodStart.reduce((change, t) => {
        if (t.account?.name === account.name) {
          switch (t.type) {
            case 'income':
              return change - Number(t.amount);
            case 'expense':
              return change + Number(t.amount);
            case 'transfer':
              return change + Number(t.amount) + Number(t.transfer_fee || 0);
          }
        }
        if (t.transfer_to_account?.name === account.name) {
          return change - Number(t.amount);
        }
        return change;
      }, 0);

      const initialAccountBalance = Number(account.balance) + accountNetChange;
      return sum + initialAccountBalance;
    }, 0);

    const finalBalance = initialBalance + netPeriodBalance;

    return { 
      income, 
      expenses, 
      netPeriodBalance, 
      initialBalance,
      finalBalance
    };
  }, [filteredTransactions, accounts, transactions, period]);

  // Données pour l'évolution des soldes avec projection
  // Uses the selected date type (accounting or value date) for consistency
  const balanceEvolutionData = useMemo<BalanceDataPoint[]>(() => {
    // Helper to get the date based on user preference
    const getAccountingDate = (t: Transaction) => {
      if (activeDateType === 'value') {
        return new Date(t.value_date || t.transaction_date);
      }
      return new Date(t.transaction_date);
    };
    
    // Utiliser filteredTransactions qui sont déjà filtrés par période selon le dateType
    // Puis trier par date comptable pour l'affichage
    const sortedTransactions = [...filteredTransactions]
      .sort((a, b) => getAccountingDate(a).getTime() - getAccountingDate(b).getTime());
    
    const dailyData: BalanceDataPoint[] = [];
    
    // Calculer le solde initial basé sur les comptes actuels moins les transactions depuis le début de la période
    const initialBalance = accounts.reduce((sum, account) => {
      const accountTransactionsSincePeriodStart = transactions.filter(t => {
        const transactionDate = activeDateType === 'value'
          ? new Date(t.value_date || t.transaction_date)
          : new Date(t.transaction_date);
        return transactionDate >= period.from &&
               (t.account?.name === account.name || t.transfer_to_account?.name === account.name);
      });
      
      const accountNetChange = accountTransactionsSincePeriodStart.reduce((change, t) => {
        if (t.account?.name === account.name) {
          switch (t.type) {
            case 'income':
              return change - Number(t.amount);
            case 'expense':
              return change + Number(t.amount);
            case 'transfer':
              return change + Number(t.amount) + Number(t.transfer_fee || 0);
          }
        }
        if (t.transfer_to_account?.name === account.name) {
          return change - Number(t.amount);
        }
        return change;
      }, 0);

      const initialAccountBalance = Number(account.balance) + accountNetChange;
      return sum + initialAccountBalance;
    }, 0);
    
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
      const dateObj = new Date(dateStr);
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

    // Ajouter le point de fin de période si nécessaire
    const endDate = period.to;
    const lastDataDate = dailyData[dailyData.length - 1]?.dateObj;
    if (!lastDataDate || lastDataDate < endDate) {
      dailyData.push({
        date: format(endDate, "dd/MM", { locale: fr }),
        solde: runningBalance,
        soldeProjecte: runningBalance,
        dateObj: endDate
      });
    }

    // Ne faire de projection que si la période n'est pas terminée
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodEndDate = new Date(endDate);
    periodEndDate.setHours(0, 0, 0, 0);

    // Si la période est déjà terminée, pas de projection
    if (periodEndDate >= today) {
      // Projection uniquement jusqu'à la fin de la période sélectionnée
      const projectionStartDate = new Date(today);
      projectionStartDate.setDate(projectionStartDate.getDate() + 1);
      const projectionEndDate = new Date(endDate);

      let projectedBalance = runningBalance;
      let currentDate = new Date(projectionStartDate);

      if (useSpendingPatterns && filteredTransactions.length > 0) {
        // Projection basée sur les patterns de dépenses
        const daysInPeriod = differenceInDays(period.to, period.from) + 1;
        const dailyAvgIncome = stats.income / daysInPeriod;
        const dailyAvgExpenses = stats.expenses / daysInPeriod;
        const dailyNetAvg = dailyAvgIncome - dailyAvgExpenses;

        // Ajouter des points hebdomadaires pour la projection
        while (currentDate <= projectionEndDate) {
          projectedBalance += dailyNetAvg;

          // Ajouter un point chaque semaine ou à la fin du mois
          if (currentDate.getDate() % 7 === 0 || currentDate.getDate() === 1) {
            dailyData.push({
              date: format(currentDate, "dd/MM", { locale: fr }),
              solde: null,
              soldeProjecte: projectedBalance,
              dateObj: new Date(currentDate),
              isProjection: true
            });
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (recurringTransactions.length > 0) {
        // Projection basée sur les transactions récurrentes - respecter les dates exactes
        const activeRecurring = recurringTransactions
          .filter(rt => rt.is_active)
          .map(rt => ({ ...rt }));

        // Collecter toutes les occurrences futures des transactions récurrentes
        const futureTransactions: Array<{ date: Date; amount: number; type: string; description: string }> = [];
        
        activeRecurring.forEach(rt => {
          const [_ry, _rm, _rd] = rt.next_due_date.split('-').map(Number);
          let nextDue = new Date(_ry, _rm - 1, _rd);
          const maxIterations = 100; // Limite de sécurité
          let iterations = 0;

          while (nextDue <= projectionEndDate && iterations < maxIterations) {
            if (nextDue >= projectionStartDate) {
              futureTransactions.push({
                date: new Date(nextDue),
                amount: Number(rt.amount),
                type: rt.type,
                description: rt.description
              });
            }

            // Calculer la prochaine occurrence (safe date advancement)
            const cy = nextDue.getFullYear();
            const cm = nextDue.getMonth();
            const cd = nextDue.getDate();
            switch (rt.recurrence_type) {
              case 'weekly':
                nextDue = new Date(cy, cm, cd + 7);
                break;
              case 'monthly': {
                const next = new Date(cy, cm + 1, cd);
                nextDue = next.getMonth() !== (cm + 1) % 12
                  ? new Date(cy, cm + 2, 0)
                  : next;
                break;
              }
              case 'quarterly': {
                const nextQ = new Date(cy, cm + 3, cd);
                nextDue = nextQ.getMonth() !== (cm + 3) % 12
                  ? new Date(cy, cm + 4, 0)
                  : nextQ;
                break;
              }
              case 'yearly':
                nextDue = new Date(cy + 1, cm, cd);
                break;
            }
            iterations++;
          }
        });

        // Trier les transactions par date
        futureTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());

        // Ajouter des points de projection seulement aux dates des transactions
        let currentProjectedBalance = runningBalance;
        futureTransactions.forEach(ft => {
          // Appliquer l'impact de la transaction
          if (ft.type === 'income') {
            currentProjectedBalance += ft.amount;
          } else if (ft.type === 'expense') {
            currentProjectedBalance -= ft.amount;
          }

          // Ajouter un point au graphique
          dailyData.push({
            date: format(ft.date, "dd/MM", { locale: fr }),
            solde: null,
            soldeProjecte: currentProjectedBalance,
            dateObj: new Date(ft.date),
            isProjection: true
          });
        });
      }

      // S'assurer qu'il y a au moins quelques points de projection
      if (dailyData.filter(d => d.isProjection).length === 0 && dailyData.length < 5) {
        // Ajouter au moins 3 points de projection mensuels si pas assez de données
        for (let i = 1; i <= 3; i++) {
          const futureDate = new Date(endDate);
          futureDate.setMonth(futureDate.getMonth() + i);
          dailyData.push({
            date: format(futureDate, "dd/MM", { locale: fr }),
            solde: null,
            soldeProjecte: runningBalance,
            dateObj: futureDate,
            isProjection: true
          });
        }
      }
    }

    return dailyData;
  }, [filteredTransactions, stats, period, recurringTransactions, useSpendingPatterns]);

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
    const expensesByCategory = filteredTransactions
      .filter(t => t.type === 'expense' && t.include_in_stats !== false)
      .reduce((acc, t) => {
        const categoryId = t.category?.id || 'uncategorized';
        const categoryName = t.category?.name || 'Non catégorisé';
        const category = categories.find(c => c.id === categoryId);
        const categoryColor = t.category?.color || '#6b7280';
        
        // Calculer le montant net (après remboursement)
        const refundedAmount = t.refunded_amount || 0;
        const netAmount = Math.max(0, Number(t.amount) - refundedAmount);
        
        if (!acc[categoryId]) {
          acc[categoryId] = {
            name: categoryName,
            spent: 0,
            budget: Number(category?.budget || 0) * budgetMultiplier,
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
  const recurringData = useMemo<RecurringData>(() => {
    const activeRecurring = recurringTransactions.filter(rt => rt.is_active);

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

    // Count occurrences of a recurring transaction in the period
    const getOccurrencesInPeriod = (rt: RecurringTransaction): number => {
      const [sy, sm, sd] = rt.start_date.split('-').map(Number);
      let current = new Date(sy, sm - 1, sd);
      const endDate = rt.end_date ? new Date(rt.end_date) : null;
      let count = 0;
      const maxIterations = 500;
      let iterations = 0;

      while (current <= period.to && iterations < maxIterations) {
        if (endDate && current > endDate) break;
        if (current >= period.from && current <= period.to) {
          count++;
        }
        // Skip forward if still far before period start
        if (current < period.from) {
          current = advanceDate(current, rt.recurrence_type);
        } else {
          current = advanceDate(current, rt.recurrence_type);
        }
        iterations++;
      }

      return count;
    };

    // Monthly/yearly sums (kept for evolution tab projections)
    const monthlyIncome = activeRecurring
      .filter(rt => getEffectiveType(rt) === 'income')
      .reduce((sum, rt) => sum + toMonthly(Number(rt.amount), rt.recurrence_type), 0);

    const monthlyExpenses = activeRecurring
      .filter(rt => getEffectiveType(rt) === 'expense')
      .reduce((sum, rt) => sum + toMonthly(Number(rt.amount), rt.recurrence_type), 0);

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
      const monthlyAmount = toMonthly(Number(rt.amount), rt.recurrence_type);
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
      const occurrences = getOccurrencesInPeriod(rt);
      if (occurrences > 0) {
        const effectiveType = getEffectiveType(rt);
        periodItems.push({
          recurring: rt,
          occurrences,
          periodAmount: Number(rt.amount) * occurrences,
          effectiveType,
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
    };
  }, [recurringTransactions, period]);

  // Données spending patterns si activé
  const spendingPatternsData = useMemo<SpendingPatternsData | null>(() => {
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

  return {
    loading,
    period,
    filteredTransactions,
    stats,
    balanceEvolutionData,
    categoryChartData,
    recurringData,
    spendingPatternsData,
    incomeAnalysis,
    accounts
  };
};