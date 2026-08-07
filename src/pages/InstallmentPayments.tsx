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
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { differenceInDays, startOfDay } from "date-fns";
import { ScheduledHeadSlot } from "@/components/scheduled/ScheduledHeadSlot";

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

    return (
      <button
        key={payment.id}
        ref={isHighlighted ? highlightRef : undefined}
        type="button"
        onClick={() => navigate(`/installment-payments/${payment.id}`)}
        className={`ft-card w-full text-left p-3 sm:p-4 transition-all duration-300 hover:bg-muted/30 ${
          !payment.is_active ? 'opacity-70' : ''
        } ${isHighlighted ? 'ring-2 ring-primary/50 shadow-lg shadow-primary/10' : ''}`}
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div
            className={`flex-shrink-0 w-10 sm:w-12 h-10 sm:h-12 rounded-xl flex items-center justify-center ${
              !payment.is_active
                ? 'bg-muted/30'
                : payment.payment_type === 'reimbursement'
                ? 'bg-success/10'
                : 'bg-orange-500/10'
            }`}
          >
            <CreditCard
              className={`h-4 w-4 sm:h-5 sm:w-5 ${
                !payment.is_active
                  ? 'text-muted-foreground'
                  : payment.payment_type === 'reimbursement'
                  ? 'text-success'
                  : 'text-orange-500'
              }`}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p
              className={`text-sm sm:text-base font-semibold truncate ${
                !payment.is_active ? 'text-muted-foreground' : ''
              }`}
            >
              {payment.description}
            </p>
            <div className="flex items-center gap-1 mt-0.5 truncate">
              {payment.is_active ? (
                <>
                  <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                    {daysUntil < 0
                      ? t('installments.overdue', { defaultValue: 'Overdue' })
                      : daysUntil === 0
                      ? t('installments.today', { defaultValue: 'Today' })
                      : daysUntil === 1
                      ? t('installments.tomorrow', { defaultValue: 'Tomorrow' })
                      : `${daysUntil}j`}
                  </span>
                  <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                    · {getFrequencyLabel(payment.frequency)}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-success flex-shrink-0" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                    {t('installments.completed', { defaultValue: 'Completed' })}
                  </span>
                </>
              )}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
              {paidCount}/{totalCount} ·{' '}
              {formatCurrency(payment.installment_amount)}/
              {payment.frequency === 'weekly'
                ? t('installments.wk', { defaultValue: 'wk' })
                : payment.frequency === 'quarterly'
                ? t('installments.qtr', { defaultValue: 'qtr' })
                : t('installments.mo', { defaultValue: 'mo' })}
            </p>
            <Progress value={progress} className="h-1 mt-1.5" />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className="text-right">
              <span
                className={`text-xs sm:text-base font-bold whitespace-nowrap ${
                  !payment.is_active ? 'text-muted-foreground' : 'text-orange-500'
                }`}
              >
                {formatCurrency(payment.remaining_amount)}
              </span>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                {t('installments.remaining', { defaultValue: 'remaining' })}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </div>
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

        {embedded && <ScheduledHeadSlot>{newButton}</ScheduledHeadSlot>}

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
            <div className="ft-kpi-value">
              {installmentPayments.filter((p) => p.is_active).length}
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
            <div className="ft-kpi-value">
              {installmentPayments.filter((p) => !p.is_active).length}
            </div>
          </div>
        </div>

        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as typeof filter)}
          className="w-full"
        >
          <TabsList className="grid w-full max-w-md grid-cols-3 h-9 sm:h-10">
            <TabsTrigger value="active" className="text-[11px] sm:text-sm px-1 sm:px-3">
              {t('installments.active', { defaultValue: 'Active' })} (
              {installmentPayments.filter((p) => p.is_active).length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-[11px] sm:text-sm px-1 sm:px-3">
              {t('installments.completed', { defaultValue: 'Completed' })} (
              {installmentPayments.filter((p) => !p.is_active).length})
            </TabsTrigger>
            <TabsTrigger value="all" className="text-[11px] sm:text-sm px-1 sm:px-3">
              {t('common.all', { defaultValue: 'All' })} ({installmentPayments.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
          <div className="space-y-2">{filteredPayments.map(renderPaymentCard)}</div>
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
                <div className="max-h-[250px] overflow-y-auto rounded-md border bg-muted/50 divide-y">
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
