import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { eachDayOfInterval, format, isSameDay, isBefore, addWeeks, addMonths, addQuarters, addYears } from "date-fns";
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
    const periodStart = startDate;
    const periodEnd = endDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = eachDayOfInterval({ start: periodStart, end: periodEnd });

    const getTransactionDate = (t: any) => {
      const d = new Date(t.transaction_date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Calculate initial balance: current total balance minus ALL transactions from periodStart onwards
    // This correctly handles past, current, and future periods
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    const transactionsFromPeriodStart = transactions.filter(t => {
      const date = getTransactionDate(t);
      return date >= periodStart;
    });

    const netFromPeriodStart = transactionsFromPeriodStart.reduce((sum, t) => {
      if (t.type === 'income') return sum + t.amount;
      if (t.type === 'expense') return sum - t.amount;
      return sum;
    }, 0);

    const initialBalance = totalBalance - netFromPeriodStart;

    // Build cumulative data for each day (only for past/today days)
    let runningBalance = initialBalance;
    const data = days.map(day => {
      const isInPast = isBefore(day, today) || isSameDay(day, today);

      // Only process transactions for past/today days
      const dayIncome = isInPast
        ? transactions.filter(t => t.type === 'income' && isSameDay(getTransactionDate(t), day)).reduce((sum, t) => sum + t.amount, 0)
        : 0;
      const dayExpense = isInPast
        ? transactions.filter(t => t.type === 'expense' && isSameDay(getTransactionDate(t), day)).reduce((sum, t) => sum + t.amount, 0)
        : 0;

      if (isInPast) {
        runningBalance += (dayIncome - dayExpense);
      }

      return {
        date: format(day, 'd MMM', { locale: fr }),
        dateObj: day,
        balance: isInPast ? runningBalance : null,
        projectedBalance: null as number | null,
        income: dayIncome,
        expense: dayExpense,
      };
    });

    // Add projections for future days
    const pastDays = data.filter(d => d.balance !== null);
    const futureDays = data.filter(d => d.balance === null);

    if (futureDays.length > 0) {
      const lastKnownBalance = pastDays.length > 0
        ? pastDays[pastDays.length - 1].balance!
        : initialBalance;

      if (useSpendingPatterns) {
        // Pure daily average projection
        const daysWithData = pastDays.length || 1;
        const totalIncome = pastDays.reduce((sum, d) => sum + d.income, 0);
        const totalExpenses = pastDays.reduce((sum, d) => sum + d.expense, 0);
        const dailyAvgNet = (totalIncome - totalExpenses) / daysWithData;

        let projectedBalance = lastKnownBalance;
        for (const dayData of futureDays) {
          projectedBalance += dailyAvgNet;
          const idx = data.indexOf(dayData);
          data[idx].projectedBalance = projectedBalance;
        }
      } else {
        // Blended projection: recurring transactions + average daily non-recurring spending
        const activeRecurring = recurringTransactions.filter(rt => rt.is_active);

        // Pre-compute all recurring transaction occurrences in the future period
        const recurringOccurrences = new Map<number, { income: number; expense: number }>();

        for (const rt of activeRecurring) {
          // Parse end_date to stop projecting past it
          let endDateLimit: Date | null = null;
          if (rt.end_date) {
            const [ey, em, ed] = rt.end_date.split('-').map(Number);
            endDateLimit = new Date(ey, em - 1, ed);
          }

          const [_y, _m, _d] = rt.next_due_date.split('-').map(Number);
          let nextDue = new Date(_y, _m - 1, _d);

          // Advance to first occurrence within or after today
          const advanceDate = (d: Date): Date => {
            switch (rt.recurrence_type) {
              case 'weekly': return addWeeks(d, 1);
              case 'monthly': return addMonths(d, 1);
              case 'quarterly': return addQuarters(d, 1);
              case 'yearly': return addYears(d, 1);
              default: return addMonths(d, 1);
            }
          };

          // Skip past occurrences
          while (isBefore(nextDue, today) && !isSameDay(nextDue, today)) {
            nextDue = advanceDate(nextDue);
          }

          // Collect all occurrences within the future period, respecting end_date
          while (isBefore(nextDue, periodEnd) || isSameDay(nextDue, periodEnd)) {
            // Stop if this recurring transaction has ended
            if (endDateLimit && isBefore(endDateLimit, nextDue)) break;

            if (isBefore(today, nextDue) || isSameDay(today, nextDue)) {
              const dayIndex = data.findIndex(d => isSameDay(d.dateObj, nextDue));
              if (dayIndex !== -1 && data[dayIndex].balance === null) {
                const existing = recurringOccurrences.get(dayIndex) || { income: 0, expense: 0 };
                if (rt.type === 'income') existing.income += Number(rt.amount);
                else if (rt.type === 'expense') existing.expense += Number(rt.amount);
                recurringOccurrences.set(dayIndex, existing);
              }
            }
            nextDue = advanceDate(nextDue);
          }
        }

        // Calculate average daily non-recurring spending from past data
        // Subtract recurring transaction amounts that already happened from past averages
        const daysWithData = pastDays.length || 1;
        const totalPastExpenses = pastDays.reduce((sum, d) => sum + d.expense, 0);
        const totalPastIncome = pastDays.reduce((sum, d) => sum + d.income, 0);

        // Estimate recurring portion of past spending to isolate non-recurring daily average
        // Only count recurring transactions that are still active (not ended)
        const recurringMonthlyExpense = activeRecurring
          .filter(rt => rt.type === 'expense')
          .reduce((sum, rt) => {
            // Skip if end_date has passed
            if (rt.end_date) {
              const [ey, em, ed] = rt.end_date.split('-').map(Number);
              if (new Date(ey, em - 1, ed) < today) return sum;
            }
            const amount = Number(rt.amount);
            switch (rt.recurrence_type) {
              case 'weekly': return sum + amount * 4.33;
              case 'monthly': return sum + amount;
              case 'quarterly': return sum + amount / 3;
              case 'yearly': return sum + amount / 12;
              default: return sum + amount;
            }
          }, 0);

        const recurringMonthlyIncome = activeRecurring
          .filter(rt => rt.type === 'income')
          .reduce((sum, rt) => {
            if (rt.end_date) {
              const [ey, em, ed] = rt.end_date.split('-').map(Number);
              if (new Date(ey, em - 1, ed) < today) return sum;
            }
            const amount = Number(rt.amount);
            switch (rt.recurrence_type) {
              case 'weekly': return sum + amount * 4.33;
              case 'monthly': return sum + amount;
              case 'quarterly': return sum + amount / 3;
              case 'yearly': return sum + amount / 12;
              default: return sum + amount;
            }
          }, 0);

        const nonRecurringDailyExpense = Math.max(0, (totalPastExpenses - (recurringMonthlyExpense * daysWithData / 30))) / daysWithData;
        const nonRecurringDailyIncome = Math.max(0, (totalPastIncome - (recurringMonthlyIncome * daysWithData / 30))) / daysWithData;
        const nonRecurringDailyNet = nonRecurringDailyIncome - nonRecurringDailyExpense;

        let projectedBalance = lastKnownBalance;
        for (const dayData of futureDays) {
          const idx = data.indexOf(dayData);
          const recurring = recurringOccurrences.get(idx);
          const recurringNet = recurring ? (recurring.income - recurring.expense) : 0;

          // Apply recurring transactions + non-recurring daily average
          projectedBalance += recurringNet + nonRecurringDailyNet;
          data[idx].projectedBalance = projectedBalance;
        }
      }

      // Connect actual line to projected line for smooth visual transition
      if (pastDays.length > 0) {
        const lastActualIdx = data.indexOf(pastDays[pastDays.length - 1]);
        if (lastActualIdx !== -1) {
          data[lastActualIdx].projectedBalance = lastKnownBalance;
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
        <div className="bg-popover/80 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-[0_8px_32px_-4px_hsl(220_20%_4%/0.6),inset_0_0.5px_0_0_hsl(210_20%_98%/0.08)] p-3">
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

  const renderChart = (height: number, gradientSuffix: string) => (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData}>
        <defs>
          <linearGradient id={`colorBalance${gradientSuffix}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id={`colorProjected${gradientSuffix}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis
          dataKey="date"
          stroke="hsl(var(--muted-foreground))"
          fontSize={height < 250 ? 9 : 12}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={height < 250 ? 9 : 12}
          tickLine={false}
          tickFormatter={(value) => height < 250 ? `${(value/1000).toFixed(0)}k` : `${value.toLocaleString()}€`}
          width={height < 250 ? 30 : 60}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="balance"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill={`url(#colorBalance${gradientSuffix})`}
          connectNulls={false}
        />
        <Area
          type="monotone"
          dataKey="projectedBalance"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeDasharray="5 5"
          fill={`url(#colorProjected${gradientSuffix})`}
          connectNulls={true}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  return (
    <Card>
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
          <div className="sm:hidden">
            {renderChart(200, "Mobile")}
          </div>
          <div className="hidden sm:block">
            {renderChart(300, "")}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
