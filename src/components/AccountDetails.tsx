import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Transaction } from "@/hooks/useFinancialData";
import { TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { format, startOfMonth, isWithinInterval, differenceInDays, startOfWeek, eachDayOfInterval, eachWeekOfInterval, isSameDay, isSameWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { AccountTransactionsList } from "./AccountTransactionsList";

interface AccountDetailsProps {
  accountId: string;
  transactions: Transaction[];
  balance: number;
  startDate: Date;
  endDate: Date;
  periodLabel: string;
}

export function AccountDetails({ accountId, transactions, balance, startDate, endDate, periodLabel }: AccountDetailsProps) {
  const { formatCurrency } = useUserPreferences();

  // Filter transactions by account AND by date range
  const accountTransactions = useMemo(() => {
    return transactions
      .filter(t => {
        const isAccountMatch = t.account_id === accountId || t.transfer_to_account_id === accountId;
        const transactionDate = new Date(t.transaction_date);
        const isInPeriod = isWithinInterval(transactionDate, { start: startDate, end: endDate });
        return isAccountMatch && isInPeriod;
      })
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  }, [transactions, accountId, startDate, endDate]);

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
        const transactionDate = new Date(t.transaction_date);
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
        const transactionDate = new Date(t.transaction_date);
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
      const transactionDate = new Date(t.transaction_date);
      const transactionMonth = startOfMonth(transactionDate);
      
      const monthIndex = months.findIndex(m => 
        m.fullDate.getTime() === transactionMonth.getTime()
      );
      addTransactionToData(months, monthIndex, t);
    });

    return { data: months, type: 'month' as const };
  }, [accountTransactions, accountId, startDate, endDate]);

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
        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">Revenus</p>
                <p className="text-sm sm:text-2xl font-bold text-success truncate">{formatCurrency(stats.income)}</p>
              </div>
              <div className="h-8 w-8 sm:h-12 sm:w-12 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0 hidden sm:flex">
                <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">Dépenses</p>
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
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <ResponsiveContainer width="100%" height={200} className="sm:hidden">
            <BarChart data={periodChartData.data}>
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
              <Bar dataKey="income" fill="hsl(var(--success))" name="Revenus" radius={[2, 2, 0, 0]} />
              <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Dépenses" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={300} className="hidden sm:block">
            <BarChart data={periodChartData.data}>
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
              <Bar dataKey="income" fill="hsl(var(--success))" name="Revenus" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Dépenses" radius={[4, 4, 0, 0]} />
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
    </div>
  );
}
