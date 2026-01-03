import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Transaction } from "@/hooks/useFinancialData";
import { TrendingUp, TrendingDown, ArrowRightLeft, X, Info, CalendarClock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { format, startOfMonth, endOfMonth, isWithinInterval, differenceInDays, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval, isSameDay, isSameWeek, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { AccountTransactionsList } from "./AccountTransactionsList";
import { Button } from "./ui/button";
import { ValueDateDifferenceModal } from "./ValueDateDifferenceModal";
import { TransactionTypeModal } from "./TransactionTypeModal";

interface AccountDetailsProps {
  accountId: string;
  transactions: Transaction[];
  balance: number;
  startDate: Date;
  endDate: Date;
  periodLabel: string;
}

export function AccountDetails({ accountId, transactions, balance, startDate, endDate, periodLabel }: AccountDetailsProps) {
  const { formatCurrency, preferences } = useUserPreferences();
  const [selectedPeriod, setSelectedPeriod] = useState<{ date: Date; type: 'day' | 'week' | 'month'; label: string } | null>(null);
  const [showDateDifferenceModal, setShowDateDifferenceModal] = useState(false);
  const [showTransactionTypeModal, setShowTransactionTypeModal] = useState<'income' | 'expense' | null>(null);

  const activeDateType = preferences.dateType;

  // Filter transactions by account only (for date difference detection)
  const allAccountTransactionsUnfiltered = useMemo(() => {
    return transactions.filter(t => t.account_id === accountId || t.transfer_to_account_id === accountId);
  }, [transactions, accountId]);

  // Check if there are date differences for this account
  const hasDateDifference = useMemo(() => {
    if (activeDateType !== "value") return false;

    return allAccountTransactionsUnfiltered.some((t) => {
      const transactionDate = new Date(t.transaction_date);
      const valueDate = new Date(t.value_date || t.transaction_date);

      const inPeriodByTransactionDate = transactionDate >= startDate && transactionDate <= endDate;
      const inPeriodByValueDate = valueDate >= startDate && valueDate <= endDate;

      return inPeriodByTransactionDate !== inPeriodByValueDate;
    });
  }, [allAccountTransactionsUnfiltered, startDate, endDate, activeDateType]);

  // Filter transactions by account AND by date range (respecting date preference)
  const accountTransactions = useMemo(() => {
    return transactions
      .filter(t => {
        const isAccountMatch = t.account_id === accountId || t.transfer_to_account_id === accountId;
        const dateToUse = activeDateType === 'value'
          ? new Date(t.value_date || t.transaction_date)
          : new Date(t.transaction_date);
        const isInPeriod = isWithinInterval(dateToUse, { start: startDate, end: endDate });
        return isAccountMatch && isInPeriod;
      })
      .sort((a, b) => {
        const dateA = activeDateType === 'value' ? new Date(a.value_date || a.transaction_date) : new Date(a.transaction_date);
        const dateB = activeDateType === 'value' ? new Date(b.value_date || b.transaction_date) : new Date(b.transaction_date);
        return dateB.getTime() - dateA.getTime();
      });
  }, [transactions, accountId, startDate, endDate, activeDateType]);

  // All account transactions (not filtered by period) for balance calculations
  const allAccountTransactions = useMemo(() => {
    return transactions
      .filter(t => t.account_id === accountId || t.transfer_to_account_id === accountId)
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  }, [transactions, accountId]);

  const stats = useMemo(() => {
    // Income = regular income + incoming transfers (only if include_in_stats)
    const income = accountTransactions
      .filter(t => t.include_in_stats && (
        t.type === 'income' || 
        (t.type === 'transfer' && t.transfer_to_account_id === accountId)
      ))
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Expenses = regular expenses + outgoing transfers (only if include_in_stats)
    const expenses = accountTransactions
      .filter(t => t.include_in_stats && (
        t.type === 'expense' || 
        (t.type === 'transfer' && t.account_id === accountId)
      ))
      .reduce((sum, t) => {
        if (t.type === 'transfer') {
          return sum + t.amount + (t.transfer_fee || 0);
        }
        return sum + t.amount;
      }, 0);
    
    const transfers = accountTransactions
      .filter(t => t.type === 'transfer')
      .length;

    return { income, expenses, transfers };
  }, [accountTransactions, accountId]);

  // Get transactions filtered by type for the modal (same format as Dashboard - only income/expense, no transfers)
  const incomeTransactions = useMemo(() => {
    return accountTransactions.filter(t => 
      t.include_in_stats && t.type === 'income'
    );
  }, [accountTransactions]);

  const expenseTransactions = useMemo(() => {
    return accountTransactions.filter(t => 
      t.include_in_stats && t.type === 'expense'
    );
  }, [accountTransactions]);

  // Determine chart grouping based on period length
  const periodChartData = useMemo(() => {
    const daysDiff = differenceInDays(endDate, startDate);
    
    // Helper function to add transaction to chart data
    const addTransactionToData = (data: { income: number; expenses: number }[], index: number, t: Transaction) => {
      if (!t.include_in_stats || index === -1) return;
      
      // Income = regular income + incoming transfers
      if (t.type === 'income' || (t.type === 'transfer' && t.transfer_to_account_id === accountId)) {
        data[index].income += t.amount;
      }
      // Expenses = regular expenses + outgoing transfers
      if (t.type === 'expense' || (t.type === 'transfer' && t.account_id === accountId)) {
        if (t.type === 'transfer') {
          data[index].expenses += t.amount + (t.transfer_fee || 0);
        } else {
          data[index].expenses += t.amount;
        }
      }
    };
    
    // Single month or less: group by day
    if (daysDiff <= 31) {
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      const data = days.map(day => ({
        label: format(day, 'dd', { locale: fr }),
        fullDate: day,
        income: 0,
        expenses: 0,
      }));

      accountTransactions.forEach(t => {
        const transactionDate = activeDateType === 'value'
          ? new Date(t.value_date || t.transaction_date)
          : new Date(t.transaction_date);
        const dayIndex = data.findIndex(d => isSameDay(d.fullDate, transactionDate));
        addTransactionToData(data, dayIndex, t);
      });

      return { data, type: 'day' as const };
    }
    
    // 2-3 months: group by week
    if (daysDiff <= 93) {
      const weeks = eachWeekOfInterval({ start: startDate, end: endDate }, { locale: fr });
      const data = weeks.map((week, index) => ({
        label: `S${index + 1}`,
        fullDate: week,
        income: 0,
        expenses: 0,
      }));

      accountTransactions.forEach(t => {
        const transactionDate = activeDateType === 'value'
          ? new Date(t.value_date || t.transaction_date)
          : new Date(t.transaction_date);
        const weekIndex = data.findIndex(w => 
          isSameWeek(w.fullDate, transactionDate, { locale: fr })
        );
        addTransactionToData(data, weekIndex, t);
      });

      return { data, type: 'week' as const };
    }
    
    // Longer periods: group by month
    const startMonth = startOfMonth(startDate);
    const endMonth = startOfMonth(endDate);
    
    const months: { label: string; fullDate: Date; income: number; expenses: number }[] = [];
    let currentMonth = startMonth;
    
    while (currentMonth <= endMonth) {
      months.push({
        label: format(currentMonth, 'MMM', { locale: fr }),
        fullDate: currentMonth,
        income: 0,
        expenses: 0,
      });
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    }

    accountTransactions.forEach(t => {
      const transactionDate = activeDateType === 'value'
        ? new Date(t.value_date || t.transaction_date)
        : new Date(t.transaction_date);
      const transactionMonth = startOfMonth(transactionDate);
      
      const monthIndex = months.findIndex(m => 
        m.fullDate.getTime() === transactionMonth.getTime()
      );
      addTransactionToData(months, monthIndex, t);
    });

    return { data: months, type: 'month' as const };
  }, [accountTransactions, accountId, startDate, endDate, activeDateType]);

  // Get transactions for selected period in the chart
  const selectedPeriodTransactions = useMemo(() => {
    if (!selectedPeriod) return { income: [], expenses: [], totalIncome: 0, totalExpenses: 0 };
    
    let periodStart: Date;
    let periodEnd: Date;
    
    if (selectedPeriod.type === 'day') {
      periodStart = selectedPeriod.date;
      periodEnd = addDays(selectedPeriod.date, 1);
    } else if (selectedPeriod.type === 'week') {
      periodStart = startOfWeek(selectedPeriod.date, { locale: fr });
      periodEnd = endOfWeek(selectedPeriod.date, { locale: fr });
    } else {
      periodStart = startOfMonth(selectedPeriod.date);
      periodEnd = endOfMonth(selectedPeriod.date);
    }
    
    const incomeTransactions = accountTransactions.filter(t => {
      const transactionDate = activeDateType === 'value'
        ? new Date(t.value_date || t.transaction_date)
        : new Date(t.transaction_date);
      const isInPeriod = transactionDate >= periodStart && transactionDate <= periodEnd;
      const isIncome = t.type === 'income' || (t.type === 'transfer' && t.transfer_to_account_id === accountId);
      return isInPeriod && isIncome && t.include_in_stats;
    });
    
    const expenseTransactions = accountTransactions.filter(t => {
      const transactionDate = activeDateType === 'value'
        ? new Date(t.value_date || t.transaction_date)
        : new Date(t.transaction_date);
      const isInPeriod = transactionDate >= periodStart && transactionDate <= periodEnd;
      const isExpense = t.type === 'expense' || (t.type === 'transfer' && t.account_id === accountId);
      return isInPeriod && isExpense && t.include_in_stats;
    });
    
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenseTransactions.reduce((sum, t) => {
      if (t.type === 'transfer') {
        return sum + t.amount + (t.transfer_fee || 0);
      }
      return sum + t.amount;
    }, 0);
    
    return { income: incomeTransactions, expenses: expenseTransactions, totalIncome, totalExpenses };
  }, [selectedPeriod, accountTransactions, accountId, activeDateType]);

  // Handle bar click
  const handleBarClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const payload = data.activePayload[0].payload;
      setSelectedPeriod({
        date: payload.fullDate,
        type: periodChartData.type,
        label: periodChartData.type === 'day' 
          ? format(payload.fullDate, 'EEEE d MMMM yyyy', { locale: fr })
          : periodChartData.type === 'week'
          ? `Semaine du ${format(startOfWeek(payload.fullDate, { locale: fr }), 'd MMMM', { locale: fr })}`
          : format(payload.fullDate, 'MMMM yyyy', { locale: fr })
      });
    }
  };

  const balanceEvolution = useMemo(() => {
    const sortedTransactions = [...allAccountTransactions].sort(
      (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    );

    if (sortedTransactions.length === 0) {
      return [{
        date: format(new Date(), 'dd/MM', { locale: fr }),
        balance: balance,
      }];
    }

    // Take only last 10 transactions for the chart
    const last10 = sortedTransactions.slice(-10);
    
    let runningBalance = balance;
    
    // Calculate balance BEFORE the first of the last 10 transactions
    // by reversing only those 10 transactions from current balance
    [...last10].reverse().forEach(t => {
      if (t.account_id === accountId) {
        if (t.type === 'income') {
          runningBalance -= t.amount;
        } else if (t.type === 'expense') {
          runningBalance += t.amount;
        } else if (t.type === 'transfer') {
          runningBalance += t.amount + (t.transfer_fee || 0);
        }
      } else if (t.transfer_to_account_id === accountId) {
        runningBalance -= t.amount;
      }
    });

    const evolution = [];

    // Now FORWARD through the last 10 transactions from the starting balance
    last10.forEach((t) => {
      if (t.account_id === accountId) {
        if (t.type === 'income') {
          runningBalance += t.amount;
        } else if (t.type === 'expense') {
          runningBalance -= t.amount;
        } else if (t.type === 'transfer') {
          runningBalance -= t.amount + (t.transfer_fee || 0);
        }
      } else if (t.transfer_to_account_id === accountId) {
        runningBalance += t.amount;
      }

      evolution.push({
        date: format(new Date(t.transaction_date), 'dd/MM', { locale: fr }),
        balance: runningBalance,
      });
    });

    return evolution;
  }, [allAccountTransactions, balance, accountId]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Period indicator */}
      <div className="text-sm text-muted-foreground">
        Période: <span className="font-medium text-foreground">{periodLabel}</span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card 
          className="border-border bg-card cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => setShowTransactionTypeModal('income')}
        >
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
                  <p className="text-[10px] sm:text-sm text-muted-foreground">Revenus</p>
                  {hasDateDifference && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDateDifferenceModal(true);
                      }}
                      className="p-0.5 rounded hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                      aria-label="Voir les écarts entre date comptable et date valeur"
                    >
                      <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <p className="text-sm sm:text-2xl font-bold text-success truncate">{formatCurrency(stats.income)}</p>
              </div>
              <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0 hidden sm:flex">
                <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="border-border bg-card cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => setShowTransactionTypeModal('expense')}
        >
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
                  <p className="text-[10px] sm:text-sm text-muted-foreground">Dépenses</p>
                  {hasDateDifference && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDateDifferenceModal(true);
                      }}
                      className="p-0.5 rounded hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                      aria-label="Voir les écarts entre date comptable et date valeur"
                    >
                      <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <p className="text-sm sm:text-2xl font-bold text-destructive truncate">{formatCurrency(stats.expenses)}</p>
              </div>
              <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0 hidden sm:flex">
                <TrendingDown className="h-4 w-4 sm:h-6 sm:w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">Virements</p>
                <p className="text-sm sm:text-2xl font-bold">{stats.transfers}</p>
              </div>
              <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 hidden sm:flex">
                <ArrowRightLeft className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Type Modal */}
      <TransactionTypeModal
        open={showTransactionTypeModal !== null}
        onOpenChange={(open) => !open && setShowTransactionTypeModal(null)}
        transactions={showTransactionTypeModal === 'income' ? incomeTransactions : expenseTransactions}
        type={showTransactionTypeModal || 'income'}
        period={periodLabel}
      />

      {/* Value Date Difference Modal */}
      <ValueDateDifferenceModal
        open={showDateDifferenceModal}
        onOpenChange={setShowDateDifferenceModal}
        transactions={allAccountTransactionsUnfiltered}
        period={{ from: startDate, to: endDate }}
      />

      {/* Balance Evolution Chart */}
      <Card className="border-border bg-card">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Évolution du solde</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <ResponsiveContainer width="100%" height={200} className="sm:hidden">
            <LineChart data={balanceEvolution}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickFormatter={(value) => `${value.toFixed(0)}`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Line 
                type="monotone" 
                dataKey="balance" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={300} className="hidden sm:block">
            <LineChart data={balanceEvolution}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `${value.toFixed(0)}€`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Line 
                type="monotone" 
                dataKey="balance" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Income vs Expenses Chart */}
      <Card className="border-border bg-card">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">
            Revenus vs Dépenses
            <span className="text-xs font-normal text-muted-foreground ml-2">
              ({periodChartData.type === 'day' ? 'par jour' : periodChartData.type === 'week' ? 'par semaine' : 'par mois'})
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Cliquez sur une barre pour voir les détails</p>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <ResponsiveContainer width="100%" height={200} className="sm:hidden">
            <BarChart data={periodChartData.data} onClick={handleBarClick}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="label" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 8 }}
                interval={periodChartData.type === 'day' ? 4 : 0}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickFormatter={(value) => `${value.toFixed(0)}`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Bar dataKey="income" fill="hsl(var(--success))" name="Revenus" radius={[2, 2, 0, 0]} cursor="pointer" />
              <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Dépenses" radius={[2, 2, 0, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={300} className="hidden sm:block">
            <BarChart data={periodChartData.data} onClick={handleBarClick}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="label" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                interval={periodChartData.type === 'day' ? 2 : 0}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `${value.toFixed(0)}€`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Bar dataKey="income" fill="hsl(var(--success))" name="Revenus" radius={[4, 4, 0, 0]} cursor="pointer" />
              <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Dépenses" radius={[4, 4, 0, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Account Transactions List with Balance */}
      <AccountTransactionsList 
        accountId={accountId}
        transactions={transactions}
        initialBalance={balance}
        startDate={startDate}
        endDate={endDate}
      />

      {/* Period Detail Sheet */}
      <Sheet open={!!selectedPeriod} onOpenChange={(open) => !open && setSelectedPeriod(null)}>
        <SheetContent side="bottom" className="h-[85vh] sm:h-[70vh] rounded-t-xl">
          <SheetHeader className="pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="capitalize text-base sm:text-lg">
                {selectedPeriod?.label}
              </SheetTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedPeriod(null)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
          
          <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-100px)] sm:max-h-[calc(70vh-100px)]">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                <p className="text-xs text-muted-foreground mb-1">Revenus</p>
                <p className="text-lg font-bold text-success">{formatCurrency(selectedPeriodTransactions.totalIncome)}</p>
                <p className="text-xs text-muted-foreground">{selectedPeriodTransactions.income.length} transaction(s)</p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-muted-foreground mb-1">Dépenses</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(selectedPeriodTransactions.totalExpenses)}</p>
                <p className="text-xs text-muted-foreground">{selectedPeriodTransactions.expenses.length} transaction(s)</p>
              </div>
            </div>

            {/* Income Transactions */}
            {selectedPeriodTransactions.income.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  Revenus
                </h4>
                <div className="space-y-2">
                  {selectedPeriodTransactions.income.map(t => {
                    const hasDiff = t.value_date && new Date(t.transaction_date).toDateString() !== new Date(t.value_date).toDateString();
                    const displayDate = activeDateType === 'value' && t.value_date 
                      ? new Date(t.value_date) 
                      : new Date(t.transaction_date);
                    
                    return (
                      <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border border-border bg-card">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{t.description}</p>
                          <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
                            {hasDiff ? (
                              <>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[10px] sm:text-xs">
                                  <CalendarClock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                  {format(displayDate, 'dd/MM/yyyy', { locale: fr })}
                                </span>
                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                  <span className="hidden sm:inline">Comptable:</span>
                                  <span className="sm:hidden">C:</span>
                                  {format(new Date(t.transaction_date), 'dd/MM', { locale: fr })}
                                </span>
                              </>
                            ) : (
                              <span>{format(displayDate, 'dd/MM/yyyy', { locale: fr })}</span>
                            )}
                            {t.category && (
                              <>
                                <span>•</span>
                                <Badge variant="outline" className="text-[10px] sm:text-xs gap-1">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.category.color }} />
                                  {t.category.name}
                                </Badge>
                              </>
                            )}
                            {t.type === 'transfer' && (
                              <>
                                <span>•</span>
                                <Badge variant="outline" className="text-[10px] sm:text-xs">Virement entrant</Badge>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-bold text-success ml-2">+{formatCurrency(t.amount)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Expense Transactions */}
            {selectedPeriodTransactions.expenses.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  Dépenses
                </h4>
                <div className="space-y-2">
                  {selectedPeriodTransactions.expenses.map(t => {
                    const hasDiff = t.value_date && new Date(t.transaction_date).toDateString() !== new Date(t.value_date).toDateString();
                    const displayDate = activeDateType === 'value' && t.value_date 
                      ? new Date(t.value_date) 
                      : new Date(t.transaction_date);
                    
                    return (
                      <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border border-border bg-card">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{t.description}</p>
                          <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
                            {hasDiff ? (
                              <>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[10px] sm:text-xs">
                                  <CalendarClock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                  {format(displayDate, 'dd/MM/yyyy', { locale: fr })}
                                </span>
                                <span className="text-[10px] sm:text-xs text-muted-foreground">
                                  <span className="hidden sm:inline">Comptable:</span>
                                  <span className="sm:hidden">C:</span>
                                  {format(new Date(t.transaction_date), 'dd/MM', { locale: fr })}
                                </span>
                              </>
                            ) : (
                              <span>{format(displayDate, 'dd/MM/yyyy', { locale: fr })}</span>
                            )}
                            {t.category && (
                              <>
                                <span>•</span>
                                <Badge variant="outline" className="text-[10px] sm:text-xs gap-1">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.category.color }} />
                                  {t.category.name}
                                </Badge>
                              </>
                            )}
                            {t.type === 'transfer' && (
                              <>
                                <span>•</span>
                                <Badge variant="outline" className="text-[10px] sm:text-xs">Virement sortant</Badge>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-bold text-destructive ml-2">
                          -{formatCurrency(t.amount + (t.type === 'transfer' ? (t.transfer_fee || 0) : 0))}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedPeriodTransactions.income.length === 0 && selectedPeriodTransactions.expenses.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Aucune transaction pour cette période
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
