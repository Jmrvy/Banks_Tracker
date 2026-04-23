import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { RecordRecurringPaymentModal } from "@/components/RecordRecurringPaymentModal";
import { DebtDetailsModal } from "@/components/DebtDetailsModal";
import { startOfDay } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import RecurringListCard from "@/components/RecurringListCard";

const RecurringTransactions = () => {
  const { toast } = useToast();
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

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const result = await updateRecurringTransaction(id, { is_active: !currentStatus });

    if (result?.error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier le statut de la transaction récurrente.",
        variant: "destructive"
      });
    } else {
      toast({
        title: currentStatus ? "Transaction désactivée" : "Transaction activée",
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
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la transaction récurrente.",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Transaction supprimée",
        description: "La transaction récurrente a été supprimée définitivement.",
      });
      fetchRecurringTransactions();
    }
  };

  const handleExecuteEarly = async (transactionId: string, executionDate: string) => {
    const result = await executeRecurringTransactionEarly(transactionId, executionDate);

    if (result?.error) {
      toast({
        title: "Erreur",
        description: "Impossible de passer la transaction.",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Transaction passée",
        description: "La transaction a été enregistrée et la prochaine échéance a été avancée.",
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 pb-24">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2 sm:gap-3">
                <div className="icon-badge icon-badge-md bg-primary/10">
                  <Repeat className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
                Transactions Récurrentes
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 ml-10 sm:ml-13">
                Gérez vos transactions automatiques
              </p>
            </div>
            <Button
              onClick={() => setShowNewRecurring(true)}
              className="h-8 sm:h-10 text-xs sm:text-sm"
            >
              <Plus className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Nouvelle</span>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="section-header text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 whitespace-nowrap">Active</p>
                  <p className="text-base sm:text-2xl font-bold">
                    {activeTransactions.length}
                  </p>
                </div>
                <div className="icon-badge icon-badge-sm bg-success/10 flex-shrink-0 flex">
                  <Play className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="section-header text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 whitespace-nowrap">Inactive</p>
                  <p className="text-base sm:text-2xl font-bold">
                    {inactiveTransactions.length}
                  </p>
                </div>
                <div className="icon-badge icon-badge-sm bg-muted/20 flex-shrink-0 flex">
                  <Pause className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="section-header text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 whitespace-nowrap">7 jours</p>
                  <p className="text-base sm:text-2xl font-bold">
                    {dueInSevenDaysCount}
                  </p>
                </div>
                <div className="icon-badge icon-badge-sm bg-warning/10 flex-shrink-0 flex">
                  <Calendar className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
              <Card>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-muted rounded w-1/3 mx-auto"></div>
                    <div className="grid grid-cols-7 gap-2">
                      {Array(35).fill(0).map((_, i) => (
                        <div key={i} className="aspect-square bg-muted rounded"></div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : recurringTransactions.length === 0 ? (
              <Card>
                <CardContent className="p-8 sm:p-12">
                  <div className="text-center">
                    <div className="icon-badge icon-badge-lg bg-muted/50 mx-auto mb-3 sm:mb-4">
                      <CalendarDays className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-base sm:text-lg font-medium mb-2">Aucune récurrente</h3>
                    <p className="text-muted-foreground text-xs sm:text-sm mb-4">
                      Créez votre première transaction récurrente.
                    </p>
                    <Button onClick={() => setShowNewRecurring(true)} className="h-9 text-sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Créer une Récurrente
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <RecurringCalendar
                transactions={recurringTransactions}
                actualTransactions={transactions}
                installmentPayments={installmentPayments}
                debts={debts}
                debtPayments={debtPayments}
                scheduledDebtPayments={scheduledDebtPayments}
                onEdit={setEditingTransaction}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                onExecuteEarly={handleExecuteEarly}
                onRecordPayment={(id) => setRecordPaymentForId(id)}
                onManageDebtPayment={(debtId) => setManagingDebtId(debtId)}
              />
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
              <Card>
                <CardContent className="p-8 sm:p-12">
                  <div className="text-center">
                    <div className="icon-badge icon-badge-lg bg-muted/50 mx-auto mb-3 sm:mb-4">
                      <Repeat className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-base sm:text-lg font-medium mb-2">Aucune récurrente</h3>
                    <p className="text-muted-foreground text-xs sm:text-sm mb-4">
                      Créez votre première transaction récurrente.
                    </p>
                    <Button onClick={() => setShowNewRecurring(true)} className="h-9 text-sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Créer une Récurrente
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
                            onEdit={setEditingTransaction}
                            onToggleActive={handleToggleActive}
                            onDelete={handleDelete}
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
                            onEdit={setEditingTransaction}
                            onToggleActive={handleToggleActive}
                            onDelete={handleDelete}
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
