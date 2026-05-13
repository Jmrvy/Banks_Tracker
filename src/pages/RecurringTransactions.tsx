import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Repeat, Calendar, Pause, Play, Plus, List, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFinancialData, RecurringTransaction } from "@/hooks/useFinancialData";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useDebts, ScheduledDebtPayment } from "@/hooks/useDebts";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import NewRecurringTransactionModal from "@/components/NewRecurringTransactionModal";
import EditRecurringTransactionModal from "@/components/EditRecurringTransactionModal";
import RecurringCalendar from "@/components/RecurringCalendar";
import { RecurringMonthlySummary } from "@/components/RecurringMonthlySummary";
import { RecordRecurringPaymentModal } from "@/components/RecordRecurringPaymentModal";
import { DebtDetailsModal } from "@/components/DebtDetailsModal";
import { startOfDay } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import RecurringListCard from "@/components/RecurringListCard";

interface RecurringTransactionsProps {
  /** When true, render only the body + modals, leaving the outer page chrome
   *  (`min-h-screen`, `ft-page`, `ft-page-head`) to the caller. Used by the
   *  unified `/scheduled` page so we don't duplicate the header. */
  embedded?: boolean;
}

const RecurringTransactions = ({ embedded = false }: RecurringTransactionsProps = {}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showNewRecurring, setShowNewRecurring] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<RecurringTransaction | null>(null);
  const [expandedListId, setExpandedListId] = useState<string | null>(null);
  const [recordPaymentForId, setRecordPaymentForId] = useState<string | null>(null);
  const [managingDebtId, setManagingDebtId] = useState<string | null>(null);
  const { formatCurrency } = useUserPreferences();
  const { installmentPayments } = useInstallmentPayments();
  const { debts, payments: debtPayments } = useDebts();
  const { user } = useAuth();
  const [scheduledDebtPayments, setScheduledDebtPayments] = useState<ScheduledDebtPayment[]>([]);
  const {
    recurringTransactions,
    transactions,
    loading,
    fetchRecurringTransactions,
    updateRecurringTransaction,
    deleteRecurringTransaction,
    executeRecurringTransactionEarly
  } = useFinancialData();

  useEffect(() => {
    fetchRecurringTransactions();
  }, [fetchRecurringTransactions]);

  useEffect(() => {
    const fetchScheduledDebtPayments = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('scheduled_debt_payments')
        .select('*')
        .eq('user_id', user.id)
        .order('scheduled_date', { ascending: true });
      if (error) {
        console.error('Error fetching scheduled debt payments:', error);
      }
      setScheduledDebtPayments(data || []);
    };
    fetchScheduledDebtPayments();
  }, [user]);

  const redirectIfLinked = (err: unknown): boolean => {
    const e = err as { message?: string; installment_payment_id?: string; debt_id?: string } | null | undefined;
    if (e?.message === 'linked_to_installment' && e.installment_payment_id) {
      toast({
        title: t('recurring.lockedByPlanTitle', { defaultValue: 'Managed by an installment plan' }),
        description: t('recurring.lockedByPlanDesc', {
          defaultValue: 'Open the plan to make changes.',
        }),
      });
      navigate(`/installment-payments/${e.installment_payment_id}`);
      return true;
    }
    if (e?.message === 'linked_to_debt' && e.debt_id) {
      toast({
        title: t('recurring.lockedByDebtTitle', { defaultValue: 'Managed by a debt' }),
        description: t('recurring.lockedByDebtDesc', {
          defaultValue: 'Open the debt to make changes.',
        }),
      });
      setManagingDebtId(e.debt_id);
      return true;
    }
    return false;
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const result = await updateRecurringTransaction(id, { is_active: !currentStatus });

    if (result?.error) {
      if (redirectIfLinked(result.error)) return;
      toast({
        title: t('common.error'),
        description: t('recurring.cannotChangeStatus'),
        variant: "destructive"
      });
    } else {
      toast({
        title: currentStatus ? t('recurring.transactionDeactivated') : t('recurring.transactionActivated'),
        description: `La transaction récurrente a été ${currentStatus ? 'désactivée' : 'activée'}.`,
      });
      fetchRecurringTransactions();
    }
  };

  const handleDelete = async (id: string, description: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement la transaction récurrente "${description}" ?`)) {
      return;
    }

    const result = await deleteRecurringTransaction(id);

    if (result?.error) {
      if (redirectIfLinked(result.error)) return;
      toast({
        title: t('common.error'),
        description: t('recurring.cannotDelete'),
        variant: "destructive"
      });
    } else {
      toast({
        title: t('recurring.transactionDeleted'),
        description: t('recurring.deletedDescription'),
      });
      fetchRecurringTransactions();
    }
  };

  // When the calendar or list tries to open the edit modal on a plan-linked
  // row, redirect to the owner instead.
  const handleEditAttempt = (recurring: RecurringTransaction) => {
    if (recurring.installment_payment_id) {
      navigate(`/installment-payments/${recurring.installment_payment_id}`);
      return;
    }
    const debt = resolveDebt(recurring);
    if (debt) {
      setManagingDebtId(debt.id);
      return;
    }
    setEditingTransaction(recurring);
  };

  const handleExecuteEarly = async (transactionId: string, executionDate: string) => {
    const result = await executeRecurringTransactionEarly(transactionId, executionDate);

    if (result?.error) {
      toast({
        title: t('common.error'),
        description: t('recurring.cannotPass'),
        variant: "destructive"
      });
    } else {
      toast({
        title: t('recurring.transactionPassed'),
        description: t('recurring.passedDescription'),
      });
    }
    return result;
  };

  const installmentTxCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.installment_payment_id) {
        map.set(tx.installment_payment_id, (map.get(tx.installment_payment_id) || 0) + 1);
      }
    }
    return map;
  }, [transactions]);

  const getInstallmentInfo = (transaction: RecurringTransaction) => {
    if (!transaction.installment_payment_id) return null;
    const ip = installmentPayments.find(p => p.id === transaction.installment_payment_id);
    if (!ip) return null;
    const paid = ip.total_amount - ip.remaining_amount;
    const paidCount = installmentTxCounts.get(ip.id) || 0;
    const rawTotalCount = ip.installment_amount > 0 ? Math.ceil(ip.total_amount / ip.installment_amount) : 0;
    const isCompleted = ip.remaining_amount <= 0;
    const totalCount = isCompleted ? paidCount : rawTotalCount;
    const pct = ip.total_amount > 0 ? Math.min(100, Math.round((paid / ip.total_amount) * 1000) / 10) : 0;
    return { ip, paid, paidCount, totalCount, pct, isCompleted };
  };

  const getPaymentHistory = (installmentPaymentId: string) => {
    return transactions
      .filter(tx => tx.installment_payment_id === installmentPaymentId)
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  };

  const resolveDebt = (transaction: RecurringTransaction) => {
    if (transaction.debt_id) return debts.find(d => d.id === transaction.debt_id) || null;
    for (const d of debts) {
      if (transaction.description.startsWith(d.description + ' (')) return d;
    }
    return null;
  };

  const getDebtInfo = (transaction: RecurringTransaction) => {
    const debt = resolveDebt(transaction);
    if (!debt) return null;
    const paid = debt.total_amount - debt.remaining_amount;
    const totalScheduled = scheduledDebtPayments.filter(sp => sp.debt_id === debt.id).length;
    const paidCount = scheduledDebtPayments.filter(sp => sp.debt_id === debt.id && sp.is_paid).length;
    const totalCount = totalScheduled > 0 ? totalScheduled : (debt.payment_amount > 0 ? Math.ceil(debt.total_amount / debt.payment_amount) : 1);
    const pct = debt.total_amount > 0 ? Math.min(100, Math.round((paid / debt.total_amount) * 1000) / 10) : 0;
    return { debt, paid, paidCount, totalCount, pct };
  };

  const getDebtPaymentHistoryForTransaction = (recurring: RecurringTransaction) => {
    const debt = resolveDebt(recurring);
    if (!debt) return [];
    return debtPayments
      .filter(dp => dp.debt_id === debt.id)
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  };

  const activeTransactions = useMemo(
    () => recurringTransactions.filter(t => t.is_active),
    [recurringTransactions]
  );

  const inactiveTransactions = useMemo(
    () => recurringTransactions.filter(t => !t.is_active),
    [recurringTransactions]
  );

  const dueInSevenDaysCount = useMemo(() => {
    const today = new Date();
    const inSevenDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    return activeTransactions.filter(t => parseLocalDate(t.next_due_date) <= inSevenDays).length;
  }, [activeTransactions]);

  const getListCardProps = useCallback((recurring: RecurringTransaction) => {
    const installmentInfo = getInstallmentInfo(recurring);
    const debtInfo = getDebtInfo(recurring);
    const today = startOfDay(new Date());

    let listDisplayAmount = recurring.amount;
    if (debtInfo) {
      const nextScheduled = scheduledDebtPayments.find(sp => sp.debt_id === debtInfo.debt.id && !sp.is_paid);
      if (nextScheduled) {
        listDisplayAmount = nextScheduled.scheduled_amount;
      } else if (debtInfo.debt.payment_amount > 0) {
        listDisplayAmount = debtInfo.debt.payment_amount;
      }
    } else if (installmentInfo) {
      listDisplayAmount = installmentInfo.ip.installment_amount;
    }

    const hasOverdueDebtPayment = debtInfo ? scheduledDebtPayments.some(
      sp => sp.debt_id === debtInfo.debt.id && sp.is_paid !== true && parseLocalDate(sp.scheduled_date) < today
    ) : false;

    const installmentPaymentHistory = recurring.installment_payment_id
      ? getPaymentHistory(recurring.installment_payment_id)
      : [];

    const debtPaymentHistory = getDebtPaymentHistoryForTransaction(recurring);

    return {
      installmentInfo,
      debtInfo,
      listDisplayAmount,
      hasOverdueDebtPayment,
      installmentPaymentHistory,
      debtPaymentHistory,
    };
  }, [installmentPayments, transactions, debts, debtPayments, scheduledDebtPayments]);

  // The "Add recurring" CTA is shown either inside the page-head (standalone
  // mode) or as a thin right-aligned bar above the tabs (embedded inside the
  // unified `/scheduled` page).
  const newButton = (
    <Button
      onClick={() => setShowNewRecurring(true)}
      size="sm"
      className="h-8 px-3 gap-1.5 font-semibold"
    >
      <Plus className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{t('recurring.newRecurring', { defaultValue: 'Add recurring' })}</span>
    </Button>
  );

  return (
    <div className={embedded ? "" : "min-h-screen bg-background pb-20 md:pb-12"}>
      <div className={embedded ? "" : "ft-page"}>

        {!embedded && (
          /* Page head — only when running as a standalone route. */
          <div className="ft-page-head">
            <div>
              <div className="ft-eyebrow">{t('navigation.tools')}</div>
              <h1 className="ft-page-title">{t('navigation.recurringTransactions')}</h1>
              <div className="ft-page-sub">
                {t('recurring.subtitle', { defaultValue: 'Manage your automatic transactions' })}
              </div>
            </div>
            {newButton}
          </div>
        )}

        {embedded && (
          /* Embedded: surface the primary CTA above the tabs so the user can
              still create a new recurring without the page head. */
          <div className="flex justify-end mb-3">{newButton}</div>
        )}

        {/* Tabs: Calendar / List */}
        <Tabs defaultValue="calendar" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-9 sm:h-10">
            <TabsTrigger value="calendar" className="text-xs sm:text-sm gap-1.5 sm:gap-2">
              <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Calendrier</span>
            </TabsTrigger>
            <TabsTrigger value="list" className="text-xs sm:text-sm gap-1.5 sm:gap-2">
              <List className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Liste</span>
            </TabsTrigger>
          </TabsList>

          {/* Calendar View */}
          <TabsContent value="calendar" className="mt-4">
            {loading ? (
              <div className="ft-card p-6">
                <div className="animate-pulse space-y-4" role="status">
                  <div className="h-8 bg-bg-subtle rounded w-1/3 mx-auto"></div>
                  <div className="grid grid-cols-7 gap-2">
                    {Array(35).fill(0).map((_, i) => (
                      <div key={i} className="aspect-square bg-bg-subtle rounded"></div>
                    ))}
                  </div>
                </div>
              </div>
            ) : recurringTransactions.length === 0 ? (
              <div className="ft-card p-8 sm:p-12">
                <div className="text-center">
                  <div className="h-14 w-14 rounded-2xl bg-bg-subtle mx-auto mb-3 sm:mb-4 grid place-items-center">
                      <CalendarDays className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-base sm:text-lg font-medium mb-2">Aucune récurrente</h3>
                    <p className="text-muted-foreground text-xs sm:text-sm mb-4">
                      Créez votre première transaction récurrente.
                    </p>
                  <Button onClick={() => setShowNewRecurring(true)} size="sm" className="h-8 text-sm gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Créer une Récurrente
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
                <RecurringCalendar
                  transactions={recurringTransactions}
                  actualTransactions={transactions}
                  installmentPayments={installmentPayments}
                  debts={debts}
                  debtPayments={debtPayments}
                  scheduledDebtPayments={scheduledDebtPayments}
                  onEdit={handleEditAttempt}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDelete}
                  onExecuteEarly={handleExecuteEarly}
                  onRecordPayment={(id) => setRecordPaymentForId(id)}
                  onManageDebtPayment={(debtId) => setManagingDebtId(debtId)}
                />
                <div className="flex flex-col gap-3">
                  {/* At-a-glance stats — moved here from the top of the page */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="ft-card p-2.5 sm:p-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="ft-kpi-icon pos h-6 w-6"><Play className="h-3 w-3" /></div>
                        <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground truncate">{t('recurring.active', { defaultValue: 'Active' })}</span>
                      </div>
                      <div className="font-mono text-lg sm:text-xl font-medium tracking-tight leading-none">{activeTransactions.length}</div>
                    </div>
                    <div className="ft-card p-2.5 sm:p-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="ft-kpi-icon h-6 w-6"><Pause className="h-3 w-3 text-muted-foreground" /></div>
                        <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground truncate">{t('recurring.inactive', { defaultValue: 'Inactive' })}</span>
                      </div>
                      <div className="font-mono text-lg sm:text-xl font-medium tracking-tight leading-none">{inactiveTransactions.length}</div>
                    </div>
                    <div className="ft-card p-2.5 sm:p-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="ft-kpi-icon warn h-6 w-6"><Calendar className="h-3 w-3" /></div>
                        <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-muted-foreground truncate">{t('recurring.next7d', { defaultValue: '7 days' })}</span>
                      </div>
                      <div className="font-mono text-lg sm:text-xl font-medium tracking-tight leading-none">{dueInSevenDaysCount}</div>
                    </div>
                  </div>
                  <RecurringMonthlySummary />
                </div>
              </div>
            )}
          </TabsContent>

          {/* List View - Klarna-style */}
          <TabsContent value="list" className="mt-4 space-y-4 md:max-w-3xl md:mx-auto">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-20 bg-muted rounded-lg"></div>
                  </div>
                ))}
              </div>
            ) : recurringTransactions.length === 0 ? (
              <div className="ft-card p-8 sm:p-12">
                <div className="text-center">
                  <div className="h-14 w-14 rounded-2xl bg-bg-subtle mx-auto mb-3 sm:mb-4 grid place-items-center">
                      <Repeat className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-base sm:text-lg font-medium mb-2">Aucune récurrente</h3>
                    <p className="text-muted-foreground text-xs sm:text-sm mb-4">
                      Créez votre première transaction récurrente.
                    </p>
                  <Button onClick={() => setShowNewRecurring(true)} size="sm" className="h-8 text-sm gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Créer une Récurrente
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Active transactions */}
                {activeTransactions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm sm:text-base font-bold">
                        Actives
                      </h3>
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        {activeTransactions.length} transaction{activeTransactions.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {activeTransactions.map(recurring => {
                        const props = getListCardProps(recurring);
                        return (
                          <RecurringListCard
                            key={recurring.id}
                            recurring={recurring}
                            isExpanded={expandedListId === recurring.id}
                            onToggleExpand={() => setExpandedListId(expandedListId === recurring.id ? null : recurring.id)}
                            installmentInfo={props.installmentInfo}
                            debtInfo={props.debtInfo}
                            listDisplayAmount={props.listDisplayAmount}
                            hasOverdueDebtPayment={props.hasOverdueDebtPayment}
                            installmentPaymentHistory={props.installmentPaymentHistory}
                            debtPaymentHistory={props.debtPaymentHistory}
                            formatCurrency={formatCurrency}
                            onEdit={handleEditAttempt}
                            onToggleActive={handleToggleActive}
                            onDelete={handleDelete}
                            onOpenDebt={setManagingDebtId}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Inactive transactions */}
                {inactiveTransactions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm sm:text-base font-bold text-muted-foreground">
                        Inactives
                      </h3>
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        {inactiveTransactions.length} transaction{inactiveTransactions.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {inactiveTransactions.map(recurring => {
                        const props = getListCardProps(recurring);
                        return (
                          <RecurringListCard
                            key={recurring.id}
                            recurring={recurring}
                            isExpanded={expandedListId === recurring.id}
                            onToggleExpand={() => setExpandedListId(expandedListId === recurring.id ? null : recurring.id)}
                            installmentInfo={props.installmentInfo}
                            debtInfo={props.debtInfo}
                            listDisplayAmount={props.listDisplayAmount}
                            hasOverdueDebtPayment={props.hasOverdueDebtPayment}
                            installmentPaymentHistory={props.installmentPaymentHistory}
                            debtPaymentHistory={props.debtPaymentHistory}
                            formatCurrency={formatCurrency}
                            onEdit={handleEditAttempt}
                            onToggleActive={handleToggleActive}
                            onDelete={handleDelete}
                            onOpenDebt={setManagingDebtId}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <NewRecurringTransactionModal
        open={showNewRecurring}
        onOpenChange={setShowNewRecurring}
      />

      <EditRecurringTransactionModal
        open={!!editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
        transaction={editingTransaction}
      />

      {recordPaymentForId && (
        <RecordRecurringPaymentModal
          open={!!recordPaymentForId}
          onOpenChange={(open) => !open && setRecordPaymentForId(null)}
          recurringTransactionId={recordPaymentForId}
        />
      )}

      {managingDebtId && (
        <DebtDetailsModal
          open={!!managingDebtId}
          onOpenChange={(open) => !open && setManagingDebtId(null)}
          debt={debts.find(d => d.id === managingDebtId) || null}
          onAddPayment={() => {}}
          onEdit={() => {}}
        />
      )}
    </div>
  );
};

export default RecurringTransactions;
