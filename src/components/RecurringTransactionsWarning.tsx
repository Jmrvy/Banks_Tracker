import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useFinancialData } from '@/hooks/useFinancialData';
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

  if (overdueTransactions.length === 0) {
    return null;
  }

  // Signed, not a bare magnitude. An overdue recurring *income* is money not
  // yet received, so adding it to money not yet taken inflates the figure and
  // made this band disagree with UpcomingCard, which is built from the same
  // rows. Net the two directions the same way that card does, then let the
  // sign pick the sentence.
  const overdueNet = overdueTransactions.reduce((sum, rt) => {
    const amount = getRecurringDisplayAmount(
      rt,
      rt.next_due_date,
      installmentPayments,
      debts,
      scheduledDebtPayments,
    );
    return sum + (getRecurringEffectiveType(rt, installmentPayments) === 'income' ? amount : -amount);
  }, 0);
  const overdueIsInflow = overdueNet > 0;
  const overdueNames = overdueTransactions
    .slice(0, 3)
    .map(rt => resolveNamePlaceholders(rt.description, parseLocalDate(rt.next_due_date)))
    .join(', ');

  return (
    <>
      {/* One tinted border on the normal surface — no colour wash. The whole
          band has to read as a note beside the hero, not louder than it. */}
      <div
        className="ft-card flex items-start gap-3.5"
        style={{ padding: 18, borderColor: 'hsl(var(--neg-soft))' }}
      >
        <div className="ft-kpi-icon neg">
          <AlertTriangle className="h-[15px] w-[15px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-[650]">
            {t('recurring.overdueCount', {
              defaultValue: '{{count}} overdue recurring transaction',
              count: overdueTransactions.length,
            })}
          </div>
          <div className="text-[12.5px] text-fg-mute mt-[3px]">
            {overdueIsInflow
              ? t('recurring.overdueDetailInflow', {
                  defaultValue: '{{names}} — {{amount}} not yet received.',
                  names: overdueNames,
                  amount: formatCurrency(Math.abs(overdueNet)),
                })
              : t('recurring.overdueDetail', {
                  defaultValue: '{{names}} — {{amount}} not yet taken.',
                  names: overdueNames,
                  amount: formatCurrency(Math.abs(overdueNet)),
                })}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRegularizeModal(true)}
              className="h-[29px] px-2.5 rounded-[9px] text-[12px] font-[550]"
            >
              {t('recurring.regularize', { defaultValue: 'Settle' })}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/recurring-transactions')}
              className="h-[29px] px-2.5 rounded-[9px] text-[12px] font-[550] text-fg-mute hover:text-foreground"
            >
              {t('recurring.viewSchedule', { defaultValue: 'View schedule' })}
            </Button>
          </div>
        </div>
      </div>

      <RegularizeOverdueTransactionsModal
        open={showRegularizeModal}
        onOpenChange={setShowRegularizeModal}
        overdueTransactions={overdueTransactions}
      />
    </>
  );
};
