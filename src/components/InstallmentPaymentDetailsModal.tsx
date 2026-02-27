import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  useInstallmentPayments,
  InstallmentPayment,
  InstallmentPaymentHistory,
} from '@/hooks/useInstallmentPayments';
import { RefreshCw, History, TrendingDown, TrendingUp, ArrowRight, Calendar, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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
  const { recalculateInstallmentPayment, fetchPaymentHistory } = useInstallmentPayments();
  const [history, setHistory] = useState<InstallmentPaymentHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  const formatDate = (dateStr: string) =>
    format(new Date(dateStr), 'dd MMM yyyy à HH:mm', { locale: fr });

  const formatDateShort = (dateStr: string) =>
    format(new Date(dateStr), 'dd/MM/yyyy', { locale: fr });

  // Load history when modal opens
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
        description: `${result.linkedTransactionsCount} transaction(s) et ${result.paymentRecordsCount} enregistrement(s) pris en compte. Nouveau restant: ${formatCurrency(result.newRemainingAmount)}`,
      });
      // Reload history to show the recalculation entry
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
    ? ((installmentPayment.total_amount - installmentPayment.remaining_amount) / installmentPayment.total_amount) * 100
    : 0;

  const amountPaid = installmentPayment.total_amount - installmentPayment.remaining_amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{installmentPayment.description}</span>
            <Badge variant={installmentPayment.is_active ? 'default' : 'secondary'}>
              {installmentPayment.is_active ? 'Actif' : 'Terminé'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Aperçu</TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1">
              <History className="w-3.5 h-3.5" />
              Historique
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-auto space-y-4 mt-4">
            {/* Progress card */}
            <Card>
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Progression</span>
                  <span className="text-sm font-medium">{progress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden mb-3">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                    <p className="text-sm font-bold">{formatCurrency(installmentPayment.total_amount)}</p>
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground uppercase">Payé</p>
                    <p className="text-sm font-bold text-green-600">{formatCurrency(amountPaid)}</p>
                  </div>
                  <div className="bg-orange-500/10 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground uppercase">Restant</p>
                    <p className="text-sm font-bold text-orange-600">{formatCurrency(installmentPayment.remaining_amount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Details */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <Badge variant="outline">
                    {installmentPayment.payment_type === 'reimbursement' ? 'Remboursement' : 'Paiement'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Mensualité</span>
                  <span className="text-sm font-medium">{formatCurrency(installmentPayment.installment_amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Fréquence</span>
                  <span className="text-sm font-medium capitalize">
                    {installmentPayment.frequency === 'weekly' ? 'Hebdomadaire' :
                     installmentPayment.frequency === 'monthly' ? 'Mensuelle' : 'Trimestrielle'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Prochain paiement</span>
                  <span className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDateShort(installmentPayment.next_payment_date)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Date de début</span>
                  <span className="text-sm">{formatDateShort(installmentPayment.start_date)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Recalculate button */}
            <Button
              onClick={handleRecalculate}
              disabled={recalculating}
              variant="outline"
              className="w-full"
            >
              {recalculating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Recalculer à partir des transactions
            </Button>
            <p className="text-[10px] text-muted-foreground text-center -mt-2">
              Recalcule le montant restant en analysant les transactions liées et les enregistrements de paiement
            </p>
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-4">
            {loadingHistory ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <History className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">Aucun historique disponible</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {history.map((entry) => {
                    const typeInfo = getChangeTypeLabel(entry.change_type);
                    return (
                      <Card key={entry.id} className="overflow-hidden">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${typeInfo.color}`} />
                              <span className="text-sm font-medium">{typeInfo.label}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(entry.created_at)}
                            </span>
                          </div>

                          {entry.change_description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {entry.change_description}
                            </p>
                          )}

                          {/* Show value changes */}
                          {(entry.old_values || entry.new_values) && (
                            <div className="bg-muted/30 rounded-md p-2 space-y-1 text-xs">
                              {entry.old_values?.total_amount !== undefined &&
                               entry.new_values?.total_amount !== undefined &&
                               entry.old_values.total_amount !== entry.new_values.total_amount && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground w-24">Montant total:</span>
                                  <span className="text-red-500">{formatCurrency(entry.old_values.total_amount)}</span>
                                  <ArrowRight className="w-3 h-3" />
                                  <span className="text-green-500">{formatCurrency(entry.new_values.total_amount)}</span>
                                </div>
                              )}
                              {entry.old_values?.remaining_amount !== undefined &&
                               entry.new_values?.remaining_amount !== undefined &&
                               entry.old_values.remaining_amount !== entry.new_values.remaining_amount && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground w-24">Restant:</span>
                                  <span className="text-red-500">{formatCurrency(entry.old_values.remaining_amount)}</span>
                                  <ArrowRight className="w-3 h-3" />
                                  <span className="text-green-500">{formatCurrency(entry.new_values.remaining_amount)}</span>
                                </div>
                              )}
                              {entry.old_values?.installment_amount !== undefined &&
                               entry.new_values?.installment_amount !== undefined &&
                               entry.old_values.installment_amount !== entry.new_values.installment_amount && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground w-24">Mensualité:</span>
                                  <span className="text-red-500">{formatCurrency(entry.old_values.installment_amount)}</span>
                                  <ArrowRight className="w-3 h-3" />
                                  <span className="text-green-500">{formatCurrency(entry.new_values.installment_amount)}</span>
                                </div>
                              )}
                              {entry.new_values?.total_paid !== undefined && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground w-24">Total payé:</span>
                                  <span className="font-medium">{formatCurrency(entry.new_values.total_paid)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
