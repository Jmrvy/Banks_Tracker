import { useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Wallet } from 'lucide-react';
import { useDebts } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const OverdueDebtPaymentsAlert = () => {
  const { debts, scheduledPayments, loading } = useDebts();
  const { formatCurrency } = useUserPreferences();
  const navigate = useNavigate();

  const overduePayments = useMemo(() => {
    if (loading) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    return scheduledPayments
      .filter(sp => !sp.is_paid && sp.scheduled_date < todayStr)
      .map(sp => {
        const debt = debts.find(d => d.id === sp.debt_id);
        return { ...sp, debtName: debt?.description ?? 'Dette' };
      })
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  }, [scheduledPayments, debts, loading]);

  if (overduePayments.length === 0) return null;

  const totalOverdue = overduePayments.reduce((s, p) => s + p.scheduled_amount, 0);
  const debtNames = [...new Set(overduePayments.map(p => p.debtName))];

  return (
    <Alert className="border-orange-500/50 bg-orange-500/10 dark:border-orange-500/30 dark:bg-orange-500/5">
      <Wallet className="h-4 w-4 text-orange-500" />
      <AlertDescription className="text-foreground">
        <div className="flex items-start sm:items-center justify-between gap-2 flex-col sm:flex-row">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium">
              {overduePayments.length} échéance{overduePayments.length > 1 ? 's' : ''} de dette en retard
              <span className="text-orange-600 dark:text-orange-400 ml-1.5 font-bold">
                {formatCurrency(totalOverdue)}
              </span>
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate">
              {debtNames.join(', ')}
              {overduePayments.length <= 3 && (
                <span>
                  {' — '}
                  {overduePayments.slice(0, 3).map(p =>
                    format(new Date(p.scheduled_date + 'T00:00:00'), 'dd MMM', { locale: fr })
                  ).join(', ')}
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/debts')}
            className="border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 flex-shrink-0 h-7 sm:h-8 text-[10px] sm:text-xs"
          >
            Voir les dettes
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};
