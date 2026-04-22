import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Repeat, Calendar, Trash2, Pause, Play, Plus, Pencil, List, CalendarDays, ChevronDown, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFinancialData, RecurringTransaction } from "@/hooks/useFinancialData";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useDebts } from "@/hooks/useDebts";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import NewRecurringTransactionModal from "@/components/NewRecurringTransactionModal";
import EditRecurringTransactionModal from "@/components/EditRecurringTransactionModal";
import RecurringCalendar from "@/components/RecurringCalendar";
import { RecordRecurringPaymentModal } from "@/components/RecordRecurringPaymentModal";
import { DebtDetailsModal } from "@/components/DebtDetailsModal";
import { differenceInDays, startOfDay } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";

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
  const [scheduledDebtPayments, setScheduledDebtPayments] = useState<any[]>([]);
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

  // Fetch all scheduled debt payments for calendar display
  useEffect(() => {
    const fetchScheduledDebtPayments = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('scheduled_debt_payments')
        .select('*')
        .eq('user_id', user.id)
        .order('scheduled_date', { ascending: true });
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


  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Hebdomadaire';
      case 'monthly': return 'Mensuelle';
      case 'quarterly': return 'Trimestrielle';
      case 'yearly': return 'Annuelle';
      default: return type;
    }
  };

  // Installment helpers for the list view
  const getInstallmentInfo = (transaction: RecurringTransaction) => {
    if (!transaction.installment_payment_id) return null;
    const ip = installmentPayments.find(p => p.id === transaction.installment_payment_id);
    if (!ip) return null;
    const paid = ip.total_amount - ip.remaining_amount;
    const paidCount = transactions.filter(tx => tx.installment_payment_id === ip.id).length;
    const rawTotalCount = ip.installment_amount > 0 ? Math.ceil(ip.total_amount / ip.installment_amount) : 0;
    // When completed (remaining_amount <= 0), clamp totalCount to paidCount
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

  // Resolve debt for a transaction: by debt_id or description fallback
  const resolveDebt = (transaction: RecurringTransaction) => {
    if (transaction.debt_id) return debts.find(d => d.id === transaction.debt_id) || null;
    for (const d of debts) {
      if (transaction.description.startsWith(d.description + ' (')) return d;
    }
    return null;
  };

  // Debt helpers for the list view
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

  // Split transactions into active and inactive for the list view
  const activeTransactions = recurringTransactions.filter(t => t.is_active);
  const inactiveTransactions = recurringTransactions.filter(t => !t.is_active);

  const renderListCard = (recurring: RecurringTransaction) => {
    const isExpanded = expandedListId === recurring.id;
    const nextDue = parseLocalDate(recurring.next_due_date);
    const today = startOfDay(new Date());
    const daysUntil = differenceInDays(nextDue, today);
    const installmentInfo = getInstallmentInfo(recurring);
    const debtInfo = getDebtInfo(recurring);

    // Determine the display amount: use next scheduled debt payment or debt payment_amount
    let listDisplayAmount = recurring.amount;
    if (debtInfo) {
      // Find next unpaid scheduled payment for this debt
      const nextScheduled = scheduledDebtPayments.find(sp => sp.debt_id === debtInfo.debt.id && !sp.is_paid);
      if (nextScheduled) {
        listDisplayAmount = nextScheduled.scheduled_amount;
      } else if (debtInfo.debt.payment_amount > 0) {
        listDisplayAmount = debtInfo.debt.payment_amount;
      }
    } else if (installmentInfo) {
      listDisplayAmount = installmentInfo.ip.installment_amount;
    }

    return (
      <Card
        key={recurring.id}
        className={`overflow-hidden border-border/50 ${recurring.is_active ? 'bg-card/80' : 'bg-card/50 opacity-70'}`}
      >
        {/* Main row */}
        <div
          className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setExpandedListId(isExpanded ? null : recurring.id)}
        >
          {/* Type indicator + status */}
          <div className={`flex-shrink-0 w-11 sm:w-12 h-11 sm:h-12 rounded-xl flex flex-col items-center justify-center ${
            !recurring.is_active ? 'bg-muted/30' : recurring.type === 'income' ? 'bg-success/10' : 'bg-destructive/10'
          }`}>
            <Repeat className={`h-4 w-4 sm:h-5 sm:w-5 ${
              !recurring.is_active ? 'text-muted-foreground' : recurring.type === 'income' ? 'text-success' : 'text-destructive'
            }`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className={`text-sm sm:text-base font-semibold truncate ${!recurring.is_active ? 'text-muted-foreground' : ''}`}>
                {recurring.description}
              </p>
            {!recurring.is_active && (() => {
              const instInfo = getInstallmentInfo(recurring);
              const isCompleted = instInfo?.isCompleted;
              return (
                <Badge variant={isCompleted ? "default" : "secondary"} className={`text-[9px] px-1.5 py-0 flex-shrink-0 ${isCompleted ? 'bg-success text-white' : ''}`}>
                  {isCompleted ? 'Terminé' : 'Inactif'}
                </Badge>
              );
            })()}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {recurring.is_active ? (
                  daysUntil < 0 ? 'En retard' :
                  daysUntil === 0 ? "Aujourd'hui" :
                  daysUntil === 1 ? 'Demain' :
                  `Dans ${daysUntil} jours`
                ) : (
                  getRecurrenceLabel(recurring.recurrence_type)
                )}
              </span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                · {getRecurrenceLabel(recurring.recurrence_type)}
              </span>
            </div>
            {installmentInfo && (
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {installmentInfo.paidCount} sur {installmentInfo.totalCount} payé · {installmentInfo.ip.payment_type === 'reimbursement' ? 'Remboursement' : 'Échelonné'}
              </span>
            )}
            {debtInfo && (
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {debtInfo.paidCount} sur {debtInfo.totalCount} payé · {debtInfo.debt.type === 'loan_received' ? 'Remboursement dette' : 'Remboursement prêt'}
              </span>
            )}
          </div>

          {/* Amount + chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-sm sm:text-base font-bold ${
              !recurring.is_active ? 'text-muted-foreground' : recurring.type === 'income' ? 'text-success' : 'text-destructive'
            }`}>
              {formatCurrency(listDisplayAmount)}
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-border/50 p-3 sm:p-4 space-y-4 bg-muted/10">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Fréquence</span>
                <span className="font-medium text-xs sm:text-sm">{getRecurrenceLabel(recurring.recurrence_type)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Compte</span>
                <span className="font-medium text-xs sm:text-sm truncate max-w-[150px]">{recurring.account?.name}</span>
              </div>
              {recurring.category && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Catégorie</span>
                  <Badge variant="outline" className="gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: recurring.category.color }} />
                    {recurring.category.name}
                  </Badge>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Prochain paiement</span>
                <span className={`font-medium text-xs sm:text-sm ${
                  recurring.is_active && daysUntil < 0 ? 'text-warning' : ''
                }`}>
                  {nextDue.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Début</span>
                <span className="font-medium text-xs sm:text-sm">
                  {parseLocalDate(recurring.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {recurring.end_date && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Fin</span>
                  <span className="font-medium text-xs sm:text-sm">
                    {parseLocalDate(recurring.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Statut</span>
                {(() => {
                  const instInfo = getInstallmentInfo(recurring);
                  const isCompleted = instInfo?.isCompleted;
                  return (
                    <Badge variant={recurring.is_active ? 'default' : isCompleted ? 'default' : 'secondary'} className={`text-xs ${isCompleted ? 'bg-success text-white' : ''}`}>
                      {recurring.is_active ? 'Actif' : isCompleted ? 'Terminé' : 'Inactif'}
                    </Badge>
                  );
                })()}
              </div>
            </div>

            {/* Installment progress */}
            {installmentInfo && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm sm:text-base font-bold">{formatCurrency(installmentInfo.paid)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Payé</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm sm:text-base font-bold">{formatCurrency(installmentInfo.ip.remaining_amount)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Restant</p>
                    </div>
                  </div>
                  <Progress value={installmentInfo.pct} className="h-2" />
                </div>

                {/* Payment timeline */}
                <div className="space-y-1">
                  {getPaymentHistory(recurring.installment_payment_id!).map((tx) => (
                    <div key={tx.id} className="flex items-center gap-2.5 py-1.5">
                      <div className="h-4 w-4 rounded-full bg-success flex items-center justify-center flex-shrink-0">
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-xs sm:text-sm flex-1">
                        {parseLocalDate(tx.transaction_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                      </span>
                      <span className="text-xs sm:text-sm font-medium">{formatCurrency(tx.amount)}</span>
                    </div>
                  ))}
                  {/* Next pending */}
                  {recurring.is_active && installmentInfo.ip.remaining_amount > 0 && (
                    <div className="flex items-center gap-2.5 py-1.5">
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                      <span className="text-xs sm:text-sm flex-1">
                        {nextDue.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                      </span>
                      <span className="text-xs sm:text-sm font-medium">
                        {formatCurrency(installmentInfo.ip.installment_amount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Debt progress */}
            {debtInfo && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm sm:text-base font-bold">{formatCurrency(debtInfo.paid)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Payé</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm sm:text-base font-bold">{formatCurrency(debtInfo.debt.remaining_amount)}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Restant</p>
                    </div>
                  </div>
                  <Progress value={debtInfo.pct} className="h-2" />
                </div>

                {/* Debt payment timeline */}
                <div className="space-y-1">
                  {getDebtPaymentHistoryForTransaction(recurring).map((dp) => (
                    <div key={dp.id} className="flex items-center gap-2.5 py-1.5">
                      <div className="h-4 w-4 rounded-full bg-success flex items-center justify-center flex-shrink-0">
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-xs sm:text-sm flex-1">
                        {parseLocalDate(dp.payment_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                      </span>
                      <span className="text-xs sm:text-sm font-medium">{formatCurrency(dp.amount)}</span>
                    </div>
                  ))}
                  {/* Next pending */}
                  {recurring.is_active && debtInfo.debt.remaining_amount > 0 && (
                    <div className="flex items-center gap-2.5 py-1.5">
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                      <span className="text-xs sm:text-sm flex-1">
                        {nextDue.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                      </span>
                      <span className="text-xs sm:text-sm font-medium">
                        {formatCurrency(listDisplayAmount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-border/50">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => setEditingTransaction(recurring)}>
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => handleToggleActive(recurring.id, recurring.is_active)}>
                {recurring.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {recurring.is_active ? 'Désactiver' : 'Activer'}
              </Button>
              <Button size="sm" variant="destructive" className="h-8 text-xs gap-1.5 px-3"
                onClick={() => handleDelete(recurring.id, recurring.description)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  };

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
                    {recurringTransactions.filter(t => t.is_active).length}
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
                    {recurringTransactions.filter(t => !t.is_active).length}
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
                    {recurringTransactions.filter(t => {
                      if (!t.is_active) return false;
                      const nextDue = parseLocalDate(t.next_due_date);
                      const today = new Date();
                      const inSevenDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
                      return nextDue <= inSevenDays;
                    }).length}
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
          <TabsContent value="list" className="mt-4 space-y-4">
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
                      {activeTransactions.map(renderListCard)}
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
                      {inactiveTransactions.map(renderListCard)}
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
