import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, AlertTriangle, Repeat, ArrowRight } from 'lucide-react';
import { useFinancialData, RecurringTransaction } from '@/hooks/useFinancialData';
import { useInstallmentPayments } from '@/hooks/useInstallmentPayments';
import { useDebts } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { parseLocalDate } from '@/lib/dateUtils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { RegularizeOverdueTransactionsModal } from './RegularizeOverdueTransactionsModal';
import { getRecurringDisplayAmount, getRecurringEffectiveType } from '@/lib/recurringAmount';
import { resolveNamePlaceholders } from '@/utils/namePlaceholders';
import { useTranslation } from 'react-i18next';

interface ScheduledDebtPayment {
  debt_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  is_paid: boolean | null;
}

export const RecurringTransactionsWarning = () => {
  const { recurringTransactions } = useFinancialData();
  const { installmentPayments } = useInstallmentPayments();
  const { debts } = useDebts();
  const { user } = useAuth();
  const { formatCurrency } = useUserPreferences();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showRegularizeModal, setShowRegularizeModal] = useState(false);

  const [scheduledDebtPayments, setScheduledDebtPayments] = useState<ScheduledDebtPayment[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase
      .from('scheduled_debt_payments')
      .select('debt_id, scheduled_date, scheduled_amount, is_paid')
      .eq('user_id', user.id)
      .then(({ data }) => setScheduledDebtPayments(data || []));
  }, [user]);


  const todayLocal = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const isStillActive = (rt: typeof recurringTransactions[number]) => {
    if (rt.installment_payment_id) {
      const ip = installmentPayments.find(p => p.id === rt.installment_payment_id);
      if (!ip || !ip.is_active || ip.remaining_amount <= 0) return false;
    }
    if (rt.debt_id) {
      const debt = debts.find(d => d.id === rt.debt_id);
      if (!debt || debt.status === 'completed' || debt.remaining_amount <= 0) return false;
    }
    return true;
  };

  const upcomingTransactions = useMemo(() => {
    const nextWeek = new Date(todayLocal);
    nextWeek.setDate(todayLocal.getDate() + 7);

    return recurringTransactions
      .filter(rt => {
        if (!rt.is_active) return false;
        if (!isStillActive(rt)) return false;
        const nextDue = parseLocalDate(rt.next_due_date);
        return nextDue >= todayLocal && nextDue <= nextWeek;
      })
      .sort((a, b) => parseLocalDate(a.next_due_date).getTime() - parseLocalDate(b.next_due_date).getTime());
  }, [recurringTransactions, todayLocal, installmentPayments, debts]);

  const overdueTransactions = useMemo(() => {
    return recurringTransactions
      .filter(rt => {
        if (!rt.is_active) return false;
        if (!isStillActive(rt)) return false;
        const nextDue = parseLocalDate(rt.next_due_date);
        return nextDue < todayLocal;
      })
      .sort((a, b) => parseLocalDate(a.next_due_date).getTime() - parseLocalDate(b.next_due_date).getTime());
  }, [recurringTransactions, todayLocal, installmentPayments, debts]);

  if (upcomingTransactions.length === 0 && overdueTransactions.length === 0) {
    return null;
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'income': return 'text-pos';
      case 'expense': return 'text-neg';
      default: return 'text-foreground';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'income': return '↗';
      case 'expense': return '↘';
      default: return '•';
    }
  };

  const formatDate = (dateString: string) => {
    const date = parseLocalDate(dateString);
    const diffTime = date.getTime() - todayLocal.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('common.today');
    if (diffDays === 1) return t('common.tomorrow');
    if (diffDays < 0) return `Il y a ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''}`;
    return `Dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  };

  return (
    <div className="space-y-4">
      {/* Overdue Transactions Alert */}
      {overdueTransactions.length > 0 && (
        <Alert className="border-destructive/50 bg-destructive/10 dark:border-destructive/30 dark:bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-foreground">
            <div className="flex items-center justify-between">
              <span>
                {overdueTransactions.length} transaction{overdueTransactions.length > 1 ? 's' : ''} récurrente{overdueTransactions.length > 1 ? 's' : ''} en retard
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRegularizeModal(true)}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  Régulariser
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/recurring-transactions')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Voir
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <RegularizeOverdueTransactionsModal
        open={showRegularizeModal}
        onOpenChange={setShowRegularizeModal}
        overdueTransactions={overdueTransactions}
      />

      {/* Upcoming Transactions */}
      {upcomingTransactions.length > 0 && (
        <Card className="border-border bg-card dark:border-border/50">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-foreground dark:text-foreground flex items-center gap-2 text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
              Transactions récurrentes à venir
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="space-y-1.5 sm:space-y-2">
              {upcomingTransactions.slice(0, 3).map((transaction) => {
                const displayAmount = getRecurringDisplayAmount(transaction, transaction.next_due_date, installmentPayments, debts, scheduledDebtPayments);
                const effectiveType = getRecurringEffectiveType(transaction, installmentPayments);
                return (
                <button
                  key={transaction.id}
                  onClick={() => navigate('/recurring-transactions')}
                  className="p-2 sm:p-3 rounded-lg bg-muted/30 dark:bg-muted/20 border border-border/50 w-full text-left hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  {/* Mobile view - compact single line */}
                  <div className="flex items-center justify-between gap-2 sm:hidden">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm flex-shrink-0">{getTypeIcon(effectiveType)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate text-foreground">{resolveNamePlaceholders(transaction.description, parseLocalDate(transaction.next_due_date))}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDate(transaction.next_due_date)}
                        </p>
                      </div>
                    </div>
                    <p className={`text-xs font-semibold flex-shrink-0 ${getTypeColor(effectiveType)}`}>
                      {effectiveType === 'income' ? '+' : '-'}{formatCurrency(displayAmount)}
                    </p>
                  </div>

                  {/* Desktop view - full details */}
                  <div className="hidden sm:flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className="text-base mt-0.5">{getTypeIcon(effectiveType)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{resolveNamePlaceholders(transaction.description, parseLocalDate(transaction.next_due_date))}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{transaction.account?.name}</span>
                          {transaction.category && (
                            <>
                              <span>•</span>
                              <div className="flex items-center gap-1">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: transaction.category.color }}
                                />
                                <span>{transaction.category.name}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-semibold ${getTypeColor(effectiveType)}`}>
                        {effectiveType === 'income' ? '+' : '-'}{formatCurrency(displayAmount)}
                      </p>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(transaction.next_due_date)}
                        </p>
                        <span className="text-xs text-muted-foreground">•</span>
                        <p className="text-xs text-muted-foreground">
                          {transaction.recurrence_type === 'weekly' ? 'Hebdo' : 
                           transaction.recurrence_type === 'monthly' ? 'Mensuel' : 
                           transaction.recurrence_type === 'yearly' ? 'Annuel' : transaction.recurrence_type}
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
                );
              })}

              {upcomingTransactions.length > 3 && (
                <div className="text-center pt-1 sm:pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/recurring-transactions')}
                    className="text-muted-foreground hover:text-foreground text-xs sm:text-sm h-7 sm:h-8"
                  >
                    Voir {upcomingTransactions.length - 3} autre{upcomingTransactions.length - 3 > 1 ? 's' : ''}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
