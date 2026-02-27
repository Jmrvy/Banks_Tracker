import { useState } from "react";
import { CreditCard, Plus, MoreVertical, Pencil, Trash2, CheckCircle2, Receipt, RefreshCw, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const InstallmentPayments = () => {
  const { installmentPayments, loading, deleteInstallmentPayment, completeInstallmentPayment, recalculateInstallmentPayment } = useInstallmentPayments();
  const { accounts, categories } = useFinancialData();
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
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [adjustmentData, setAdjustmentData] = useState<{
    payment: InstallmentPayment;
    paymentAmount: number;
    newRemainingAmount: number;
  } | null>(null);

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
        description: `${result.linkedTransactionsCount} transaction(s) et ${result.paymentRecordsCount} enregistrement(s) pris en compte. Nouveau restant: ${formatCurrency(result.newRemainingAmount)}`,
      });
    }
  };

  const handleDeleteClick = (paymentId: string) => {
    setPaymentToDelete(paymentId);
    setDeleteDialogOpen(true);
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
      toast({
        title: "Paiement supprimé",
        description: "Le paiement échelonné et sa transaction récurrente associée ont été supprimés.",
      });
    }

    setDeleteDialogOpen(false);
    setPaymentToDelete(null);
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

  const handlePaymentRecorded = (
    payment: InstallmentPayment,
    paymentAmount: number,
    newRemainingAmount: number
  ) => {
    // Only show adjustment modal if there's still remaining amount
    if (newRemainingAmount > 0) {
      setAdjustmentData({
        payment,
        paymentAmount,
        newRemainingAmount,
      });
      setShowAdjustModal(true);
    }
  };

  // Filter payments based on selected tab
  const filteredPayments = installmentPayments.filter(payment => {
    if (filter === 'active') return payment.is_active;
    if (filter === 'completed') return !payment.is_active;
    return true; // 'all'
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 pb-20 md:pb-24">
      <div className="p-3 md:p-4 lg:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
              Paiements Échelonnés
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-2 ml-11 md:ml-13">
              Gérez vos paiements échelonnés financés par votre épargne
            </p>
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1 ml-11 md:ml-13">
              💡 Chaque paiement crée automatiquement une transaction récurrente
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

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="active">Actifs ({installmentPayments.filter(p => p.is_active).length})</TabsTrigger>
            <TabsTrigger value="completed">Terminés ({installmentPayments.filter(p => !p.is_active).length})</TabsTrigger>
            <TabsTrigger value="all">Tous ({installmentPayments.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Installment Payments List */}
        {filteredPayments.length === 0 ? (
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <CreditCard className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Aucun paiement échelonné</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Créez votre premier paiement en plusieurs fois pour commencer
              </p>
              <Button 
                onClick={() => setShowNewModal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Créer un paiement
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {filteredPayments.map((payment) => {
              const account = accounts.find(a => a.id === payment.account_id);
              const category = categories.find(c => c.id === payment.category_id);
              const progress = ((payment.total_amount - payment.remaining_amount) / payment.total_amount) * 100;

              return (
                <Card key={payment.id} className="bg-card/50 backdrop-blur border-border/50 hover:shadow-lg transition-all duration-200">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base md:text-lg font-semibold flex-1 min-w-0 truncate">{payment.description}</CardTitle>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant={payment.payment_type === 'reimbursement' ? "outline" : "secondary"}
                          className={`text-xs ${payment.payment_type === 'reimbursement' ? 'border-success text-success' : ''}`}
                        >
                          {payment.payment_type === 'reimbursement' ? '💰 Remboursement' : '💳 Paiement'}
                        </Badge>
                        <Badge
                          variant={payment.is_active ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {payment.is_active ? "Actif" : "Terminé"}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetails(payment)}>
                              <History className="h-4 w-4 mr-2" />
                              Détails & Historique
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewTransactions(payment)}>
                              <Receipt className="h-4 w-4 mr-2" />
                              Voir les transactions
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRecalculate(payment)}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Recalculer
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEdit(payment)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            {payment.is_active && (
                              <>
                                <DropdownMenuItem onClick={() => handleComplete(payment)}>
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Marquer comme terminé
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteClick(payment.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground text-xs">Progression</span>
                        <span className="font-semibold">{progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progress} className="h-2.5" />
                    </div>

                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Total:</span>
                        <span className="font-bold text-base">{formatCurrency(payment.total_amount)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Restant:</span>
                        <span className="font-bold text-base text-orange-500">{formatCurrency(payment.remaining_amount)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Mensualité:</span>
                        <span className="font-semibold">{formatCurrency(payment.installment_amount)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Fréquence:</span>
                        <span className="font-medium">{getFrequencyLabel(payment.frequency)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Prochain paiement:</span>
                        <span className="font-medium">{format(new Date(payment.next_payment_date), 'dd MMM yyyy', { locale: fr })}</span>
                      </div>
                      {account && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Compte:</span>
                          <span className="font-medium">{account.name}</span>
                        </div>
                      )}
                      {category && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Catégorie:</span>
                          <Badge variant="outline" className="gap-1.5">
                            <div 
                              className="w-2.5 h-2.5 rounded-full" 
                              style={{ backgroundColor: category.color }}
                            />
                            {category.name}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {payment.is_active && (
                      <Button
                        onClick={() => handleRecordPayment(payment)}
                        className="w-full"
                        size="sm"
                      >
                        Enregistrer un paiement
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
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
            onPaymentRecorded={handlePaymentRecorded}
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le paiement échelonné ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le paiement échelonné et sa transaction récurrente associée seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InstallmentPayments;