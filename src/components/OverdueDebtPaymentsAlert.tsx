import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { useDebts } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/dateUtils';

export const OverdueDebtPaymentsAlert = () => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { debts, scheduledPayments, loading } = useDebts();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();
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
        return { ...sp, debtName: debt?.description ?? t('debts.title', { defaultValue: 'Debt' }) };
      })
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  }, [scheduledPayments, debts, loading, t]);

  if (overduePayments.length === 0) return null;

  const totalOverdue = overduePayments.reduce((s, p) => s + p.scheduled_amount, 0);
  const debtNames = [...new Set(overduePayments.map(p => p.debtName))];

  return (
    <div
      // Kept from the shadcn <Alert> this replaced — an overdue payment is
      // exactly the kind of thing that must be announced, not just tinted.
      role="alert"
      className="ft-card flex items-start gap-3.5"
      style={{ padding: 18, borderColor: 'hsl(var(--warn-soft))' }}
    >
      <div className="ft-kpi-icon warn">
        <Clock className="h-[15px] w-[15px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-[650]">
          {t('debts.overdueScheduled', {
            defaultValue: '{{count}} overdue debt payment',
            count: overduePayments.length,
          })}
          <span className={`ml-1.5 font-mono text-warn ${isPrivacyMode ? 'ft-priv' : ''}`}>
            {formatCurrency(totalOverdue)}
          </span>
        </div>
        <div className="text-[12.5px] text-fg-mute mt-[3px]">
          {debtNames.join(', ')}
          {overduePayments.length <= 3 && (
            <>
              {' — '}
              {overduePayments
                .slice(0, 3)
                .map(p => format(parseLocalDate(p.scheduled_date), 'd MMM', { locale: dateLocale }))
                .join(', ')}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/debts')}
            className="h-[29px] px-2.5 rounded-[9px] text-[12px] font-[550]"
          >
            {t('debts.viewDebts', { defaultValue: 'View debts' })}
          </Button>
        </div>
      </div>
    </div>
  );
};
