import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { differenceInDays, format, parseISO, startOfDay } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  History as HistoryIcon,
  Loader2,
  MoreVertical,
  Receipt,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { TFunction } from 'i18next';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingSpinner, InlineSpinner } from '@/components/LoadingSpinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  useInstallmentPayments,
  InstallmentPayment,
  InstallmentPaymentHistory,
} from '@/hooks/useInstallmentPayments';
import { useFinancialData, type Transaction } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

/** Personalized-schedule record loaded for a custom installment plan.
 *  When present, the timeline renders these instead of regenerating the
 *  schedule from installment_amount + frequency. */
interface InstallmentRecord {
  id: string;
  scheduled_date: string;
  scheduled_amount: number;
  is_paid: boolean;
  paid_date: string | null;
  actual_amount: number | null;
  transaction_id: string | null;
}

import { InstallmentScheduleTimeline } from '@/components/InstallmentScheduleTimeline';
import { RecordInstallmentPaymentModal } from '@/components/RecordInstallmentPaymentModal';
import { TransactionDetailModal } from '@/components/TransactionDetailModal';
import { EditTransactionModal } from '@/components/EditTransactionModal';
import { AdjustPlanForm } from '@/components/installments/AdjustPlanForm';

const InstallmentPaymentDetail = () => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { formatCurrency } = useUserPreferences();
  const { isPrivacyMode } = usePrivacy();

  const {
    installmentPayments,
    loading,
    deleteInstallmentPayment,
    completeInstallmentPayment,
    fetchPaymentHistory,
    revertInstallmentHistoryEntry,
    fetchTransactionsSinceEntry,
    fetchLinkedTransactions,
  } = useInstallmentPayments();
  const { accounts, categories, transactions, refetch } = useFinancialData();

  const plan = useMemo(
    () => installmentPayments.find((p) => p.id === id) || null,
    [installmentPayments, id]
  );

  const [history, setHistory] = useState<InstallmentPaymentHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [linkedForDelete, setLinkedForDelete] = useState<
    Array<{ id: string; description: string; amount: number; type: string; transaction_date: string; account_id: string }>
  >([]);
  const [loadingLinked, setLoadingLinked] = useState(false);
  const [viewingTxn, setViewingTxn] = useState<Transaction | null>(null);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [revertingEntry, setRevertingEntry] = useState<InstallmentPaymentHistory | null>(null);
  const [revertSubmitting, setRevertSubmitting] = useState(false);
  const [transactionsSince, setTransactionsSince] = useState<
    Array<{ id: string; description: string; amount: number; type: string; transaction_date: string; created_at: string; account_id: string }>
  >([]);
  const [loadingTransactionsSince, setLoadingTransactionsSince] = useState(false);
  const [deleteTransactionsSince, setDeleteTransactionsSince] = useState(true);
  const tabParam = searchParams.get('tab');
  const initialTab: 'schedule' | 'adjust' | 'history' =
    tabParam === 'adjust' || tabParam === 'history' ? tabParam : 'schedule';
  const [activeTab, setActiveTab] = useState<'schedule' | 'adjust' | 'history'>(initialTab);

  // Plan-derived data
  const linkedTransactions = useMemo(
    () => (plan ? transactions.filter((tx) => tx.installment_payment_id === plan.id) : []),
    [transactions, plan]
  );
  const account = useMemo(
    () => (plan ? accounts.find((a) => a.id === plan.account_id) : null),
    [accounts, plan]
  );
  const category = useMemo(
    () => (plan && plan.category_id ? categories.find((c) => c.id === plan.category_id) : null),
    [categories, plan]
  );

  // Personalized schedule rows for this plan. When non-empty the plan
  // has a custom schedule (variable dates and/or amounts) and the
  // timeline below should render from these instead of regenerating
  // dates from start_date + frequency.
  const [planRecords, setPlanRecords] = useState<InstallmentRecord[]>([]);
  useEffect(() => {
    if (!plan) {
      setPlanRecords([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('installment_payment_records')
        .select('id, scheduled_date, scheduled_amount, is_paid, paid_date, actual_amount, transaction_id')
        .eq('installment_payment_id', plan.id)
        .order('scheduled_date', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('Failed to fetch installment records', error);
        setPlanRecords([]);
        return;
      }
      setPlanRecords(
        (data ?? []).map((r) => ({
          id: r.id as string,
          scheduled_date: r.scheduled_date as string,
          scheduled_amount: Number(r.scheduled_amount),
          is_paid: !!r.is_paid,
          paid_date: (r.paid_date as string | null) ?? null,
          actual_amount: r.actual_amount != null ? Number(r.actual_amount) : null,
          transaction_id: (r.transaction_id as string | null) ?? null,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
    // Re-fetch when the plan id changes or when linked transactions
    // change (the processor may have updated is_paid + transaction_id).
  }, [plan, linkedTransactions.length]);

  // When opening the undo dialog, fetch transactions created since that entry
  useEffect(() => {
    if (!revertingEntry) {
      setTransactionsSince([]);
      setDeleteTransactionsSince(true);
      return;
    }
    let cancelled = false;
    setLoadingTransactionsSince(true);
    fetchTransactionsSinceEntry(revertingEntry.id).then(({ transactions: txs }) => {
      if (!cancelled) {
        setTransactionsSince(txs);
        setLoadingTransactionsSince(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [revertingEntry?.id]);

  // Refresh history when the plan changes (id or any field that history might log)
  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    setLoadingHistory(true);
    fetchPaymentHistory(plan.id).then((data) => {
      if (!cancelled) {
        setHistory(data);
        setLoadingHistory(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [plan?.id, plan?.total_amount, plan?.installment_amount, plan?.remaining_amount]);

  if (loading) {
    return <LoadingSpinner text={t('common.loading')} />;
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-12">
        <div className="ft-page">
          <div className="ft-card flex flex-col items-center">
            <div className="ft-empty">
              <Receipt className="h-[26px] w-[26px]" />
              <div className="ft-empty-title">
                {t('installments.notFound', { defaultValue: 'Installment plan not found.' })}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 gap-1.5"
              onClick={() => navigate('/scheduled?tab=plans')}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('common.back', { defaultValue: 'Back' })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const paid = plan.total_amount - plan.remaining_amount;
  const progress =
    plan.total_amount > 0
      ? Math.min(100, Math.round((paid / plan.total_amount) * 1000) / 10)
      : 0;
  const nextDue = parseISO(plan.next_payment_date);
  const daysUntil = differenceInDays(nextDue, startOfDay(new Date()));

  const handleDeleteClick = async () => {
    setLoadingLinked(true);
    setShowDelete(true);
    const linked = await fetchLinkedTransactions(plan.id);
    setLinkedForDelete(linked);
    setLoadingLinked(false);
  };

  const handleDeleteConfirm = async () => {
    const { error } = await deleteInstallmentPayment(plan.id);
    if (error) {
      toast({
        title: t('common.error'),
        description: t('installments.ipCannotDelete'),
        variant: 'destructive',
      });
      return;
    }
    if (linkedForDelete.length > 0) await refetch();
    toast({
      title: t('installments.deletedTitle', { defaultValue: 'Plan deleted' }),
      description:
        linkedForDelete.length > 0
          ? t('installments.deletedWithTxns', {
              defaultValue:
                'Plan, its recurring transaction and {{n}} linked transaction(s) deleted.',
              n: linkedForDelete.length,
            })
          : t('installments.deletedNoTxns', {
              defaultValue: 'Plan and its recurring transaction deleted.',
            }),
    });
    navigate('/scheduled?tab=plans');
  };

  const handleComplete = async () => {
    const { error } = await completeInstallmentPayment(plan.id);
    if (error) {
      toast({
        title: t('common.error'),
        description: t('installments.ipCannotMarkDone'),
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: t('installments.completedTitle', { defaultValue: 'Plan completed' }),
      description: t('installments.completedDesc', {
        defaultValue: 'Marked as completed and archived.',
      }),
    });
  };

  // Timeline marker colours come from the system's tokens: semantic states
  // (`--pos`/`--neg`/`--warn`/`--info`) where the change has a direction, the
  // categorical chart ramp (`--cN`) for the rest — never raw palette hues,
  // which would not follow the theme into dark mode.
  const getChangeTypeLabel = (changeType: string) => {
    const labels: Record<string, { label: string; token: string }> = {
      created: { label: t('installments.h.created', { defaultValue: 'Created' }), token: '--pos' },
      updated: { label: t('installments.h.updated', { defaultValue: 'Updated' }), token: '--info' },
      amount_changed: { label: t('installments.h.amount', { defaultValue: 'Amount changed' }), token: '--warn' },
      completed: { label: t('installments.h.completed', { defaultValue: 'Completed' }), token: '--c5' },
      reactivated: { label: t('installments.h.reactivated', { defaultValue: 'Reactivated' }), token: '--c4' },
      recalculated: { label: t('installments.h.recalculated', { defaultValue: 'Recalculated' }), token: '--c8' },
      deleted: { label: t('installments.h.deleted', { defaultValue: 'Deleted' }), token: '--neg' },
    };
    return labels[changeType] || { label: changeType, token: '--c9' };
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        {/* Page head — identity on the left (back, eyebrow, title, tags),
            the plan's own actions on the right. Nothing docks or floats:
            the primary action lives here, like every other page. */}
        <div className="ft-page-head">
          <div className="flex items-start gap-3 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 flex-shrink-0 mt-1"
              onClick={() => navigate('/scheduled?tab=plans')}
              aria-label={t('common.back', { defaultValue: 'Back' })}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <div className="min-w-0">
              <div className="ft-eyebrow">
                {t('scheduled.pageTitle', { defaultValue: 'Scheduled' })}
              </div>
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h1 className="ft-page-title text-2xl min-w-0 truncate">{plan.description}</h1>
                <span className={plan.is_active ? 'ft-tag pos' : 'ft-tag'}>
                  {plan.is_active
                    ? t('installments.active', { defaultValue: 'Active' })
                    : t('installments.completed', { defaultValue: 'Completed' })}
                </span>
                {category && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                    style={{
                      background: `color-mix(in oklab, ${category.color} 15%, transparent)`,
                      color: category.color,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current flex-shrink-0" />
                    {category.name}
                  </span>
                )}
              </div>
              <div className="ft-page-sub">
                {plan.payment_type === 'reimbursement'
                  ? t('installments.reimbursement', { defaultValue: 'Reimbursement' })
                  : t('installments.payment', { defaultValue: 'Payment plan' })}
                {account && ` · ${account.name}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {plan.is_active && (
              <Button
                size="sm"
                className="h-8 px-3 gap-1.5 font-semibold"
                onClick={() => setShowRecord(true)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {t('installments.recordPayment', { defaultValue: 'Record a payment' })}
                </span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={t('common.moreActions', { defaultValue: 'More actions' })}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {plan.is_active && (
                  <DropdownMenuItem onSelect={handleComplete}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                    {t('installments.markComplete', { defaultValue: 'Mark complete' })}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleDeleteClick();
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  {t('common.delete', { defaultValue: 'Delete' })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Hero — what is left against the whole. */}
        <div className="ft-card">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-semibold">
                {t('installments.remaining', { defaultValue: 'Remaining' })}
              </div>
              <div
                className={cn(
                  'font-mono tabular-nums text-[25px] sm:text-[28px] font-medium tracking-[-0.02em] leading-none mt-1.5',
                  isPrivacyMode && 'ft-priv'
                )}
              >
                {formatCurrency(plan.remaining_amount)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-semibold">
                {t('installments.paid', { defaultValue: 'Paid' })}
              </div>
              <div
                className={cn(
                  'font-mono tabular-nums text-sm font-medium mt-1',
                  isPrivacyMode && 'ft-priv'
                )}
              >
                {formatCurrency(paid)} / {formatCurrency(plan.total_amount)}
              </div>
            </div>
          </div>
          {/* Direction carries the fill colour: money coming back is `pos`,
              money going out is the accent — matching the plan cards on the
              Échéancier list. */}
          <div className="ft-progress-track tall mt-3.5">
            <span
              className="ft-progress-fill"
              style={{
                width: `${progress}%`,
                background:
                  plan.payment_type === 'reimbursement'
                    ? 'hsl(var(--pos))'
                    : 'hsl(var(--primary))',
              }}
            />
          </div>
          <div className="flex justify-between gap-2 text-[11px] text-fg-dim mt-1.5">
            <span>
              {planRecords.length > 0 ? (
                // Custom schedule: per-installment amount/frequency varies, so
                // showing "X/mo" would be misleading.
                <>{t('installments.variableSchedule', { defaultValue: 'Custom schedule' })}</>
              ) : (
                plan.installment_amount > 0 && (
                  <>
                    <span className={cn('font-mono tabular-nums', isPrivacyMode && 'ft-priv')}>
                      {formatCurrency(plan.installment_amount)}
                    </span>{' '}
                    /
                    {plan.frequency === 'weekly'
                      ? ` ${t('installments.wk', { defaultValue: 'wk' })}`
                      : plan.frequency === 'quarterly'
                      ? ` ${t('installments.qtr', { defaultValue: 'qtr' })}`
                      : ` ${t('installments.mo', { defaultValue: 'mo' })}`}
                  </>
                )
              )}
            </span>
            <span>
              {t('installments.nextCharge', { defaultValue: 'Next charge' })}:{' '}
              {format(nextDue, 'PP', { locale: dateLocale })}{' '}
              {plan.is_active && (
                <span>
                  ·{' '}
                  {daysUntil < 0
                    ? t('installments.overdue', { defaultValue: 'overdue' })
                    : daysUntil === 0
                    ? t('installments.today', { defaultValue: 'today' })
                    : t('installments.inDays', {
                        defaultValue: 'in {{n}} days',
                        n: daysUntil,
                      })}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* The three views are peers of the same plan, so they get the design
            system's segmented control (same treatment as the Scheduled page
            one level up), not a bespoke tab strip. */}
        <div
          role="tablist"
          aria-label={t('installments.planViews', { defaultValue: 'Plan views' })}
          className="max-w-full overflow-x-auto [scrollbar-width:none]"
        >
          <div className="ft-seg">
            {(
              [
                {
                  key: 'schedule',
                  Icon: CalendarDays,
                  label: t('installments.scheduleTab', { defaultValue: 'Schedule' }),
                },
                {
                  key: 'adjust',
                  Icon: SlidersHorizontal,
                  label: t('installments.adjustTab', { defaultValue: 'Adjust' }),
                },
                {
                  key: 'history',
                  Icon: HistoryIcon,
                  label: t('installments.historyTab', { defaultValue: 'History' }),
                },
              ] as const
            ).map(({ key, Icon, label }) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn('inline-flex items-center gap-1.5', activeTab === key && 'active')}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'schedule' && (
          <>
            <InstallmentScheduleTimeline
              plan={plan}
              accountName={account?.name ?? null}
              linkedTransactions={linkedTransactions}
              scheduleRecords={planRecords}
              onTransactionClick={(tx) => setViewingTxn(tx)}
            />
            {linkedTransactions.length > 0 && (
              <div className="ft-card flush">
                <div className="ft-card-head">
                  <div className="ft-row min-w-0">
                    <Receipt className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    <span className="ft-card-title">
                      {t('installments.linkedTxns', { defaultValue: 'Linked transactions' })}
                    </span>
                  </div>
                  <span className="ft-tag font-mono">{linkedTransactions.length}</span>
                </div>
                <div>
                  {linkedTransactions
                    .slice()
                    .sort(
                      (a, b) =>
                        parseISO(b.transaction_date).getTime() -
                        parseISO(a.transaction_date).getTime()
                    )
                    .map((tx) => (
                      <button
                        key={tx.id}
                        type="button"
                        onClick={() => setViewingTxn(tx)}
                        className="ft-list-row plain"
                      >
                        <div className="min-w-0">
                          <p className="ft-row-title truncate">{tx.description}</p>
                          <p className="ft-row-sub">
                            {format(parseISO(tx.transaction_date), 'PP', { locale: dateLocale })}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'ft-row-amt whitespace-nowrap',
                            tx.type === 'income' && 'text-pos',
                            isPrivacyMode && 'ft-priv'
                          )}
                        >
                          {tx.type === 'income' ? '+' : '−'}
                          {formatCurrency(tx.amount)}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'adjust' && (
          <div className="ft-card">
            <AdjustPlanForm plan={plan} />
          </div>
        )}

        {activeTab === 'history' &&
          (loadingHistory ? (
            <InlineSpinner />
          ) : history.length === 0 ? (
            <div className="ft-card flush">
              <div className="ft-empty">
                <HistoryIcon className="h-[26px] w-[26px]" />
                <div className="ft-empty-title">
                  {t('installments.noHistory', { defaultValue: 'No history yet.' })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((entry) => {
                const typeInfo = getChangeTypeLabel(entry.change_type);
                const isRevertible =
                  entry.change_type !== 'created' &&
                  entry.change_type !== 'deleted' &&
                  !!entry.old_values &&
                  Object.keys(entry.old_values).length > 0;

                // Render fields that have an old → new pair. Falls back to
                // old_values keys for change types (recalculated, completed,
                // reactivated) that don't always populate new_values.
                const diffKeys = new Set<string>([
                  ...Object.keys(entry.new_values || {}),
                  ...Object.keys(entry.old_values || {}),
                ]);
                const diffRows = Array.from(diffKeys)
                  .filter((field) => fieldLabel(field, t) !== null)
                  .map((field) => ({
                    field,
                    label: fieldLabel(field, t)!,
                    oldVal: entry.old_values?.[field],
                    newVal: entry.new_values?.[field],
                  }))
                  .filter((r) => r.oldVal !== undefined || r.newVal !== undefined);

                return (
                  <div key={entry.id} className="ft-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="ft-swatch"
                          style={{ background: `hsl(var(${typeInfo.token}))` }}
                        />
                        <span className="text-xs sm:text-sm font-medium truncate">
                          {typeInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {format(parseISO(entry.created_at), 'PP p', { locale: dateLocale })}
                        </span>
                        {isRevertible && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRevertingEntry(entry);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-primary hover:bg-primary/10 transition-colors"
                            aria-label={t('installments.undoEntry', {
                              defaultValue: 'Undo this change',
                            })}
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span className="hidden sm:inline">
                              {t('installments.undoShort', { defaultValue: 'Undo' })}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    {diffRows.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {diffRows.map((r) => (
                          <div
                            key={r.field}
                            className="flex items-baseline gap-1.5 flex-wrap text-[11px] sm:text-xs"
                          >
                            <span className="text-muted-foreground">{r.label}</span>
                            <span
                              className={cn(
                                'font-mono tabular-nums text-neg line-through opacity-80',
                                isPrivacyMode && NUMERIC_FIELDS.has(r.field) && 'ft-priv'
                              )}
                            >
                              {formatHistoryValue(r.oldVal, r.field, formatCurrency, t)}
                            </span>
                            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
                            <span
                              className={cn(
                                'font-mono tabular-nums text-pos font-medium',
                                isPrivacyMode && NUMERIC_FIELDS.has(r.field) && 'ft-priv'
                              )}
                            >
                              {formatHistoryValue(r.newVal, r.field, formatCurrency, t)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {entry.change_description && diffRows.length === 0 && (
                      <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                        {entry.change_description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
      </div>

      <RecordInstallmentPaymentModal
        open={showRecord}
        onOpenChange={setShowRecord}
        installmentPaymentId={plan.id}
      />

      {viewingTxn && (
        <TransactionDetailModal
          transaction={viewingTxn}
          open={!!viewingTxn}
          onOpenChange={(open) => !open && setViewingTxn(null)}
          onEdit={(tx) => {
            setViewingTxn(null);
            setEditingTxn(tx);
          }}
        />
      )}

      <EditTransactionModal
        open={!!editingTxn}
        onOpenChange={(open) => !open && setEditingTxn(null)}
        transaction={editingTxn}
      />

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent className="max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('installments.deleteConfirmTitle', { defaultValue: 'Delete installment plan?' })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {t('installments.deleteIrreversible', {
                    defaultValue:
                      'This is irreversible. The plan and its recurring transaction will be permanently deleted.',
                  })}
                </p>
                {loadingLinked ? (
                  <p className="text-muted-foreground text-sm">
                    {t('installments.loadingLinkedTxns', {
                      defaultValue: 'Loading linked transactions…',
                    })}
                  </p>
                ) : linkedForDelete.length > 0 ? (
                  <div className="space-y-2">
                    <p className="font-medium text-destructive">
                      {t('installments.alsoDeletingTxns', {
                        defaultValue: '{{n}} linked transaction(s) will also be deleted:',
                        n: linkedForDelete.length,
                      })}
                    </p>
                    <div className="max-h-[200px] overflow-y-auto rounded-md border bg-muted/50 divide-y">
                      {linkedForDelete.map((tx) => {
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
                                {format(parseISO(tx.transaction_date), 'PP', { locale: dateLocale })}
                                {accountName && ` · ${accountName}`}
                              </span>
                            </div>
                            <span
                              className={cn(
                                'font-mono tabular-nums font-medium whitespace-nowrap',
                                tx.type === 'income' ? 'text-pos' : 'text-neg',
                                isPrivacyMode && 'ft-priv'
                              )}
                            >
                              {tx.type === 'income' ? '+' : '−'}
                              {formatCurrency(tx.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t('installments.noLinkedTxns', { defaultValue: 'No linked transactions.' })}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete', { defaultValue: 'Delete' })}
              {linkedForDelete.length > 0 ? ` (${linkedForDelete.length + 1})` : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!revertingEntry}
        onOpenChange={(open) => !open && setRevertingEntry(null)}
      >
        <AlertDialogContent className="max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-primary" />
              {t('installments.undoTitle', { defaultValue: 'Undo this change?' })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  {t('installments.undoIntro', {
                    defaultValue:
                      'The plan will be restored to its state before this change. Later changes stay applied — you can keep undoing them one by one.',
                  })}
                </p>
                {revertingEntry?.old_values && (
                  <div className="rounded-md border bg-muted/40 divide-y divide-border text-[12px]">
                    {Object.entries(revertingEntry.old_values).map(([field, value]) => {
                      const labels: Record<string, string> = {
                        total_amount: t('installments.total', { defaultValue: 'Total' }),
                        installment_amount: t('installments.perInstallment', {
                          defaultValue: 'Per installment',
                        }),
                        remaining_amount: t('installments.remaining', {
                          defaultValue: 'Remaining',
                        }),
                        frequency: t('installments.frequency', { defaultValue: 'Frequency' }),
                        description: t('common.description', { defaultValue: 'Description' }),
                        next_payment_date: t('installments.nextCharge', {
                          defaultValue: 'Next charge',
                        }),
                        is_active: t('installments.status', { defaultValue: 'Status' }),
                        payment_type: t('installments.type', { defaultValue: 'Type' }),
                      };
                      const label = labels[field] || field;
                      const display =
                        typeof value === 'number'
                          ? formatCurrency(value)
                          : typeof value === 'boolean'
                          ? value
                            ? t('installments.active', { defaultValue: 'Active' })
                            : t('installments.completed', { defaultValue: 'Completed' })
                          : String(value);
                      return (
                        <div
                          key={field}
                          className="flex items-center justify-between px-3 py-1.5"
                        >
                          <span className="text-muted-foreground">{label}</span>
                          <span
                            className={cn(
                              'font-mono font-medium tabular-nums',
                              isPrivacyMode && typeof value === 'number' && 'ft-priv'
                            )}
                          >
                            {display}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {loadingTransactionsSince ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : transactionsSince.length > 0 ? (
                  <div className="space-y-2 rounded-md border border-warn/40 bg-[hsl(var(--warn-soft))] p-2.5">
                    <div className="flex items-start gap-2">
                      <Receipt className="h-3.5 w-3.5 text-warn mt-0.5 flex-shrink-0" />
                      <div className="text-[12px] leading-relaxed">
                        <p className="font-medium">
                          {t('installments.undoTxnsSince', {
                            defaultValue:
                              '{{n}} transaction(s) have been linked to this plan since the change:',
                            n: transactionsSince.length,
                          })}
                        </p>
                        <p className="text-muted-foreground mt-0.5">
                          {t('installments.undoTxnsSinceHint', {
                            defaultValue:
                              'If kept, they will no longer match the reverted plan. The Adjust tab will flag the drift.',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="max-h-[160px] overflow-y-auto rounded bg-background/50 divide-y divide-border">
                      {transactionsSince.map((tx) => {
                        const accountName = accounts.find((a) => a.id === tx.account_id)?.name;
                        return (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{tx.description}</p>
                              <p className="text-muted-foreground">
                                {format(parseISO(tx.transaction_date), 'PP', { locale: dateLocale })}
                                {accountName && ` · ${accountName}`}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'font-mono tabular-nums font-semibold whitespace-nowrap text-neg',
                                isPrivacyMode && 'ft-priv'
                              )}
                            >
                              −{formatCurrency(tx.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer pt-1">
                      <Checkbox
                        checked={deleteTransactionsSince}
                        onCheckedChange={(v) => setDeleteTransactionsSince(v === true)}
                        className="mt-0.5"
                      />
                      <span className="text-[12px] leading-relaxed">
                        {t('installments.undoDeleteTxns', {
                          defaultValue:
                            'Also delete these {{n}} transaction(s). Account balances will be recomputed.',
                          n: transactionsSince.length,
                        })}
                      </span>
                    </label>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {t('installments.undoDriftNote', {
                      defaultValue:
                        'Undoing an older edit may create drift between the plan and its linked transactions; the Adjust tab will flag it.',
                    })}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertSubmitting}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={revertSubmitting || loadingTransactionsSince}
              onClick={async () => {
                if (!revertingEntry) return;
                setRevertSubmitting(true);
                const { error, deletedTransactionsCount } = await revertInstallmentHistoryEntry(
                  revertingEntry.id,
                  { deleteTransactionsAfter: deleteTransactionsSince && transactionsSince.length > 0 }
                );
                setRevertSubmitting(false);
                if (error) {
                  toast({
                    title: t('common.error'),
                    description: error.message,
                    variant: 'destructive',
                  });
                  return;
                }
                toast({
                  title: t('installments.undoneTitle', { defaultValue: 'Change reverted' }),
                  description:
                    deletedTransactionsCount > 0
                      ? t('installments.undoneWithTxnsDesc', {
                          defaultValue:
                            'Previous values restored and {{n}} linked transaction(s) deleted.',
                          n: deletedTransactionsCount,
                        })
                      : t('installments.undoneDesc', {
                          defaultValue: 'Previous values restored.',
                        }),
                });
                setRevertingEntry(null);
                // The transactions deletion has already mutated the global feed
                // via Supabase realtime, but force-refresh just in case.
                if (deletedTransactionsCount > 0) await refetch();
                const data = await fetchPaymentHistory(plan.id);
                setHistory(data);
              }}
            >
              {revertSubmitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {transactionsSince.length > 0 && deleteTransactionsSince
                ? t('installments.undoConfirmWithTxns', {
                    defaultValue: 'Undo + delete {{n}} txns',
                    n: transactionsSince.length,
                  })
                : t('installments.undoConfirm', { defaultValue: 'Undo change' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const NUMERIC_FIELDS = new Set(['total_amount', 'installment_amount', 'remaining_amount', 'total_paid']);
const BOOLEAN_FIELDS = new Set(['is_active']);
const DATE_FIELDS = new Set(['next_payment_date', 'start_date', 'end_date']);

function fieldLabel(field: string, t: TFunction): string | null {
  const map: Record<string, string> = {
    total_amount: t('installments.total', { defaultValue: 'Total' }),
    installment_amount: t('installments.perInstallment', { defaultValue: 'Per installment' }),
    remaining_amount: t('installments.remaining', { defaultValue: 'Remaining' }),
    frequency: t('installments.frequency', { defaultValue: 'Frequency' }),
    description: t('common.description', { defaultValue: 'Description' }),
    next_payment_date: t('installments.nextCharge', { defaultValue: 'Next charge' }),
    start_date: t('installments.startDate', { defaultValue: 'Start date' }),
    end_date: t('installments.endDate', { defaultValue: 'End date' }),
    is_active: t('installments.status', { defaultValue: 'Status' }),
    payment_type: t('installments.type', { defaultValue: 'Type' }),
    account_id: t('common.account', { defaultValue: 'Account' }),
    category_id: t('common.category', { defaultValue: 'Category' }),
    total_paid: t('installments.paidSoFar', { defaultValue: 'Paid so far' }),
  };
  return map[field] ?? null;
}

function formatHistoryValue(
  raw: unknown,
  field: string,
  formatCurrency: (n: number) => string,
  t: TFunction
): string {
  if (raw === null || raw === undefined) return '—';
  if (NUMERIC_FIELDS.has(field) && typeof raw === 'number') {
    return formatCurrency(raw);
  }
  if (BOOLEAN_FIELDS.has(field)) {
    return raw
      ? t('installments.active', { defaultValue: 'Active' })
      : t('installments.completed', { defaultValue: 'Completed' });
  }
  if (DATE_FIELDS.has(field) && typeof raw === 'string') {
    try {
      return new Date(raw).toLocaleDateString();
    } catch {
      return raw;
    }
  }
  if (field === 'frequency' && typeof raw === 'string') {
    return raw === 'weekly'
      ? t('installments.weekly', { defaultValue: 'Weekly' })
      : raw === 'quarterly'
      ? t('installments.quarterly', { defaultValue: 'Quarterly' })
      : raw === 'monthly'
      ? t('installments.monthly', { defaultValue: 'Monthly' })
      : raw;
  }
  if (field === 'payment_type' && typeof raw === 'string') {
    return raw === 'reimbursement'
      ? t('installments.reimbursement', { defaultValue: 'Reimbursement' })
      : t('installments.payment', { defaultValue: 'Payment' });
  }
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

export default InstallmentPaymentDetail;
