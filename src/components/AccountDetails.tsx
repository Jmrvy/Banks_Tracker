import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Transaction } from "@/hooks/useFinancialData";
import { TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { format, startOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { AccountTransactionsList } from "./AccountTransactionsList";

interface AccountDetailsProps {
  accountId: string;
  transactions: Transaction[];
  balance: number;
}

export function AccountDetails({ accountId, transactions, balance }: AccountDetailsProps) {
  const { formatCurrency } = useUserPreferences();

  const accountTransactions = useMemo(() => {
    return transactions
      .filter(t => t.account_id === accountId || t.transfer_to_account_id === accountId)
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  }, [transactions, accountId]);

  const stats = useMemo(() => {
    const income = accountTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expenses = accountTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const transfers = accountTransactions
      .filter(t => t.type === 'transfer')
      .length;

    return { income, expenses, transfers };
  }, [accountTransactions]);

  const monthlyData = useMemo(() => {
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const date = subMonths(startOfMonth(new Date()), i);
      return {
        month: format(date, 'MMM', { locale: fr }),
        income: 0,
        expenses: 0,
      };
    }).reverse();

    accountTransactions.forEach(t => {
      const transactionDate = new Date(t.transaction_date);
      const monthIndex = last6Months.findIndex(m => {
        const monthDate = subMonths(startOfMonth(new Date()), 5 - last6Months.indexOf(m));
        return transactionDate >= monthDate && transactionDate < startOfMonth(subMonths(monthDate, -1));
      });

      if (monthIndex !== -1) {
        if (t.type === 'income') {
          last6Months[monthIndex].income += t.amount;
        } else if (t.type === 'expense') {
          last6Months[monthIndex].expenses += t.amount;
        }
      }
    });

    return last6Months;
  }, [accountTransactions]);

  const balanceEvolution = useMemo(() => {
    const sortedTransactions = [...accountTransactions].sort(
      (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    );

    if (sortedTransactions.length === 0) {
      return [{
        date: format(new Date(), 'dd/MM', { locale: fr }),
        balance: balance,
      }];
    }

    let runningBalance = balance;
    
    // Calculate initial balance by reversing all transactions from current balance
    sortedTransactions.forEach(t => {
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

    // Take only last 10 transactions for the chart
    const last10 = sortedTransactions.slice(-10);
    
    // Build evolution from the point where we have 10 transactions
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
  }, [accountTransactions, balance, accountId]);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Revenus</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(stats.income)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Dépenses</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(stats.expenses)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Virements</p>
                <p className="text-2xl font-bold">{stats.transfers}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ArrowRightLeft className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Balance Evolution Chart */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Évolution du solde (10 dernières transactions)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
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

      {/* Monthly Income vs Expenses */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Revenus vs Dépenses (6 derniers mois)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
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
              <Bar dataKey="income" fill="hsl(var(--success))" name="Revenus" radius={[8, 8, 0, 0]} />
              <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Dépenses" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Account Transactions List with Balance */}
      <AccountTransactionsList 
        accountId={accountId}
        transactions={transactions}
        initialBalance={balance}
      />
    </div>
  );
}
