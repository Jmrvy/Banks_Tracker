import { useMemo } from "react";
import { useFinancialData } from "@/hooks/useFinancialData";
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

export interface RecurringData {
  activeRecurring: any[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyNet: number;
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
  useSpendingPatterns: boolean
) => {
  const { transactions, categories, accounts, recurringTransactions, loading } = useFinancialData();

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
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.transaction_date);
      return isWithinInterval(transactionDate, { start: period.from, end: period.to });
    });
  }, [transactions, period]);

  // Calculs des statistiques avec soldes initiaux
  const stats = useMemo<ReportsStats>(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const transferFees = filteredTransactions
      .filter(t => t.type === 'transfer')
      .reduce((sum, t) => sum + Number(t.transfer_fee || 0), 0);

    const netPeriodBalance = income - expenses - transferFees;

    // Calcul du solde initial basé sur les comptes actuels moins les transactions de la période
    const initialBalance = accounts.reduce((sum, account) => {
      const accountTransactionsSincePeriodStart = transactions.filter(t => {
        const transactionDate = new Date(t.transaction_date);
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
  const balanceEvolutionData = useMemo<BalanceDataPoint[]>(() => {
    const sortedTransactions = filteredTransactions
      .sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
    
    const dailyData: BalanceDataPoint[] = [];
    let runningBalance = stats.initialBalance;
    
    // Commencer par le solde initial
    dailyData.push({
      date: format(period.from, "dd/MM", { locale: fr }),
      solde: runningBalance,
      soldeProjecte: runningBalance,
      dateObj: period.from
    });

    // Grouper les transactions par date
    const transactionsByDate = new Map();
    sortedTransactions.forEach(t => {
      const date = format(new Date(t.transaction_date), "yyyy-MM-dd");
      if (!transactionsByDate.has(date)) {
        transactionsByDate.set(date, []);
      }
      transactionsByDate.get(date).push(t);
    });

    // Créer les points de données pour chaque jour avec transactions
    transactionsByDate.forEach((dayTransactions, dateStr) => {
      const dateObj = new Date(dateStr);
      const dayBalance = dayTransactions.reduce((sum, t) => {
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

    // Projection sur 3 mois
    if (dailyData.length > 0) {
      const lastDate = dailyData[dailyData.length - 1].dateObj;
      const projectionEndDate = new Date(lastDate);
      projectionEndDate.setMonth(projectionEndDate.getMonth() + 3);

      let projectedBalance = runningBalance;
      let currentDate = new Date(lastDate);
      currentDate.setDate(currentDate.getDate() + 1);

      if (useSpendingPatterns) {
        // Projection basée sur les patterns de dépenses
        const daysInPeriod = differenceInDays(period.to, period.from) + 1;
        const dailyAvgIncome = stats.income / daysInPeriod;
        const dailyAvgExpenses = stats.expenses / daysInPeriod;
        const dailyNetAvg = dailyAvgIncome - dailyAvgExpenses;

        while (currentDate <= projectionEndDate) {
          projectedBalance += dailyNetAvg;

          if (currentDate.getDate() % 7 === 0) {
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
      } else {
        // Projection basée sur les transactions récurrentes
        const activeRecurring = [...recurringTransactions.filter(rt => rt.is_active)];

        while (currentDate <= projectionEndDate) {
          const dailyRecurringImpact = activeRecurring.reduce((impact, rt) => {
            const nextDueDate = new Date(rt.next_due_date);
            
            if (currentDate.toDateString() === nextDueDate.toDateString()) {
              if (rt.type === 'income') {
                impact += Number(rt.amount);
              } else if (rt.type === 'expense') {
                impact -= Number(rt.amount);
              }

              // Calculer la prochaine échéance
              const newNextDue = new Date(nextDueDate);
              switch (rt.recurrence_type) {
                case 'weekly':
                  newNextDue.setDate(newNextDue.getDate() + 7);
                  break;
                case 'monthly':
                  newNextDue.setMonth(newNextDue.getMonth() + 1);
                  break;
                case 'yearly':
                  newNextDue.setFullYear(newNextDue.getFullYear() + 1);
                  break;
              }
              rt.next_due_date = newNextDue.toISOString().split('T')[0];
            }
            return impact;
          }, 0);

          projectedBalance += dailyRecurringImpact;

          if (currentDate.getDate() % 7 === 0 || dailyRecurringImpact !== 0) {
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
      }
    }

    return dailyData;
  }, [filteredTransactions, stats, period, recurringTransactions, useSpendingPatterns]);

  // Données pour les catégories avec budgets
  const categoryChartData = useMemo<CategoryData[]>(() => {
    const expensesByCategory = filteredTransactions
      .filter(t => t.type === 'expense' && t.category)
      .reduce((acc, t) => {
        const categoryId = t.category?.id;
        const categoryName = t.category?.name || 'Non catégorisé';
        const category = categories.find(c => c.id === categoryId);
        if (!acc[categoryId]) {
          acc[categoryId] = {
            name: categoryName,
            spent: 0,
            budget: Number(category?.budget || 0),
            color: t.category?.color || '#6b7280'
          };
        }
        acc[categoryId].spent += Number(t.amount);
        return acc;
      }, {} as Record<string, any>);

    return Object.entries(expensesByCategory)
      .map(([_, data]) => ({
        ...data,
        percentage: data.budget > 0 ? (data.spent / data.budget * 100).toFixed(1) : "0",
        remaining: Math.max(0, data.budget - data.spent)
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [filteredTransactions, categories]);

  // Données pour les transactions récurrentes
  const recurringData = useMemo<RecurringData>(() => {
    const activeRecurring = recurringTransactions.filter(rt => rt.is_active);
    
    const monthlyIncome = activeRecurring
      .filter(rt => rt.type === 'income')
      .reduce((sum, rt) => {
        const amount = Number(rt.amount);
        switch (rt.recurrence_type) {
          case 'weekly': return sum + (amount * 52 / 12);
          case 'monthly': return sum + amount;
          case 'yearly': return sum + (amount / 12);
          default: return sum;
        }
      }, 0);

    const monthlyExpenses = activeRecurring
      .filter(rt => rt.type === 'expense')
      .reduce((sum, rt) => {
        const amount = Number(rt.amount);
        switch (rt.recurrence_type) {
          case 'weekly': return sum + (amount * 52 / 12);
          case 'monthly': return sum + amount;
          case 'yearly': return sum + (amount / 12);
          default: return sum;
        }
      }, 0);

    return {
      activeRecurring,
      monthlyIncome,
      monthlyExpenses,
      monthlyNet: monthlyIncome - monthlyExpenses
    };
  }, [recurringTransactions]);

  // Données spending patterns si activé
  const spendingPatternsData = useMemo<SpendingPatternsData | null>(() => {
    if (!useSpendingPatterns || filteredTransactions.length === 0) return null;

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

  return {
    loading,
    period,
    filteredTransactions,
    stats,
    balanceEvolutionData,
    categoryChartData,
    recurringData,
    spendingPatternsData,
    accounts
  };
};