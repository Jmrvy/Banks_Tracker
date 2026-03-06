import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from "recharts";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { eachDayOfInterval, format, isSameDay, isBefore, addWeeks, addMonths, addQuarters, addYears } from "date-fns";
import { fr } from "date-fns/locale";

interface CashflowChartProps {
  startDate: Date;
  endDate: Date;
}

export function CashflowChart({ startDate, endDate }: CashflowChartProps) {
  const { transactions, accounts, recurringTransactions } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

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

    // Build cumulative data for each day (only past/today days get actual balance)
    let runningBalance = initialBalance;
    const data = days.map(day => {
      const isInPast = isBefore(day, today) || isSameDay(day, today);

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

    // Projections for future days — only use recurring transactions
    const pastDays = data.filter(d => d.balance !== null);
    const futureDays = data.filter(d => d.balance === null);

    if (futureDays.length > 0) {
      const lastKnownBalance = pastDays.length > 0
        ? pastDays[pastDays.length - 1].balance!
        : initialBalance;

      const activeRecurring = recurringTransactions.filter(rt => rt.is_active);

      // Pre-compute all recurring transaction occurrences in the future period
      const recurringOccurrences = new Map<number, { income: number; expense: number }>();

      for (const rt of activeRecurring) {
        let endDateLimit: Date | null = null;
        if (rt.end_date) {
          const [ey, em, ed] = rt.end_date.split('-').map(Number);
          endDateLimit = new Date(ey, em - 1, ed);
        }

        const [_y, _m, _d] = rt.next_due_date.split('-').map(Number);
        let nextDue = new Date(_y, _m - 1, _d);

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

        // Collect all future occurrences, respecting end_date
        while (isBefore(nextDue, periodEnd) || isSameDay(nextDue, periodEnd)) {
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

      // Apply only recurring transactions to projection — no daily average
      let projectedBalance = lastKnownBalance;
      for (const dayData of futureDays) {
        const idx = data.indexOf(dayData);
        const recurring = recurringOccurrences.get(idx);
        if (recurring) {
          projectedBalance += (recurring.income - recurring.expense);
        }
        data[idx].projectedBalance = projectedBalance;
      }

      // Connect actual line to projected line
      if (pastDays.length > 0) {
        const lastActualIdx = data.indexOf(pastDays[pastDays.length - 1]);
        if (lastActualIdx !== -1) {
          data[lastActualIdx].projectedBalance = lastKnownBalance;
        }
      }
    }

    return data;
  }, [transactions, accounts, recurringTransactions, startDate, endDate]);

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

  const renderChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          tickFormatter={(value) => `${value.toLocaleString()}€`}
          width={60}
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
  );

  return (
    <Card>
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold">Cashflow</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">Évolution de votre solde</p>
        </div>

        <div className={isPrivacyMode ? "blur-md select-none" : ""}>
          <div className="h-[250px] sm:h-[300px]">
            {renderChart()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
