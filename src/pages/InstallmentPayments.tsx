import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseLocalDate } from "@/lib/dateUtils";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CreditCard,
  Plus,
  CheckCircle2,
  Wallet,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import {
  useInstallmentPayments,
  InstallmentPayment,
} from "@/hooks/useInstallmentPayments";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { NewInstallmentPaymentModal } from "@/components/NewInstallmentPaymentModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { differenceInDays, startOfDay } from "date-fns";

interface InstallmentPaymentsProps {
  /** Strip the outer page chrome when rendered inside the unified
   *  `/scheduled` page (which provides its own header). */
  embedded?: boolean;
}

const InstallmentPayments = ({ embedded = false }: InstallmentPaymentsProps = {}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    installmentPayments,
    loading,
    detectOrphanedTransactions,
    deleteOrphanedTransactions,
  } = useInstallmentPayments();
  const { accounts, transactions, refetch } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { toast } = useToast();

  const [showNewModal, setShowNewModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');
  const highlightRef = useRef<HTMLButtonElement>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [orphanedTransactions, setOrphanedTransactions] = useState<
    Array<{ id: string; description: string; amount: number; type: string; transaction_date: string; account_id: string }>
  >([]);
  const [orphanDialogOpen, setOrphanDialogOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    const checkOrphans = async () => {
      const orphans = await detectOrphanedTransactions();
      if (orphans.length > 0) {
        setOrphanedTransactions(orphans);
        setOrphanDialogOpen(true);
      }
    };
    checkOrphans();
  }, [loading]);

  useEffect(() => {
    const id = searchParams.get('highlight');
    if (id && installmentPayments.length > 0) {
      const payment = installmentPayments.find(ip => ip.id === id);
      if (payment) {
        if (!payment.is_active) setFilter('all');
        setHighlightId(id);
        searchParams.delete('highlight');
        setSearchParams(searchParams, { replace: true });
        setTimeout(() => {
          highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
        setTimeout(() => setHighlightId(null), 3000);
      }
    }
  }, [installmentPayments, searchParams]);

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'weekly': return t('installments.weekly', { defaultValue: 'Weekly' });
      case 'monthly': return t('installments.monthly', { defaultValue: 'Monthly' });
      case 'quarterly': return t('installments.quarterly', { defaultValue: 'Quarterly' });
      default: return frequency;
    }
  };

  const getPaymentHistory = (paymentId: string) =>
    transactions.filter(tx => tx.installment_payment_id === paymentId);

  const filteredPayments = installmentPayments.filter(payment => {
    if (filter === 'active') return payment.is_active;
    if (filter === 'completed') return !payment.is_active;
    return true;
  });

  // Presentation-level folds of data already on the page — used by the
  // segmented control's counts and by each KPI's foot line.
  const activeCount = installmentPayments.filter((p) => p.is_active).length;
  const completedCount = installmentPayments.filter((p) => !p.is_active).length;
  const activeInstalmentLoad = installmentPayments
    .filter((p) => p.is_active)
    .reduce((sum, p) => sum + p.installment_amount, 0);

  const renderPaymentCard = (payment: InstallmentPayment) => {
    const paid = payment.total_amount - payment.remaining_amount;
    const progress = payment.total_amount > 0
      ? Math.min(100, Math.round((paid / payment.total_amount) * 1000) / 10)
      : 0;
    const nextDue = parseLocalDate(payment.next_payment_date);
    const today = startOfDay(new Date());
    const daysUntil = differenceInDays(nextDue, today);
    const paidCount = getPaymentHistory(payment.id).length;
    const rawTotalCount = payment.installment_amount > 0
      ? Math.ceil(payment.total_amount / payment.installment_amount)
      : 0;
    const totalCount = payment.remaining_amount <= 0 ? paidCount : rawTotalCount;
    const isHighlighted = highlightId === payment.id;

    // Direction carries the colour: money coming back is `pos`, money going
    // out is the accent — never a raw palette hue, which would not follow the
    // accent token into dark mode.
    const incoming = payment.payment_type === 'reimbursement';
    const toneVar = incoming ? 'hsl(var(--pos))' : 'hsl(var(--primary))';
    const ticks = Math.max(0, Math.min(totalCount, 24));

    return (
      <button
        key={payment.id}
        ref={isHighlighted ? highlightRef : undefined}
        type="button"
        onClick={() => navigate(`/installment-payments/${payment.id}`)}
        className={cn(
          'ft-card w-full text-left p-5 flex flex-col transition-colors hover:border-line-strong',
          !payment.is_active && 'opacity-70',
          isHighlighted && 'ring-2 ring-primary/50 shadow-sh-2',
        )}
      >
        {/* Head: name, direction, completion tag */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[14.5px] font-[650] truncate">{payment.description}</div>
            <div className="ft-card-sub truncate">
              {incoming
                ? t('installments.youReceive', { defaultValue: 'You receive' })
                : t('installments.youPay', { defaultValue: 'You pay' })}
              {' · '}
              {t('installments.nInstalments', {
                defaultValue: '{{n}} instalments',
                n: totalCount,
              })}
            </div>
          </div>
          <span className={cn('ft-tag flex-shrink-0', incoming ? 'pos' : 'acc')}>
            {paidCount}/{totalCount}
          </span>
        </div>

        {/* Headline: what is left, against the whole */}
        <div className="flex items-baseline gap-2 flex-wrap mt-4">
          <span className="font-mono text-[25px] font-medium tracking-[-0.03em] leading-none">
            {formatCurrency(payment.remaining_amount)}
          </span>
          <span className="text-fg-mute text-[12.5px]">
            {t('installments.remainingOf', {
              defaultValue: 'remaining of {{total}}',
              total: formatCurrency(payment.total_amount),
            })}
          </span>
        </div>

        <div className="ft-progress-track tall mt-3.5">
          <div
            className="ft-progress-fill"
            style={{ width: `${Math.min(100, progress)}%`, background: toneVar }}
          />
        </div>

        <div className="flex justify-between gap-2 text-[11.5px] text-fg-dim mt-[7px]">
          <span>
            {t('installments.pctSettled', {
              defaultValue: '{{pct}}% settled',
              pct: Math.round(progress),
            })}
          </span>
          <span className="truncate">
            {payment.is_active ? (
              t('installments.nextOn', {
                defaultValue: 'Next: {{date}}',
                date: nextDue.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
              })
            ) : (
              <span className="inline-flex items-center gap-1 text-pos">
                <CheckCircle2 className="h-3 w-3" />
                {t('installments.completed', { defaultValue: 'Completed' })}
              </span>
            )}
          </span>
        </div>

        <hr className="my-4 border-0 border-t border-line-soft" />

        <div className="flex items-center justify-between gap-2 text-[12.5px]">
          <span className="text-fg-mute">
            {t('installments.monthlyAmount', { defaultValue: 'Instalment' })}
          </span>
          <b className="font-mono font-medium tracking-[-0.02em]">
            {formatCurrency(payment.installment_amount)}/
            {payment.frequency === 'weekly'
              ? t('installments.wk', { defaultValue: 'wk' })
              : payment.frequency === 'quarterly'
              ? t('installments.qtr', { defaultValue: 'qtr' })
              : t('installments.mo', { defaultValue: 'mo' })}
          </b>
        </div>

        {/* One tick per instalment — the plan's shape at a glance. */}
        {ticks > 0 && (
          <div className="flex gap-1 mt-3.5" aria-hidden="true">
            {Array.from({ length: ticks }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-1.5 rounded-[3px]"
                style={{ background: i < paidCount ? toneVar : 'hsl(var(--bg-sunk))' }}
              />
            ))}
          </div>
        )}

        {/* Foot: schedule context + the affordance the whole card carries. */}
        <div className="flex items-center justify-between gap-2 mt-4 text-[11.5px] text-fg-dim">
          <span className="inline-flex items-center gap-1.5 truncate">
            <Clock className="h-3 w-3 flex-shrink-0" />
            {payment.is_active
              ? daysUntil < 0
                ? t('installments.overdue', { defaultValue: 'Overdue' })
                : daysUntil === 0
                ? t('installments.today', { defaultValue: 'Today' })
                : daysUntil === 1
                ? t('installments.tomorrow', { defaultValue: 'Tomorrow' })
                : t('installments.inNDays', { defaultValue: 'In {{n}} days', n: daysUntil })
              : getFrequencyLabel(payment.frequency)}
          </span>
          <span className="inline-flex items-center gap-1 text-accent-deep font-[550] flex-shrink-0">
            {t('installments.openPlan', { defaultValue: 'Open plan' })}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"
            role="status"
          ></div>
          <p className="text-sm text-muted-foreground">
            {t('installments.loading', { defaultValue: 'Loading installment payments…' })}
          </p>
        </div>
      </div>
    );
  }

  const newButton = (
    <Button
      onClick={() => setShowNewModal(true)}
      size="sm"
      className="h-8 px-3 gap-1.5 font-semibold"
    >
      <Plus className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">
        {t('installments.newPlan', { defaultValue: 'New plan' })}
      </span>
    </Button>
  );

  return (
    <div className={embedded ? "" : "min-h-screen bg-background pb-20 md:pb-12"}>
      <div className={embedded ? "" : "ft-page"}>
        {!embedded && (
          <div className="ft-page-head">
            <div>
              <div className="ft-eyebrow">{t('navigation.tools')}</div>
              <h1 className="ft-page-title">{t('navigation.installmentPayments')}</h1>
              <div className="ft-page-sub">
                {t('installments.subtitle', {
                  defaultValue: 'Track your installment plans funded by savings',
                })}
              </div>
            </div>
            {newButton}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon warn">
                <Wallet className="h-4 w-4" />
              </div>
              <span className="ft-kpi-label">
                {t('installments.totalDue', { defaultValue: 'Total due' })}
              </span>
            </div>
            <div className="ft-kpi-value truncate">
              {formatCurrency(
                installmentPayments
                  .filter((p) => p.is_active)
                  .reduce((sum, p) => sum + p.remaining_amount, 0)
              )}
            </div>
            <div className="ft-kpi-foot">
              {t('installments.nPlans', {
                defaultValue: '{{n}} plans',
                n: activeCount,
              })}
            </div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon pos">
                <CreditCard className="h-4 w-4" />
              </div>
              <span className="ft-kpi-label">
                {t('installments.active', { defaultValue: 'Active' })}
              </span>
            </div>
            <div className="ft-kpi-value">{activeCount}</div>
            <div className="ft-kpi-foot">
              {t('installments.monthlyLoad', {
                defaultValue: '{{amount}} per instalment cycle',
                amount: formatCurrency(activeInstalmentLoad),
              })}
            </div>
          </div>
          <div className="ft-kpi">
            <div className="flex items-center gap-2.5">
              <div className="ft-kpi-icon">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="ft-kpi-label">
                {t('installments.completed', { defaultValue: 'Completed' })}
              </span>
            </div>
            <div className="ft-kpi-value">{completedCount}</div>
            <div className="ft-kpi-foot">
              {t('installments.settledInFull', { defaultValue: 'settled in full' })}
            </div>
          </div>
        </div>

        {/* One control style per screen — the page's segmented switch, with
            the create action sharing its row rather than floating above it. */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Segmented<typeof filter>
            label={t('navigation.installmentPayments')}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: t('installments.active', { defaultValue: 'Active' }), count: activeCount },
              { value: 'completed', label: t('installments.completed', { defaultValue: 'Completed' }), count: completedCount },
              { value: 'all', label: t('common.all', { defaultValue: 'All' }), count: installmentPayments.length },
            ]}
          />
          {embedded && newButton}
        </div>

        {filteredPayments.length === 0 ? (
          <div className="ft-card p-8 sm:p-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-bg-subtle mx-auto mb-3 sm:mb-4 grid place-items-center">
              <CreditCard className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base sm:text-lg font-medium mb-2">
              {t('installments.empty', { defaultValue: 'No installment plans' })}
            </h3>
            <p className="text-muted-foreground text-xs sm:text-sm mb-4">
              {t('installments.emptyHint', {
                defaultValue: 'Create your first multi-payment plan to get started',
              })}
            </p>
            <Button
              onClick={() => setShowNewModal(true)}
              size="sm"
              className="h-8 text-sm gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('installments.newPlan', { defaultValue: 'New plan' })}
            </Button>
          </div>
        ) : (
          /* Design's `.g3` deck: three plan cards abreast, collapsing to one
             column at the system's single 1180px breakpoint. */
          <div className="ft-g3 sm:grid-cols-2 wide:grid-cols-3">
            {filteredPayments.map(renderPaymentCard)}
          </div>
        )}
      </div>

      <NewInstallmentPaymentModal open={showNewModal} onOpenChange={setShowNewModal} />

      <AlertDialog open={orphanDialogOpen} onOpenChange={setOrphanDialogOpen}>
        <AlertDialogContent className="max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('installments.orphanTitle', { defaultValue: 'Orphan transactions detected' })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {t('installments.orphanDesc', {
                    defaultValue:
                      '{{n}} transaction(s) link to installment plans that no longer exist. Delete them?',
                    n: orphanedTransactions.length,
                  })}
                </p>
                <div className="max-h-[250px] overflow-y-auto rounded-md border border-line bg-bg-subtle divide-y divide-line-soft">
                  {orphanedTransactions.map((tx) => {
                    const accountName = accounts.find((a) => a.id === tx.account_id)?.name;
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <div className="flex flex-col min-w-0 flex-1 mr-2">
                          <span className="truncate font-medium text-foreground">
                            {tx.description}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(tx.transaction_date + 'T00:00:00').toLocaleDateString(
                              'fr-FR'
                            )}
                            {accountName && ` · ${accountName}`}
                          </span>
                        </div>
                        <span
                          className={`font-medium whitespace-nowrap ${
                            tx.type === 'income' ? 'text-pos' : 'text-neg'
                          }`}
                        >
                          {tx.type === 'income' ? '+' : '−'}
                          {formatCurrency(tx.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOrphanedTransactions([])}>
              {t('common.keep', { defaultValue: 'Keep' })}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const ids = orphanedTransactions.map((tx) => tx.id);
                const { error } = await deleteOrphanedTransactions(ids);
                if (error) {
                  toast({
                    title: t('common.error'),
                    description: t('recurring.cannotDeleteOrphans'),
                    variant: 'destructive',
                  });
                } else {
                  await refetch();
                  toast({
                    title: t('installments.orphanDeletedTitle', {
                      defaultValue: 'Transactions deleted',
                    }),
                    description: t('installments.orphanDeletedDesc', {
                      defaultValue: '{{n}} orphan transaction(s) deleted.',
                      n: ids.length,
                    }),
                  });
                }
                setOrphanedTransactions([]);
                setOrphanDialogOpen(false);
              }}
            >
              {t('common.delete', { defaultValue: 'Delete' })} ({orphanedTransactions.length})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InstallmentPayments;
