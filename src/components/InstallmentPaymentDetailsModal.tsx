import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  useInstallmentPayments,
  InstallmentPayment,
  InstallmentPaymentHistory,
} from '@/hooks/useInstallmentPayments';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { RefreshCw, History, ArrowRight, Calendar, Loader2, Trash2 } from 'lucide-react';

// Parse "YYYY-MM-DD" as local date
const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

interface InstallmentPaymentDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentPayment: InstallmentPayment;
}

export const InstallmentPaymentDetailsModal = ({
  open,
  onOpenChange,
  installmentPayment,
}: InstallmentPaymentDetailsModalProps) => {
  const { toast } = useToast();
  const { formatCurrency } = useUserPreferences();
  const { recalculateInstallmentPayment, fetchPaymentHistory, deleteHistoryEntry } = useInstallmentPayments();
  const [history, setHistory] = useState<InstallmentPaymentHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const formatDateShort = (dateStr: string) => {
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  useEffect(() => {
    if (open && installmentPayment) {
      loadHistory();
    }
  }, [open, installmentPayment?.id]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const data = await fetchPaymentHistory(installmentPayment.id);
    setHistory(data);
    setLoadingHistory(false);
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    const { error, result } = await recalculateInstallmentPayment(installmentPayment.id);

    if (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de recalculer le paiement échelonné.',
        variant: 'destructive',
      });
    } else if (result) {
      toast({
        title: 'Recalcul effectué',
        description: `${result.linkedTransactionsCount} transaction(s). Restant: ${formatCurrency(result.newRemainingAmount)}, mensualité: ${formatCurrency(result.newInstallmentAmount)}`,
      });
      await loadHistory();
    }

    setRecalculating(false);
  };

  const getChangeTypeLabel = (changeType: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      created: { label: 'Création', color: 'bg-green-500' },
      updated: { label: 'Modification', color: 'bg-blue-500' },
      amount_changed: { label: 'Montant modifié', color: 'bg-orange-500' },
      completed: { label: 'Terminé', color: 'bg-purple-500' },
      reactivated: { label: 'Réactivé', color: 'bg-cyan-500' },
      recalculated: { label: 'Recalculé', color: 'bg-yellow-500' },
      deleted: { label: 'Supprimé', color: 'bg-red-500' },
    };
    return labels[changeType] || { label: changeType, color: 'bg-gray-500' };
  };

  const progress = installmentPayment.total_amount > 0
    ? Math.min(100, Math.round(((installmentPayment.total_amount - installmentPayment.remaining_amount) / installmentPayment.total_amount) * 1000) / 10)
    : 0;

  const amountPaid = installmentPayment.total_amount - installmentPayment.remaining_amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
            <span className="truncate">{installmentPayment.description}</span>
            <Badge variant={installmentPayment.is_active ? 'default' : 'secondary'} className="text-[10px] sm:text-xs flex-shrink-0">
              {installmentPayment.is_active ? 'Actif' : 'Terminé'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 mx-4 sm:mx-6 max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-3rem)] flex-shrink-0">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Aperçu</TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1 text-xs sm:text-sm">
              <History className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Historique
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-3 mt-3">
            {/* Progress card */}
            <div className="rounded-lg border p-3 sm:p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] sm:text-sm text-muted-foreground">Progression</span>
                <span className="text-[11px] sm:text-sm font-medium">{progress.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 sm:h-3 overflow-hidden mb-3">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                <div className="bg-muted/50 rounded-lg p-1.5 sm:p-2">
                  <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Total</p>
                  <p className="text-[11px] sm:text-sm font-bold truncate">{formatCurrency(installmentPayment.total_amount)}</p>
                </div>
                <div className="bg-green-500/10 rounded-lg p-1.5 sm:p-2">
                  <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Payé</p>
                  <p className="text-[11px] sm:text-sm font-bold text-green-600 truncate">{formatCurrency(amountPaid)}</p>
                </div>
                <div className="bg-orange-500/10 rounded-lg p-1.5 sm:p-2">
                  <p className="text-[8px] sm:text-[10px] text-muted-foreground uppercase">Restant</p>
                  <p className="text-[11px] sm:text-sm font-bold text-orange-600 truncate">{formatCurrency(installmentPayment.remaining_amount)}</p>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="rounded-lg border p-3 sm:p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] sm:text-sm text-muted-foreground">Type</span>
                <Badge variant="outline" className="text-[10px] sm:text-xs">
                  {installmentPayment.payment_type === 'reimbursement' ? 'Remb.' : 'Paiement'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] sm:text-sm text-muted-foreground">Échéance</span>
                <span className="text-[11px] sm:text-sm font-medium">{formatCurrency(installmentPayment.installment_amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] sm:text-sm text-muted-foreground">Fréquence</span>
                <span className="text-[11px] sm:text-sm font-medium">
                  {installmentPayment.frequency === 'weekly' ? 'Hebdo.' :
                   installmentPayment.frequency === 'monthly' ? 'Mensuelle' : 'Trimestrielle'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] sm:text-sm text-muted-foreground">Prochain</span>
                <span className="text-[11px] sm:text-sm font-medium flex items-center gap-1">
                  <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {formatDateShort(installmentPayment.next_payment_date)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] sm:text-sm text-muted-foreground">Début</span>
                <span className="text-[11px] sm:text-sm">{formatDateShort(installmentPayment.start_date)}</span>
              </div>
            </div>

            {/* Recalculate button */}
            <Button
              onClick={handleRecalculate}
              disabled={recalculating}
              variant="outline"
              className="w-full h-9 text-xs sm:text-sm"
              size="sm"
            >
              {recalculating ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-2" />
              )}
              Recalculer
            </Button>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground text-center">
              Recalcule le montant restant et la mensualité à partir des transactions liées
            </p>
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 mt-3">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <History className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs sm:text-sm">Aucun historique</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((entry) => {
                  const typeInfo = getChangeTypeLabel(entry.change_type);
                  return (
                    <div key={entry.id} className="rounded-lg border p-2.5 sm:p-3 group">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${typeInfo.color}`} />
                          <span className="text-xs sm:text-sm font-medium truncate">{typeInfo.label}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatDate(entry.created_at)}
                          </span>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const { error } = await deleteHistoryEntry(entry.id);
                              if (!error) {
                                setHistory(prev => prev.filter(h => h.id !== entry.id));
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                            title="Supprimer cette entrée"
                          >
                            <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>

                      {entry.change_description && (
                        <p className="text-[11px] sm:text-xs text-muted-foreground mb-1.5">
                          {entry.change_description}
                        </p>
                      )}

                      {/* Value changes */}
                      {(entry.old_values || entry.new_values) && (
                        <div className="bg-muted/30 rounded-md p-2 space-y-1">
                          {entry.old_values?.total_amount !== undefined &&
                           entry.new_values?.total_amount !== undefined &&
                           entry.old_values.total_amount !== entry.new_values.total_amount && (
                            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs flex-wrap">
                              <span className="text-muted-foreground">Total:</span>
                              <span className="text-red-500 whitespace-nowrap">{formatCurrency(entry.old_values.total_amount)}</span>
                              <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                              <span className="text-green-500 whitespace-nowrap">{formatCurrency(entry.new_values.total_amount)}</span>
                            </div>
                          )}
                          {entry.old_values?.remaining_amount !== undefined &&
                           entry.new_values?.remaining_amount !== undefined &&
                           entry.old_values.remaining_amount !== entry.new_values.remaining_amount && (
                            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs flex-wrap">
                              <span className="text-muted-foreground">Restant:</span>
                              <span className="text-red-500 whitespace-nowrap">{formatCurrency(entry.old_values.remaining_amount)}</span>
                              <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                              <span className="text-green-500 whitespace-nowrap">{formatCurrency(entry.new_values.remaining_amount)}</span>
                            </div>
                          )}
                          {entry.old_values?.installment_amount !== undefined &&
                           entry.new_values?.installment_amount !== undefined &&
                           entry.old_values.installment_amount !== entry.new_values.installment_amount && (
                            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs flex-wrap">
                              <span className="text-muted-foreground">Échéance:</span>
                              <span className="text-red-500 whitespace-nowrap">{formatCurrency(entry.old_values.installment_amount)}</span>
                              <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                              <span className="text-green-500 whitespace-nowrap">{formatCurrency(entry.new_values.installment_amount)}</span>
                            </div>
                          )}
                          {entry.new_values?.total_paid !== undefined && (
                            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs">
                              <span className="text-muted-foreground">Total payé:</span>
                              <span className="font-medium whitespace-nowrap">{formatCurrency(entry.new_values.total_paid)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
