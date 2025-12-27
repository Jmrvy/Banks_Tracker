import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { eachDayOfInterval, format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";

interface CashflowChartProps {
  startDate: Date;
  endDate: Date;
}

export function CashflowChart({ startDate, endDate }: CashflowChartProps) {
  const { transactions, accounts } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  const chartData = useMemo(() => {
    const monthStart = startDate;
    const monthEnd = endDate;
    
    // Get all days in the current month
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Calculate initial balance (sum of all account balances minus current month's net change)
    const currentMonthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= monthStart && date <= monthEnd;
    });
    
    const currentMonthNet = currentMonthTransactions.reduce((sum, t) => {
      if (t.type === 'income') return sum + t.amount;
      if (t.type === 'expense') return sum - t.amount;
      return sum;
    }, 0);
    
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const initialBalance = totalBalance - currentMonthNet;
    
    // Build cumulative data for each day
    let runningBalance = initialBalance;
    const data = days.map(day => {
      // Get transactions for this day
      const dayTransactions = transactions.filter(t => 
        isSameDay(new Date(t.transaction_date), day)
      );
      
      // Calculate day's net change
      const dayNet = dayTransactions.reduce((sum, t) => {
        if (t.type === 'income') return sum + t.amount;
        if (t.type === 'expense') return sum - t.amount;
        return sum;
      }, 0);
      
      runningBalance += dayNet;
      
      return {
        date: format(day, 'd MMM', { locale: fr }),
        balance: runningBalance,
        income: dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
        expense: dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      };
    });
    
    return data;
  }, [transactions, accounts, startDate, endDate]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium mb-2">{payload[0].payload.date}</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Balance:</span>
              <span className="font-semibold">{formatCurrency(payload[0].value)}</span>
            </div>
            {payload[0].payload.income > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-success">Income:</span>
                <span className="font-semibold text-success">+{formatCurrency(payload[0].payload.income)}</span>
              </div>
            )}
            {payload[0].payload.expense > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-destructive">Expense:</span>
                <span className="font-semibold text-destructive">-{formatCurrency(payload[0].payload.expense)}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold">Cashflow</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">Évolution de votre solde</p>
        </div>
        
        <div className={isPrivacyMode ? "blur-md select-none" : ""}>
          <ResponsiveContainer width="100%" height={200} className="sm:hidden">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorBalanceMobile" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="date" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={9}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={9}
                tickLine={false}
                tickFormatter={(value) => `${(value/1000).toFixed(0)}k`}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="balance" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fill="url(#colorBalanceMobile)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div className={isPrivacyMode ? "blur-md select-none" : ""}>
          <ResponsiveContainer width="100%" height={300} className="hidden sm:block">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="date" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                tickFormatter={(value) => `${value}€`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="balance" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fill="url(#colorBalance)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
