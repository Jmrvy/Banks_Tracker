import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { eachDayOfInterval, format, isSameDay, isAfter, isBefore, addDays, addWeeks, addMonths, addQuarters, addYears, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";

interface CashflowChartProps {
  startDate: Date;
  endDate: Date;
}

export function CashflowChart({ startDate, endDate }: CashflowChartProps) {
  const { transactions, accounts, recurringTransactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
  const [useSpendingPatterns, setUseSpendingPatterns] = useState(false);

  const chartData = useMemo(() => {
    const monthStart = startDate;
    const monthEnd = endDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all days in the current month
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Always use value_date (accounting date) for cashflow chart
    const getTransactionDate = (t: any) => new Date(t.value_date || t.transaction_date);
    
    // Calculate initial balance (sum of all account balances minus current month's net change)
    const currentMonthTransactions = transactions.filter(t => {
      const date = getTransactionDate(t);
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
      const isInPast = isBefore(day, today) || isSameDay(day, today);
      
      // Get transactions for this day
      const dayTransactions = transactions.filter(t => 
        isSameDay(getTransactionDate(t), day)
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
        dateObj: day,
        balance: isInPast ? runningBalance : null,
        projectedBalance: null as number | null,
        income: dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
        expense: dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
        isProjection: false,
      };
    });

    // Add projections for future days
    const futureDays = data.filter(d => d.balance === null);
    
    if (futureDays.length > 0) {
      // Find the last known balance
      const lastKnownData = data.filter(d => d.balance !== null);
      const lastKnownBalance = lastKnownData.length > 0 
        ? lastKnownData[lastKnownData.length - 1].balance! 
        : initialBalance;
      
      if (useSpendingPatterns) {
        // Calculate daily average from past transactions in period
        const pastDays = data.filter(d => d.balance !== null);
        const daysWithData = pastDays.length || 1;
        const totalIncome = pastDays.reduce((sum, d) => sum + d.income, 0);
        const totalExpenses = pastDays.reduce((sum, d) => sum + d.expense, 0);
        const dailyAvgNet = (totalIncome - totalExpenses) / daysWithData;
        
        let projectedBalance = lastKnownBalance;
        futureDays.forEach((dayData, index) => {
          projectedBalance += dailyAvgNet;
          const dataIndex = data.findIndex(d => d.date === dayData.date);
          if (dataIndex !== -1) {
            data[dataIndex].projectedBalance = projectedBalance;
            data[dataIndex].isProjection = true;
          }
        });
      } else {
        // Use recurring transactions for projection
        const activeRecurring = recurringTransactions.filter(rt => rt.is_active);
        
        // Calculate projected balances based on recurring transactions
        let projectedBalance = lastKnownBalance;
        
        futureDays.forEach((dayData, index) => {
          const day = dayData.dateObj;
          
          // Check which recurring transactions occur on this day
          activeRecurring.forEach(rt => {
            let nextDue = new Date(rt.next_due_date);
            
            // Find if this recurring transaction falls on this day
            while (isBefore(nextDue, day) || isSameDay(nextDue, day)) {
              if (isSameDay(nextDue, day)) {
                if (rt.type === 'income') {
                  projectedBalance += Number(rt.amount);
                } else if (rt.type === 'expense') {
                  projectedBalance -= Number(rt.amount);
                }
                break;
              }
              
              // Move to next occurrence
              switch (rt.recurrence_type) {
                case 'weekly':
                  nextDue = addWeeks(nextDue, 1);
                  break;
                case 'monthly':
                  nextDue = addMonths(nextDue, 1);
                  break;
                case 'quarterly':
                  nextDue = addQuarters(nextDue, 1);
                  break;
                case 'yearly':
                  nextDue = addYears(nextDue, 1);
                  break;
              }
            }
          });
          
          const dataIndex = data.findIndex(d => d.date === dayData.date);
          if (dataIndex !== -1) {
            data[dataIndex].projectedBalance = projectedBalance;
            data[dataIndex].isProjection = true;
          }
        });
      }
      
      // Set the last actual balance point to also have projectedBalance for smooth connection
      if (lastKnownData.length > 0) {
        const lastActualIndex = data.findIndex(d => d.date === lastKnownData[lastKnownData.length - 1].date);
        if (lastActualIndex !== -1) {
          data[lastActualIndex].projectedBalance = lastKnownBalance;
        }
      }
    }
    
    return data;
  }, [transactions, accounts, recurringTransactions, startDate, endDate, useSpendingPatterns]);

  const hasProjections = chartData.some(d => d.projectedBalance !== null);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const balance = data.balance ?? data.projectedBalance;
      const isProjection = data.balance === null && data.projectedBalance !== null;
      
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium mb-2">{data.date}</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">
                {isProjection ? 'Solde projeté:' : 'Solde:'}
              </span>
              <span className={`font-semibold ${isProjection ? 'text-primary/70' : ''}`}>
                {formatCurrency(balance)}
              </span>
            </div>
            {data.income > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-success">Revenus:</span>
                <span className="font-semibold text-success">+{formatCurrency(data.income)}</span>
              </div>
            )}
            {data.expense > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-destructive">Dépenses:</span>
                <span className="font-semibold text-destructive">-{formatCurrency(data.expense)}</span>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-semibold">Cashflow</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Évolution de votre solde</p>
          </div>
          {hasProjections && (
            <div className="flex items-center space-x-2 bg-muted/50 rounded-lg px-2 py-1">
              <Switch
                id="spending-patterns-dashboard"
                checked={useSpendingPatterns}
                onCheckedChange={setUseSpendingPatterns}
                className="scale-75 sm:scale-90"
              />
              <label htmlFor="spending-patterns-dashboard" className="text-[10px] sm:text-xs font-medium cursor-pointer">
                {useSpendingPatterns ? 'Patterns' : 'Récurrents'}
              </label>
            </div>
          )}
        </div>
        
        <div className={isPrivacyMode ? "blur-md select-none" : ""}>
          <ResponsiveContainer width="100%" height={200} className="sm:hidden">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="colorBalanceMobile" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorProjectedMobile" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
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
                connectNulls={false}
              />
              <Area 
                type="monotone" 
                dataKey="projectedBalance" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="url(#colorProjectedMobile)"
                connectNulls={true}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        <div className={isPrivacyMode ? "blur-md select-none" : ""}>
          <ResponsiveContainer width="100%" height={300} className="hidden sm:block">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
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
                connectNulls={false}
              />
              <Area 
                type="monotone" 
                dataKey="projectedBalance" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="url(#colorProjected)"
                connectNulls={true}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}