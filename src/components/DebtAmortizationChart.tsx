import { useMemo } from 'react';
import {
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
} from 'recharts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/dateUtils';
import { TOOLTIP_CLASS, AXIS_TICK, GRID_PROPS, CHART_SEMANTIC, formatAxisValue } from '@/lib/chartConfig';

interface ScheduledPayment {
  scheduled_date: string;
  scheduled_amount: number;
  principal_amount: number;
  interest_amount: number;
  insurance_amount: number;
  is_paid: boolean | null;
}

interface DebtAmortizationChartProps {
  scheduledPayments: ScheduledPayment[];
  totalAmount: number;
}

export const DebtAmortizationChart = ({ scheduledPayments, totalAmount }: DebtAmortizationChartProps) => {
  const { formatCurrency } = useUserPreferences();

  const chartData = useMemo(() => {
    if (scheduledPayments.length === 0) return [];

    let remaining = totalAmount;
    return scheduledPayments.map((sp) => {
      remaining = Math.max(0, remaining - sp.principal_amount);
      return {
        date: sp.scheduled_date,
        label: format(parseLocalDate(sp.scheduled_date), 'MMM yy', { locale: fr }),
        remaining,
        principal: sp.principal_amount,
        interest: sp.interest_amount,
        insurance: sp.insurance_amount || 0,
        isPaid: sp.is_paid,
      };
    });
  }, [scheduledPayments, totalAmount]);

  const totals = useMemo(() => {
    return scheduledPayments.reduce(
      (acc, sp) => ({
        principal: acc.principal + sp.principal_amount,
        interest: acc.interest + sp.interest_amount,
        insurance: acc.insurance + (sp.insurance_amount || 0),
        total: acc.total + sp.scheduled_amount,
      }),
      { principal: 0, interest: 0, insurance: 0, total: 0 }
    );
  }, [scheduledPayments]);

  if (chartData.length === 0) return null;

  const tickInterval = Math.max(1, Math.floor(chartData.length / 6));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    return (
      <div className={TOOLTIP_CLASS + " space-y-1"}>
        <p className="font-medium">
          {format(parseLocalDate(data.date), 'dd MMM yyyy', { locale: fr })}
          {data.isPaid && <span className="text-success ml-1.5">Payé</span>}
        </p>
        <div className="space-y-0.5 text-muted-foreground">
          <p>Capital restant: <span className="text-foreground font-medium">{formatCurrency(data.remaining)}</span></p>
          {data.principal > 0 && <p>Capital: <span className="text-foreground">{formatCurrency(data.principal)}</span></p>}
          {data.interest > 0 && <p>Intérêts: <span className="text-foreground">{formatCurrency(data.interest)}</span></p>}
          {data.insurance > 0 && <p>Assurance: <span className="text-foreground">{formatCurrency(data.insurance)}</span></p>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-3 sm:p-4">
        <p className="text-[10px] sm:text-xs text-muted-foreground uppercase mb-3">Amortissement</p>

        {/* Cost summary */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center mb-3">
          <div className="bg-[hsl(200,75%,60%)]/10 rounded-lg p-1.5 sm:p-2">
            <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Intérêts</p>
            <p className="text-[11px] sm:text-sm font-bold text-[hsl(200,75%,60%)] truncate">{formatCurrency(totals.interest)}</p>
          </div>
          <div className="bg-[hsl(280,70%,65%)]/10 rounded-lg p-1.5 sm:p-2">
            <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Assurance</p>
            <p className="text-[11px] sm:text-sm font-bold text-[hsl(280,70%,65%)] truncate">{formatCurrency(totals.insurance)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-1.5 sm:p-2">
            <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Coût total</p>
            <p className="text-[11px] sm:text-sm font-bold truncate">{formatCurrency(totals.total)}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[180px] sm:h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="remainingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxisValue}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="remaining"
                stroke="hsl(var(--primary))"
                fill="url(#remainingGrad)"
                strokeWidth={2}
                dot={false}
              />
              <Bar dataKey="principal" stackId="breakdown" fill={CHART_SEMANTIC.principal} opacity={0.7} radius={[0, 0, 0, 0]} />
              <Bar dataKey="interest" stackId="breakdown" fill={CHART_SEMANTIC.interest} opacity={0.7} radius={[0, 0, 0, 0]} />
              {totals.insurance > 0 && (
                <Bar dataKey="insurance" stackId="breakdown" fill={CHART_SEMANTIC.insurance} opacity={0.7} radius={[2, 2, 0, 0]} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 mt-2 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-[9px] sm:text-[10px] text-muted-foreground">Capital restant</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-success" />
            <span className="text-[9px] sm:text-[10px] text-muted-foreground">Capital</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(200, 75%, 60%)' }} />
            <span className="text-[9px] sm:text-[10px] text-muted-foreground">Intérêts</span>
          </div>
          {totals.insurance > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(280, 70%, 65%)' }} />
              <span className="text-[9px] sm:text-[10px] text-muted-foreground">Assurance</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
