import { useState, useEffect, useRef } from "react";
import { parseLocalDate } from "@/lib/dateUtils";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Plus, Pencil, Trash2, CheckCircle2, Receipt, RefreshCw, History, Wallet, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useInstallmentPayments, InstallmentPayment } from "@/hooks/useInstallmentPayments";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { NewInstallmentPaymentModal } from "@/components/NewInstallmentPaymentModal";
import { EditInstallmentPaymentModal } from "@/components/EditInstallmentPaymentModal";
import { RecordInstallmentPaymentModal } from "@/components/RecordInstallmentPaymentModal";
import { AdjustInstallmentPlanModal } from "@/components/AdjustInstallmentPlanModal";
import { InstallmentTransactionsModal } from "@/components/InstallmentTransactionsModal";
import { InstallmentPaymentDetailsModal } from "@/components/InstallmentPaymentDetailsModal";
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


const InstallmentPayments = () => {
  const { installmentPayments, loading, deleteInstallmentPayment, completeInstallmentPayment, recalculateInstallmentPayment, fetchLinkedTransactions, detectOrphanedTransactions, deleteOrphanedTransactions } = useInstallmentPayments();
  const { accounts, categories, transactions, refetch } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const { toast } = useToast();
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<InstallmentPayment | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [linkedTransactionsToDelete, setLinkedTransactionsToDelete] = useState<Array<{ id: string; description: string; amount: number; type: string; transaction_date: string; account_id: string }>>([]);
  const [loadingLinkedTransactions, setLoadingLinkedTransactions] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [adjustmentData, setAdjustmentData] = useState<{
    payment: InstallmentPayment;
    paymentAmount: number;
    newRemainingAmount: number;
  } | null>(null);
  const [orphanedTransactions, setOrphanedTransactions] = useState<Array<{ id: string; description: string; amount: number; type: string; transaction_date: string; account_id: string }>>([]);
  const [orphanDialogOpen, setOrphanDialogOpen] = useState(false);

  // Detect orphaned transactions on load
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

  // Keep selectedPayment in sync with refreshed installmentPayments
  useEffect(() => {
    if (selectedPayment) {
      const updated = installmentPayments.find(ip => ip.id === selectedPayment.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedPayment)) {
        setSelectedPayment(updated);
      }
    }
  }, [installmentPayments]);

  // Deep-link: expand and scroll to highlighted payment from URL param
  useEffect(() => {
    const id = searchParams.get('highlight');
    if (id && installmentPayments.length > 0) {
      const payment = installmentPayments.find(ip => ip.id === id);
      if (payment) {
        // Switch filter to show the payment
        if (!payment.is_active) setFilter('all');
        setExpandedId(id);
        setHighlightId(id);
        // Clean up URL param
        searchParams.delete('highlight');
        setSearchParams(searchParams, { replace: true });
        // Scroll after a short delay to let DOM render
        setTimeout(() => {
          highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
        // Remove highlight after animation
        setTimeout(() => setHighlightId(null), 3000);
      }
    }
  }, [installmentPayments, searchParams]);

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'weekly': return 'Hebdomadaire';
      case 'monthly': return 'Mensuel';
      case 'quarterly': return 'Trimestriel';
      default: return frequency;
    }
  };

  const handleRecordPayment = (payment: InstallmentPayment) => {
    setSelectedPayment(payment);
    setShowRecordModal(true);
  };

  const handleEdit = (payment: InstallmentPayment) => {
    setSelectedPayment(payment);
    setShowEditModal(true);
  };

  const handleViewTransactions = (payment: InstallmentPayment) => {
    setSelectedPayment(payment);
    setShowTransactionsModal(true);
  };

  const handleViewDetails = (payment: InstallmentPayment) => {
    setSelectedPayment(payment);
    setShowDetailsModal(true);
  };

  const handleRecalculate = async (payment: InstallmentPayment) => {
    const { error, result } = await recalculateInstallmentPayment(payment.id);

    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible de recalculer le paiement échelonné.",
        variant: "destructive",
      });
    } else if (result) {
      toast({
        title: "Recalcul effectué",
        description: `${result.linkedTransactionsCount} transaction(s) prise(s) en compte. Nouveau restant: ${formatCurrency(result.newRemainingAmount)}, mensualité: ${formatCurrency(result.newInstallmentAmount)}`,
      });
    }
  };

  const handleDeleteClick = async (paymentId: string) => {
    setPaymentToDelete(paymentId);
    setLinkedTransactionsToDelete([]);
    setLoadingLinkedTransactions(true);
    setDeleteDialogOpen(true);

    const linked = await fetchLinkedTransactions(paymentId);
    setLinkedTransactionsToDelete(linked);
    setLoadingLinkedTransactions(false);
  };

  const handleDeleteConfirm = async () => {
    if (!paymentToDelete) return;

    const { error } = await deleteInstallmentPayment(paymentToDelete);

    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le paiement échelonné.",
        variant: "destructive",
      });
    } else {
      const txCount = linkedTransactionsToDelete.length;
      // Refetch accounts & transactions since linked transactions were deleted
      if (txCount > 0) {
        await refetch();
      }
      toast({
        title: "Paiement supprimé",
        description: txCount > 0
          ? `Le paiement échelonné, sa transaction récurrente et ${txCount} transaction(s) associée(s) ont été supprimés.`
          : "Le paiement échelonné et sa transaction récurrente associée ont été supprimés.",
      });
    }

    setDeleteDialogOpen(false);
    setPaymentToDelete(null);
    setLinkedTransactionsToDelete([]);
  };

  const handleComplete = async (payment: InstallmentPayment) => {
    const { error } = await completeInstallmentPayment(payment.id);

    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible de marquer le paiement comme terminé.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Paiement terminé",
        description: "Le paiement échelonné a été marqué comme terminé et archivé.",
      });
    }
  };

  // Get payment history for a specific installment
  const getPaymentHistory = (paymentId: string) => {
    return transactions
      .filter(tx => tx.installment_payment_id === paymentId)
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  };

  // Filter payments based on selected tab
  const filteredPayments = installmentPayments.filter(payment => {
    if (filter === 'active') return payment.is_active;
    if (filter === 'completed') return !payment.is_active;
    return true;
  });

  const renderPaymentCard = (payment: InstallmentPayment) => {
    const account = accounts.find(a => a.id === payment.account_id);
    const category = categories.find(c => c.id === payment.category_id);
    const paid = payment.total_amount - payment.remaining_amount;
    const progress = payment.total_amount > 0 ? Math.min(100, Math.round((paid / payment.total_amount) * 1000) / 10) : 0;
    const isExpanded = expandedId === payment.id;
    const nextDue = parseLocalDate(payment.next_payment_date);
    const today = startOfDay(new Date());
    const daysUntil = differenceInDays(nextDue, today);
    const paidCount = getPaymentHistory(payment.id).length;
    const rawTotalCount = payment.installment_amount > 0 ? Math.ceil(payment.total_amount / payment.installment_amount) : 0;
    // When payment is completed (remaining_amount <= 0), totalCount should equal paidCount
    const totalCount = payment.remaining_amount <= 0 ? paidCount : rawTotalCount;
    const paymentHistory = getPaymentHistory(payment.id);

    const isHighlighted = highlightId === payment.id;

    return (
      <Card
        key={payment.id}
        ref={isHighlighted ? highlightRef : undefined}
        className={`overflow-hidden border-border/50 transition-all duration-500 ${payment.is_active ? 'bg-card/80' : 'bg-card/50 opacity-70'} ${isHighlighted ? 'ring-2 ring-primary/50 shadow-lg shadow-primary/10' : ''}`}
      >
        {/* Main row */}
        <div
          className="flex items-center gap-2.5 sm:gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : payment.id)}
        >
          {/* Type indicator */}
          <div className={`flex-shrink-0 w-10 sm:w-12 h-10 sm:h-12 rounded-xl flex flex-col items-center justify-center ${
            !payment.is_active ? 'bg-muted/30' : payment.payment_type === 'reimbursement' ? 'bg-success/10' : 'bg-orange-500/10'
          }`}>
            <CreditCard className={`h-4 w-4 sm:h-5 sm:w-5 ${
              !payment.is_active ? 'text-muted-foreground' : payment.payment_type === 'reimbursement' ? 'text-success' : 'text-orange-500'
            }`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm sm:text-base font-semibold truncate ${!payment.is_active ? 'text-muted-foreground' : ''}`}>
              {payment.description}
            </p>
            <div className="flex items-center gap-1 mt-0.5 truncate">
              {payment.is_active ? (
                <>
                  <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                    {daysUntil < 0 ? 'En retard' :
                     daysUntil === 0 ? "Auj." :
                     daysUntil === 1 ? 'Demain' :
                     `${daysUntil}j`}
                  </span>
                  <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                    · {getFrequencyLabel(payment.frequency)}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-success flex-shrink-0" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">Terminé</span>
                </>
              )}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
              {paidCount}/{totalCount} payé · {formatCurrency(payment.installment_amount)}/éch.
            </p>
          </div>

          {/* Amount + chevron */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className="text-right">
              <span className={`text-xs sm:text-base font-bold whitespace-nowrap ${
                !payment.is_active ? 'text-muted-foreground' : 'text-orange-500'
              }`}>
                {formatCurrency(payment.remaining_amount)}
              </span>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">restant</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-border/50 p-3 sm:p-4 space-y-3 sm:space-y-4 bg-muted/10">
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs sm:text-base font-bold">{formatCurrency(paid)}</p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">Payé</p>
                </div>
                <div className="text-right">
                  <p className="text-xs sm:text-base font-bold">{formatCurrency(payment.remaining_amount)}</p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground">Restant</p>
                </div>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Details */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Total</span>
                <span className="font-bold text-[11px] sm:text-sm">{formatCurrency(payment.total_amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Échéance</span>
                <span className="font-medium text-[11px] sm:text-sm">{formatCurrency(payment.installment_amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Fréquence</span>
                <span className="font-medium text-[11px] sm:text-sm">{getFrequencyLabel(payment.frequency)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Prochain</span>
                <span className={`font-medium text-[11px] sm:text-sm whitespace-nowrap ${daysUntil < 0 ? 'text-warning' : ''}`}>
                  {nextDue.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {account && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Compte</span>
                  <span className="font-medium text-[11px] sm:text-sm truncate ml-2">{account.name}</span>
                </div>
              )}
              {category && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-[11px] sm:text-xs">Catégorie</span>
                  <Badge variant="outline" className="gap-1 text-[10px] sm:text-xs max-w-[50%] truncate">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
                    <span className="truncate">{category.name}</span>
                  </Badge>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Type</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] sm:text-xs ${payment.payment_type === 'reimbursement' ? 'border-success text-success' : ''}`}
                >
                  {payment.payment_type === 'reimbursement' ? 'Remb.' : 'Paiement'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-[11px] sm:text-xs">Statut</span>
                <Badge variant={payment.is_active ? 'default' : 'secondary'} className="text-[10px] sm:text-xs">
                  {payment.is_active ? 'Actif' : 'Terminé'}
                </Badge>
              </div>
            </div>

            {/* Payment timeline */}
            {paymentHistory.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1.5">Historique</p>
                {paymentHistory.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-2 py-1">
                    <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-success flex items-center justify-center flex-shrink-0">
                      <svg className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-[11px] sm:text-sm flex-1">
                      {parseLocalDate(tx.transaction_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-[11px] sm:text-sm font-medium whitespace-nowrap">{formatCurrency(tx.amount)}</span>
                  </div>
                ))}
                {/* Next pending payment */}
                {payment.is_active && payment.remaining_amount > 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                    <span className="text-[11px] sm:text-sm flex-1">
                      {nextDue.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-[11px] sm:text-sm font-medium whitespace-nowrap">
                      {formatCurrency(payment.installment_amount)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Record payment button */}
            {payment.is_active && (
              <Button
                size="sm"
                className="w-full h-8 sm:h-9 text-[11px] sm:text-sm gap-1.5"
                onClick={() => handleRecordPayment(payment)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Enregistrer un paiement
              </Button>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 pt-2 border-t border-border/50">
              <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
                onClick={() => handleViewDetails(payment)}>
                <History className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Détails</span>
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
                onClick={() => handleViewTransactions(payment)}>
                <Receipt className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Transactions</span>
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
                onClick={() => handleEdit(payment)}>
                <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Modifier</span>
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
                onClick={() => handleRecalculate(payment)}>
                <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Recalculer</span>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {payment.is_active && (
                <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3"
                  onClick={() => handleComplete(payment)}>
                  <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                  <span className="truncate">Terminer</span>
                </Button>
              )}
              <Button size="sm" variant="destructive" className={`h-8 text-[10px] sm:text-xs gap-1 px-1.5 sm:px-3 ${!payment.is_active ? 'col-span-2' : ''}`}
                onClick={() => handleDeleteClick(payment.id)}>
                <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                <span className="truncate">Supprimer</span>
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" role="status"></div>
          <p className="text-sm text-muted-foreground">Chargement des paiements échelonnés...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 pb-20 md:pb-24">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
              <div className="icon-badge icon-badge-md bg-primary/10">
                <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
              Paiements Échelonnés
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-2 ml-11 md:ml-13">
              Gérez vos paiements échelonnés financés par votre épargne
            </p>
          </div>
          <Button
            onClick={() => setShowNewModal(true)}
            size="default"
            className="w-full md:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nouveau Paiement
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="section-header text-[10px] sm:text-sm text-muted-foreground whitespace-nowrap">Total dû</p>
                  <div className="icon-badge icon-badge-sm bg-orange-500/10 flex-shrink-0 flex">
                    <Wallet className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-orange-500" />
                  </div>
                </div>
                <p className="text-sm sm:text-2xl font-bold break-all leading-tight">
                  {formatCurrency(installmentPayments.filter(p => p.is_active).reduce((sum, p) => sum + p.remaining_amount, 0))}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="section-header text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 whitespace-nowrap">Actifs</p>
                  <p className="text-base sm:text-2xl font-bold">
                    {installmentPayments.filter(p => p.is_active).length}
                  </p>
                </div>
                <div className="icon-badge icon-badge-sm bg-success/10 flex-shrink-0 flex">
                  <CreditCard className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="section-header text-[10px] sm:text-sm text-muted-foreground mb-0.5 sm:mb-1 whitespace-nowrap">Terminés</p>
                  <p className="text-base sm:text-2xl font-bold">
                    {installmentPayments.filter(p => !p.is_active).length}
                  </p>
                </div>
                <div className="icon-badge icon-badge-sm bg-muted/20 flex-shrink-0 flex">
                  <Clock className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 h-9 sm:h-10">
            <TabsTrigger value="active" className="text-[11px] sm:text-sm px-1 sm:px-3">Actifs ({installmentPayments.filter(p => p.is_active).length})</TabsTrigger>
            <TabsTrigger value="completed" className="text-[11px] sm:text-sm px-1 sm:px-3">Terminés ({installmentPayments.filter(p => !p.is_active).length})</TabsTrigger>
            <TabsTrigger value="all" className="text-[11px] sm:text-sm px-1 sm:px-3">Tous ({installmentPayments.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Payments List */}
        {filteredPayments.length === 0 ? (
          <Card>
            <CardContent className="p-8 sm:p-12 text-center">
              <div className="icon-badge icon-badge-lg bg-muted/50 mx-auto mb-3 sm:mb-4">
                <CreditCard className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
              </div>
              <h3 className="text-base sm:text-lg font-medium mb-2">Aucun paiement échelonné</h3>
              <p className="text-muted-foreground text-xs sm:text-sm mb-4">
                Créez votre premier paiement en plusieurs fois pour commencer
              </p>
              <Button onClick={() => setShowNewModal(true)} className="h-9 text-sm">
                <Plus className="h-4 w-4 mr-2" />
                Créer un paiement
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredPayments.map(renderPaymentCard)}
          </div>
        )}
      </div>

      <NewInstallmentPaymentModal
        open={showNewModal}
        onOpenChange={setShowNewModal}
      />

      {selectedPayment && (
        <>
          <EditInstallmentPaymentModal
            open={showEditModal}
            onOpenChange={setShowEditModal}
            installmentPayment={selectedPayment}
          />

          <RecordInstallmentPaymentModal
            open={showRecordModal}
            onOpenChange={setShowRecordModal}
            installmentPaymentId={selectedPayment.id}
          />

          <InstallmentTransactionsModal
            open={showTransactionsModal}
            onOpenChange={setShowTransactionsModal}
            installmentPayment={selectedPayment}
          />

          <InstallmentPaymentDetailsModal
            open={showDetailsModal}
            onOpenChange={setShowDetailsModal}
            installmentPayment={selectedPayment}
          />
        </>
      )}

      {adjustmentData && (
        <AdjustInstallmentPlanModal
          open={showAdjustModal}
          onOpenChange={setShowAdjustModal}
          installmentPayment={adjustmentData.payment}
          paymentAmount={adjustmentData.paymentAmount}
          newRemainingAmount={adjustmentData.newRemainingAmount}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setPaymentToDelete(null);
          setLinkedTransactionsToDelete([]);
        }
      }}>
        <AlertDialogContent className="max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le paiement échelonné ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Cette action est irréversible. Le paiement échelonné et sa transaction récurrente associée seront définitivement supprimés.</p>
                {loadingLinkedTransactions && (
                  <p className="text-muted-foreground text-sm">Chargement des transactions liées...</p>
                )}
                {!loadingLinkedTransactions && linkedTransactionsToDelete.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-destructive">
                      {linkedTransactionsToDelete.length} transaction(s) associée(s) seront également supprimée(s) :
                    </p>
                    <div className="max-h-[200px] overflow-y-auto rounded-md border bg-muted/50 divide-y">
                      {linkedTransactionsToDelete.map((tx) => {
                        const accountName = accounts.find(a => a.id === tx.account_id)?.name;
                        return (
                          <div key={tx.id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <div className="flex flex-col min-w-0 flex-1 mr-2">
                              <span className="truncate font-medium text-foreground">{tx.description}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(tx.transaction_date + 'T00:00:00').toLocaleDateString('fr-FR')}
                                {accountName && ` · ${accountName}`}
                              </span>
                            </div>
                            <span className={`font-medium whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-600' : 'text-destructive'}`}>
                              {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!loadingLinkedTransactions && linkedTransactionsToDelete.length === 0 && (
                  <p className="text-muted-foreground text-sm">Aucune transaction liée à supprimer.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer{linkedTransactionsToDelete.length > 0 ? ` (${linkedTransactionsToDelete.length + 1} éléments)` : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={orphanDialogOpen} onOpenChange={setOrphanDialogOpen}>
        <AlertDialogContent className="max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Transactions orphelines détectées</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {orphanedTransactions.length} transaction(s) sont liées à des paiements échelonnés qui n'existent plus. Souhaitez-vous les supprimer ?
                </p>
                <div className="max-h-[250px] overflow-y-auto rounded-md border bg-muted/50 divide-y">
                  {orphanedTransactions.map((tx) => {
                    const accountName = accounts.find(a => a.id === tx.account_id)?.name;
                    return (
                      <div key={tx.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="flex flex-col min-w-0 flex-1 mr-2">
                          <span className="truncate font-medium text-foreground">{tx.description}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(tx.transaction_date + 'T00:00:00').toLocaleDateString('fr-FR')}
                            {accountName && ` · ${accountName}`}
                          </span>
                        </div>
                        <span className={`font-medium whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-600' : 'text-destructive'}`}>
                          {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOrphanedTransactions([])}>Conserver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const ids = orphanedTransactions.map(tx => tx.id);
                const { error } = await deleteOrphanedTransactions(ids);
                if (error) {
                  toast({
                    title: "Erreur",
                    description: "Impossible de supprimer les transactions orphelines.",
                    variant: "destructive",
                  });
                } else {
                  await refetch();
                  toast({
                    title: "Transactions supprimées",
                    description: `${ids.length} transaction(s) orpheline(s) supprimée(s).`,
                  });
                }
                setOrphanedTransactions([]);
                setOrphanDialogOpen(false);
              }}
            >
              Supprimer ({orphanedTransactions.length})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InstallmentPayments;
