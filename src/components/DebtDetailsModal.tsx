import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Debt, DebtPayment, useDebts } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  DollarSign,
  TrendingUp,
  Calendar,
  User,
  Percent,
  Loader2,
  CreditCard,
  ClipboardList,
  BarChart3,
  Trash2,
  CheckCircle2,
  Clock,
  Plus,
  Link,
} from 'lucide-react';
import { LinkDebtPaymentModal } from '@/components/LinkDebtPaymentModal';

interface ScheduledPayment {
  id: string;
  debt_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  actual_amount: number | null;
  is_paid: boolean | null;
  paid_date: string | null;
}

interface DebtDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: Debt | null;
  onAddPayment: (debt: Debt) => void;
  onEdit: (debt: Debt) => void;
}

export const DebtDetailsModal = ({
  open,
  onOpenChange,
  debt,
  onAddPayment,
  onEdit,
}: DebtDetailsModalProps) => {
  const { formatCurrency } = useUserPreferences();
  const { user } = useAuth();
  const { payments: allPayments, deletePayment, addPayment } = useDebts();
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedScheduledPayment, setSelectedScheduledPayment] = useState<ScheduledPayment | null>(null);

  const debtPayments = allPayments.filter(p => debt && p.debt_id === debt.id);

  useEffect(() => {
    if (open && debt) {
      fetchScheduledPayments();
    }
  }, [open, debt?.id]);

  const fetchScheduledPayments = async () => {
    if (!debt || !user) return;
    setLoadingSchedule(true);
    const { data } = await supabase
      .from('scheduled_debt_payments')
      .select('*')
      .eq('debt_id', debt.id)
      .eq('user_id', user.id)
      .order('scheduled_date', { ascending: true });
    setScheduledPayments(data || []);
    setLoadingSchedule(false);
  };

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleLinkPayment = (sp: ScheduledPayment) => {
    setSelectedScheduledPayment(sp);
    setLinkModalOpen(true);
  };

  const handleConfirmPayment = async (sp: ScheduledPayment) => {
    if (!user || !debt) return;
    setConfirmingId(sp.id);

    try {
      const paymentDate = sp.scheduled_date;
      const paymentAmount = sp.scheduled_amount;

      // Mark scheduled payment as paid
      await supabase
        .from('scheduled_debt_payments')
        .update({
          is_paid: true,
          paid_date: paymentDate,
          actual_amount: paymentAmount,
        })
        .eq('id', sp.id)
        .eq('user_id', user.id);

      // Record the debt payment
      await addPayment({
        debt_id: debt.id,
        amount: paymentAmount,
        payment_date: paymentDate,
        notes: `Échéance confirmée: ${format(new Date(paymentDate), 'dd MMM yyyy', { locale: fr })}`,
      });

      // Update debt remaining amount
      const newRemaining = Math.max(0, debt.remaining_amount - paymentAmount);
      const updates: Record<string, any> = { remaining_amount: newRemaining };
      if (newRemaining <= 0) {
        updates.status = 'completed';
      }

      await supabase
        .from('debts')
        .update(updates)
        .eq('id', debt.id)
        .eq('user_id', user.id);

      await fetchScheduledPayments();
    } catch (error) {
      console.error('Error confirming payment:', error);
    } finally {
      setConfirmingId(null);
    }
  };

  const handlePaymentRecorded = () => {
    fetchScheduledPayments();
  };

  if (!debt) return null;

  const progress = debt.total_amount > 0
    ? ((debt.total_amount - debt.remaining_amount) / debt.total_amount) * 100
    : 0;
  const amountPaid = debt.total_amount - debt.remaining_amount;

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'loan_given': return 'Prêt accordé';
      case 'loan_received': return 'Prêt contracté';
      default: return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-primary text-[10px] sm:text-xs">Actif</Badge>;
      case 'completed':
        return <Badge className="bg-success text-[10px] sm:text-xs">Terminé</Badge>;
      case 'defaulted':
        return <Badge className="bg-destructive text-[10px] sm:text-xs">Défaut</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px] sm:text-xs">{status}</Badge>;
    }
  };

  const getFrequencyLabel = (freq: string | null) => {
    if (!freq) return '-';
    switch (freq) {
      case 'monthly': return 'Mensuel';
      case 'quarterly': return 'Trimestriel';
      case 'semi_annual': return 'Semestriel';
      case 'annual': return 'Annuel';
      case 'weekly': return 'Hebdomadaire';
      default: return freq;
    }
  };

  const getLoanTypeLabel = (loanType: string | null) => {
    if (!loanType) return '-';
    switch (loanType) {
      case 'amortizable': return 'Amortissable';
      case 'bullet': return 'In fine';
      default: return loanType;
    }
  };

  const nextScheduled = scheduledPayments.find(sp => !sp.is_paid);
  const paidScheduled = scheduledPayments.filter(sp => sp.is_paid);
  const unpaidScheduled = scheduledPayments.filter(sp => !sp.is_paid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            <span className="truncate">{debt.description}</span>
            {getStatusBadge(debt.status)}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] sm:text-xs">{getTypeLabel(debt.type)}</Badge>
            {debt.loan_type && (
              <Badge variant="outline" className="text-[10px] sm:text-xs">{getLoanTypeLabel(debt.loan_type)}</Badge>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 mx-4 sm:mx-6 max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-3rem)] flex-shrink-0">
            <TabsTrigger value="overview" className="text-xs sm:text-sm gap-1">
              <BarChart3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Aperçu</span>
              <span className="sm:hidden">Aperçu</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs sm:text-sm gap-1">
              <CreditCard className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Paiements</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs sm:text-sm gap-1">
              <ClipboardList className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Échéancier</span>
              <span className="sm:hidden">Éch.</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-3 mt-3">
            {/* Progress card */}
            <div className="rounded-xl border p-3 sm:p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] sm:text-sm text-muted-foreground">Progression</span>
                <span className="text-[11px] sm:text-sm font-medium">{progress.toFixed(1)}%</span>
              </div>
              <Progress value={progress} className="h-2 sm:h-3 mb-3" />
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                <div className="bg-muted/50 rounded-lg p-1.5 sm:p-2">
                  <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Total</p>
                  <p className="text-[11px] sm:text-sm font-bold truncate">{formatCurrency(debt.total_amount)}</p>
                </div>
                <div className="bg-green-500/10 rounded-lg p-1.5 sm:p-2">
                  <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Payé</p>
                  <p className="text-[11px] sm:text-sm font-bold text-green-600 truncate">{formatCurrency(amountPaid)}</p>
                </div>
                <div className="bg-orange-500/10 rounded-lg p-1.5 sm:p-2">
                  <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Restant</p>
                  <p className="text-[11px] sm:text-sm font-bold text-orange-600 truncate">{formatCurrency(debt.remaining_amount)}</p>
                </div>
              </div>
            </div>

            {/* Details card */}
            <div className="rounded-xl border p-3 sm:p-4 space-y-2.5">
              {debt.interest_rate > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] sm:text-sm text-muted-foreground flex items-center gap-1.5">
                    <Percent className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    Taux d'intérêt
                  </span>
                  <span className="text-[11px] sm:text-sm font-medium">{debt.interest_rate}%</span>
                </div>
              )}
              {debt.payment_frequency && debt.payment_amount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] sm:text-sm text-muted-foreground flex items-center gap-1.5">
                    <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    Échéance
                  </span>
                  <span className="text-[11px] sm:text-sm font-medium">
                    {formatCurrency(debt.payment_amount)} / {getFrequencyLabel(debt.payment_frequency)?.toLowerCase()}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-[11px] sm:text-sm text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  Début
                </span>
                <span className="text-[11px] sm:text-sm font-medium">
                  {format(new Date(debt.start_date), 'dd MMM yyyy', { locale: fr })}
                </span>
              </div>
              {debt.end_date && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] sm:text-sm text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    Fin
                  </span>
                  <span className="text-[11px] sm:text-sm font-medium">
                    {format(new Date(debt.end_date), 'dd MMM yyyy', { locale: fr })}
                  </span>
                </div>
              )}
              {debt.contact_name && (
                <div className="flex justify-between items-center">
                  <span className="text-[11px] sm:text-sm text-muted-foreground flex items-center gap-1.5">
                    <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    Contact
                  </span>
                  <span className="text-[11px] sm:text-sm font-medium">
                    {debt.contact_name}
                    {debt.contact_info && <span className="text-muted-foreground ml-1">({debt.contact_info})</span>}
                  </span>
                </div>
              )}
            </div>

            {/* Next scheduled payment */}
            {nextScheduled && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase mb-1.5">Prochaine échéance</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm sm:text-base font-semibold">
                    {format(new Date(nextScheduled.scheduled_date), 'dd MMM yyyy', { locale: fr })}
                  </span>
                  <span className="text-sm sm:text-base font-bold text-primary">
                    {formatCurrency(nextScheduled.scheduled_amount)}
                  </span>
                </div>
              </div>
            )}

            {/* Notes */}
            {debt.notes && (
              <div className="rounded-xl border p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase mb-1.5">Notes</p>
                <p className="text-xs sm:text-sm text-foreground whitespace-pre-wrap">{debt.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {debt.status === 'active' && (
                <Button
                  onClick={() => { onAddPayment(debt); onOpenChange(false); }}
                  className="flex-1 h-9 text-xs sm:text-sm"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Ajouter un paiement
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => { onEdit(debt); onOpenChange(false); }}
                className="h-9 text-xs sm:text-sm"
              >
                Modifier
              </Button>
            </div>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 mt-3">
            {debtPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CreditCard className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs sm:text-sm">Aucun paiement enregistré</p>
                {debt.status === 'active' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { onAddPayment(debt); onOpenChange(false); }}
                    className="mt-3 h-8 text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Ajouter un paiement
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {debtPayments.length} paiement{debtPayments.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs sm:text-sm font-medium">
                    Total: {formatCurrency(debtPayments.reduce((s, p) => s + p.amount, 0))}
                  </p>
                </div>
                {debtPayments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border p-2.5 sm:p-3 group">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-green-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium">
                            {format(new Date(payment.payment_date), 'dd MMM yyyy', { locale: fr })}
                          </p>
                          {payment.notes && (
                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{payment.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-semibold text-green-600 whitespace-nowrap">
                          {formatCurrency(payment.amount)}
                        </span>
                        <button
                          onClick={async () => {
                            await deletePayment(payment.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 mt-3">
            {loadingSchedule ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : scheduledPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ClipboardList className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs sm:text-sm">Aucune échéance programmée</p>
                <p className="text-[10px] sm:text-xs mt-1">
                  Importez un prêt via PDF pour générer un échéancier
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg border p-2 sm:p-3">
                    <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Payées</p>
                    <p className="text-sm sm:text-lg font-bold text-green-600">{paidScheduled.length}</p>
                  </div>
                  <div className="rounded-lg border p-2 sm:p-3">
                    <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Restantes</p>
                    <p className="text-sm sm:text-lg font-bold text-orange-600">{unpaidScheduled.length}</p>
                  </div>
                </div>

                {/* Payment list */}
                <div className="space-y-1.5">
                  {scheduledPayments.map((sp, index) => {
                    const isPaid = sp.is_paid;
                    const isPast = new Date(sp.scheduled_date) < new Date() && !isPaid;
                    const isNext = sp.id === nextScheduled?.id;

                    return (
                      <div
                        key={sp.id}
                        className={`
                          flex items-center gap-2 sm:gap-3 rounded-lg border p-2 sm:p-2.5 transition-colors
                          ${isNext ? 'border-primary/40 bg-primary/5' : ''}
                          ${isPast ? 'border-destructive/30 bg-destructive/5' : ''}
                          ${isPaid ? 'opacity-60' : ''}
                        `}
                      >
                        <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center">
                          {isPaid ? (
                            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
                          ) : isPast ? (
                            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                          ) : (
                            <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">
                              {index + 1}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] sm:text-xs font-medium ${isPaid ? 'line-through' : ''}`}>
                            {format(new Date(sp.scheduled_date), 'dd MMM yyyy', { locale: fr })}
                          </p>
                          {isNext && (
                            <p className="text-[9px] sm:text-[10px] text-primary font-medium">Prochaine échéance</p>
                          )}
                          {isPast && (
                            <p className="text-[9px] sm:text-[10px] text-destructive font-medium">En retard</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[11px] sm:text-xs font-semibold whitespace-nowrap ${isPaid ? 'text-green-600' : ''}`}>
                            {formatCurrency(sp.actual_amount || sp.scheduled_amount)}
                          </span>
                          {!isPaid && (
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleConfirmPayment(sp)}
                                disabled={confirmingId === sp.id}
                                className="h-6 w-6 sm:h-7 sm:w-7"
                                title="Confirmer le paiement"
                              >
                                {confirmingId === sp.id ? (
                                  <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-600" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleLinkPayment(sp)}
                                className="h-6 w-6 sm:h-7 sm:w-7"
                                title="Lier une transaction"
                              >
                                <Link className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      {selectedScheduledPayment && (
        <LinkDebtPaymentModal
          open={linkModalOpen}
          onOpenChange={setLinkModalOpen}
          debt={debt}
          scheduledPayment={selectedScheduledPayment}
          onPaymentRecorded={handlePaymentRecorded}
        />
      )}
    </Dialog>
  );
};
