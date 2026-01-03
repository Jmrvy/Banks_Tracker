import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const AggregatedBalanceEvolution = () => {
  const { accounts, transactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  // Calculate total balance across all accounts
  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + acc.balance, 0);
  }, [accounts]);

  // Get all transactions sorted by date
  const allTransactionsSorted = useMemo(() => {
    return [...transactions].sort(
      (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    );
  }, [transactions]);

  // Calculate balance evolution across all accounts based on last 10 transactions
  const balanceEvolution = useMemo(() => {
    if (allTransactionsSorted.length === 0) {
      return [{
        date: format(new Date(), 'dd/MM', { locale: fr }),
        balance: totalBalance,
      }];
    }

    // Take only last 10 transactions for the chart
    const last10 = allTransactionsSorted.slice(-10);
    
    let runningBalance = totalBalance;
    
    // Calculate balance BEFORE the first of the last 10 transactions
    // by reversing only those 10 transactions from current balance
    [...last10].reverse().forEach(t => {
      if (t.type === 'income') {
        runningBalance -= t.amount;
      } else if (t.type === 'expense') {
        runningBalance += t.amount;
      }
      // Transfers don't affect total balance across all accounts (internal movement)
      // but we need to account for transfer fees
      if (t.type === 'transfer' && t.transfer_fee) {
        runningBalance += t.transfer_fee;
      }
    });

    const evolution = [];

    // Now FORWARD through the last 10 transactions from the starting balance
    last10.forEach((t) => {
      if (t.type === 'income') {
        runningBalance += t.amount;
      } else if (t.type === 'expense') {
        runningBalance -= t.amount;
      }
      // Transfers don't affect total balance but fees do
      if (t.type === 'transfer' && t.transfer_fee) {
        runningBalance -= t.transfer_fee;
      }

      evolution.push({
        date: format(new Date(t.transaction_date), 'dd/MM', { locale: fr }),
        balance: runningBalance,
      });
    });

    return evolution;
  }, [allTransactionsSorted, totalBalance]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-sm sm:text-base">Évolution du solde global</CardTitle>
      </CardHeader>
      <CardContent className={`p-3 sm:p-6 pt-0 ${isPrivacyMode ? 'blur-md select-none' : ''}`}>
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
              formatter={(value: number) => [formatCurrency(value), 'Solde']}
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
              tickFormatter={(value) => formatCurrency(value)}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [formatCurrency(value), 'Solde']}
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
  );
};
