import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { differenceInDays, format, parseISO, startOfDay } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  History as HistoryIcon,
  Loader2,
  MoreVertical,
  Receipt,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useToast } from '@/hooks/use-toast';

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

  const {
    installmentPayments,
    loading,
    deleteInstallmentPayment,
    completeInstallmentPayment,
    fetchPaymentHistory,
    deleteHistoryEntry,
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">
          {t('installments.notFound', { defaultValue: 'Installment plan not found.' })}
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/scheduled?tab=plans')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          {t('common.back', { defaultValue: 'Back' })}
        </Button>
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

  const getChangeTypeLabel = (changeType: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      created: { label: t('installments.h.created', { defaultValue: 'Created' }), color: 'bg-green-500' },
      updated: { label: t('installments.h.updated', { defaultValue: 'Updated' }), color: 'bg-blue-500' },
      amount_changed: { label: t('installments.h.amount', { defaultValue: 'Amount changed' }), color: 'bg-orange-500' },
      completed: { label: t('installments.h.completed', { defaultValue: 'Completed' }), color: 'bg-purple-500' },
      reactivated: { label: t('installments.h.reactivated', { defaultValue: 'Reactivated' }), color: 'bg-cyan-500' },
      recalculated: { label: t('installments.h.recalculated', { defaultValue: 'Recalculated' }), color: 'bg-yellow-500' },
      deleted: { label: t('installments.h.deleted', { defaultValue: 'Deleted' }), color: 'bg-red-500' },
    };
    return labels[changeType] || { label: changeType, color: 'bg-gray-500' };
  };

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-12">
      <div className="ft-page">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-8 px-2 -ml-2"
            onClick={() => navigate('/scheduled?tab=plans')}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs sm:text-sm">{t('common.back', { defaultValue: 'Back' })}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
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

        {/* Hero */}
        <div className="ft-card p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                {plan.payment_type === 'reimbursement'
                  ? t('installments.reimbursement', { defaultValue: 'Reimbursement' })
                  : t('installments.payment', { defaultValue: 'Payment plan' })}
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-0.5 truncate">
                {plan.description}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <Badge variant={plan.is_active ? 'default' : 'secondary'} className="text-[10px]">
                  {plan.is_active
                    ? t('installments.active', { defaultValue: 'Active' })
                    : t('installments.completed', { defaultValue: 'Completed' })}
                </Badge>
                {account && (
                  <span className="text-[11px] text-muted-foreground truncate">{account.name}</span>
                )}
                {category && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-semibold">
                  {t('installments.remaining', { defaultValue: 'Remaining' })}
                </div>
                <div className="text-3xl sm:text-4xl font-semibold tabular-nums">
                  {formatCurrency(plan.remaining_amount)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-semibold">
                  {t('installments.paid', { defaultValue: 'Paid' })}
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {formatCurrency(paid)} / {formatCurrency(plan.total_amount)}
                </div>
              </div>
            </div>
            <Progress value={progress} className="h-2 mt-3" />
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
              <span>
                {plan.installment_amount > 0 && (
                  <>
                    {formatCurrency(plan.installment_amount)} /
                    {plan.frequency === 'weekly'
                      ? ` ${t('installments.wk', { defaultValue: 'wk' })}`
                      : plan.frequency === 'quarterly'
                      ? ` ${t('installments.qtr', { defaultValue: 'qtr' })}`
                      : ` ${t('installments.mo', { defaultValue: 'mo' })}`}
                  </>
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
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="mt-4">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="schedule" className="gap-1.5 text-xs sm:text-sm">
              <CalendarDays className="h-3.5 w-3.5" />
              {t('installments.scheduleTab', { defaultValue: 'Schedule' })}
            </TabsTrigger>
            <TabsTrigger value="adjust" className="gap-1.5 text-xs sm:text-sm">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t('installments.adjustTab', { defaultValue: 'Adjust' })}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
              <HistoryIcon className="h-3.5 w-3.5" />
              {t('installments.historyTab', { defaultValue: 'History' })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="mt-3 space-y-3">
            <InstallmentScheduleTimeline
              plan={plan}
              accountName={account?.name ?? null}
              linkedTransactions={linkedTransactions}
              onTransactionClick={(tx) => setViewingTxn(tx)}
            />
            {linkedTransactions.length > 0 && (
              <div className="ft-card p-3 sm:p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Receipt className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs sm:text-sm font-semibold">
                    {t('installments.linkedTxns', { defaultValue: 'Linked transactions' })}
                  </span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {linkedTransactions.length}
                  </Badge>
                </div>
                <div className="space-y-1.5">
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
                        className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-bg-subtle/40 hover:bg-bg-subtle text-left transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium truncate">{tx.description}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            {format(parseISO(tx.transaction_date), 'PP', { locale: dateLocale })}
                          </p>
                        </div>
                        <span className="text-xs sm:text-sm font-semibold text-destructive tabular-nums whitespace-nowrap">
                          −{formatCurrency(tx.amount)}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="adjust" className="mt-3">
            <div className="ft-card p-4 sm:p-5">
              <AdjustPlanForm plan={plan} />
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-3 space-y-2">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <div className="ft-card p-8 text-center">
                <HistoryIcon className="w-7 h-7 mb-2 mx-auto text-muted-foreground/50" />
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('installments.noHistory', { defaultValue: 'No history yet.' })}
                </p>
              </div>
            ) : (
              history.map((entry) => {
                const typeInfo = getChangeTypeLabel(entry.change_type);
                return (
                  <div key={entry.id} className="ft-card p-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${typeInfo.color}`} />
                        <span className="text-xs sm:text-sm font-medium truncate">
                          {typeInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {format(parseISO(entry.created_at), 'PP p', { locale: dateLocale })}
                        </span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { error } = await deleteHistoryEntry(entry.id);
                            if (!error) setHistory((prev) => prev.filter((h) => h.id !== entry.id));
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                          aria-label={t('installments.deleteEntry', {
                            defaultValue: 'Delete entry',
                          })}
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                    {entry.change_description && (
                      <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                        {entry.change_description}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky action bar */}
      {plan.is_active && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 flex gap-2">
            <Button onClick={() => setShowRecord(true)} className="flex-1 h-10 gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">
                {t('installments.recordPayment', { defaultValue: 'Record a payment' })}
              </span>
            </Button>
          </div>
        </div>
      )}

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
                              className={`font-medium whitespace-nowrap ${
                                tx.type === 'income' ? 'text-emerald-600' : 'text-destructive'
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
    </div>
  );
};

export default InstallmentPaymentDetail;
