import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useInstallmentPayments, InstallmentPayment } from '@/hooks/useInstallmentPayments';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/dateUtils';
import { Check, Plus, Link } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecordInstallmentPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentPaymentId: string;
  onPaymentRecorded?: () => void;
}

export const RecordInstallmentPaymentModal = ({
  open,
  onOpenChange,
  installmentPaymentId,
  onPaymentRecorded
}: RecordInstallmentPaymentModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatCurrency } = useUserPreferences();
  const { installmentPayments, recalculateInstallmentPayment } = useInstallmentPayments();
  const { transactions, refetch } = useFinancialData();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'new' | 'link'>('new');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const installmentPayment = installmentPayments.find(ip => ip.id === installmentPaymentId);

  // Get transactions that could be linked (same account, not already linked to an installment)
  const linkableTransactions = useMemo(() => {
    if (!installmentPayment) return [];

    const expectedType = 'expense';
    return transactions
      .filter(t => {
        if (t.type !== expectedType) return false;
        if (t.account_id !== installmentPayment.account_id) return false;
        if (t.installment_payment_id) return false;
        return true;
      })
      .sort((a, b) => parseLocalDate(b.transaction_date).getTime() - parseLocalDate(a.transaction_date).getTime())
      .slice(0, 50);
  }, [transactions, installmentPayment]);

  const selectedTransaction = linkableTransactions.find(t => t.id === selectedTransactionId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !installmentPayment) return;

    setLoading(true);

    try {
      if (mode === 'new') {
        const paymentAmount = parseFloat(amount);
        if (!paymentAmount || paymentAmount <= 0) {
          toast({ title: t('common.invalidAmount'), description: t("common.enterValidAmount", { defaultValue: "Please enter a valid amount." }), variant: "destructive" });
          setLoading(false);
          return;
        }

        // Create a new transaction linked to this installment
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const { error: txError } = await supabase
          .from('transactions')
          .insert([{
            user_id: user.id,
            account_id: installmentPayment.account_id,
            category_id: installmentPayment.category_id,
            description: `${installmentPayment.description} (${installmentPayment.payment_type === 'reimbursement' ? 'Remboursement' : 'Paiement'} manuel)`,
            amount: paymentAmount,
            type: 'expense',
            transaction_date: todayStr,
            value_date: todayStr,
            include_in_stats: true,
            installment_payment_id: installmentPaymentId,
          }]);

        if (txError) {
          toast({ title: t('common.error'), description: txError.message, variant: "destructive" });
          setLoading(false);
          return;
        }
      } else {
        // Link existing transaction
        if (!selectedTransactionId) {
          toast({ title: t('common.transactionNotSelected'), description: t("common.selectTransactionToLink", { defaultValue: "Please select a transaction to link." }), variant: "destructive" });
          setLoading(false);
          return;
        }

        const { error: linkError } = await supabase
          .from('transactions')
          .update({ installment_payment_id: installmentPaymentId })
          .eq('id', selectedTransactionId)
          .eq('user_id', user.id);

        if (linkError) {
          toast({ title: t('common.error'), description: linkError.message, variant: "destructive" });
          setLoading(false);
          return;
        }
      }

      // Recalculate remaining_amount from all linked transactions
      await refetch();
      const { error: recalcError, result } = await recalculateInstallmentPayment(installmentPaymentId);

      if (recalcError) {
        toast({ title: "Erreur de recalcul", description: recalcError.message, variant: "destructive" });
      } else {
        toast({
          title: t('common.paymentRecorded'),
          description: result ? `Restant: ${formatCurrency(result.newRemainingAmount)}, mensualité: ${formatCurrency(result.newInstallmentAmount)}` : t('installments.paymentRecordedDesc'),
        });
      }

      setAmount('');
      setSelectedTransactionId(null);
      onOpenChange(false);
      onPaymentRecorded?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">{t('installments.recordPayment', { defaultValue: 'Record a payment' })}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
        {installmentPayment && (
          <div className="p-3 bg-muted rounded-lg space-y-1.5 text-xs sm:text-sm mb-3">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Description</span>
              <span className="font-medium truncate">{installmentPayment.description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Suggéré</span>
              <span className="font-medium whitespace-nowrap">{formatCurrency(installmentPayment.installment_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Restant</span>
              <span className="font-medium text-primary whitespace-nowrap">{formatCurrency(installmentPayment.remaining_amount)}</span>
            </div>
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'new' | 'link')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new" className="gap-1.5 text-xs sm:text-sm">
              <Plus className="h-3.5 w-3.5" />
              Nouvelle
            </TabsTrigger>
            <TabsTrigger value="link" className="gap-1.5 text-xs sm:text-sm">
              <Link className="h-3.5 w-3.5" />
              Lier existante
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit}>
            <TabsContent value="new" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-xs sm:text-sm">{t('installments.paymentAmount', { defaultValue: 'Payment amount' })} *</Label>
                <AmountInput
                  id="amount"
                  placeholder="0.00"
                  value={amount}
                  onChange={(value) => setAmount(value)}
                  required={mode === 'new'}
                />
                <p className="text-xs text-muted-foreground">
                  Vous pouvez payer le montant suggéré ou un montant différent
                </p>
              </div>
            </TabsContent>

            <TabsContent value="link" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">{t('installments.selectExistingTransaction', { defaultValue: 'Select an existing transaction' })}</Label>
                {linkableTransactions.length > 0 ? (
                  <ScrollArea className="h-[200px] border rounded-md p-2">
                    <div className="space-y-1">
                      {linkableTransactions.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTransactionId(t.id)}
                          className={cn(
                            "w-full flex items-center justify-between p-2 rounded-md text-left transition-colors",
                            selectedTransactionId === t.id
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{t.description}</p>
                            <p className={cn(
                              "text-xs",
                              selectedTransactionId === t.id ? "text-primary-foreground/80" : "text-muted-foreground"
                            )}>
                              {format(parseLocalDate(t.transaction_date), 'dd/MM/yyyy', { locale: fr })}
                              {t.category?.name && ` • ${t.category.name}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-semibold",
                              selectedTransactionId === t.id ? "text-primary-foreground" : "text-destructive"
                            )}>
                              {formatCurrency(t.amount)}
                            </span>
                            {selectedTransactionId === t.id && (
                              <Check className="h-4 w-4" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="h-[200px] flex items-center justify-center border rounded-md">
                    <p className="text-sm text-muted-foreground text-center px-4">
                      Aucune transaction disponible à lier.<br />
                      Les transactions doivent être du même compte.
                    </p>
                  </div>
                )}
                {selectedTransaction && (
                  <p className="text-xs text-muted-foreground">
                    Montant à enregistrer: <strong>{formatCurrency(selectedTransaction.amount)}</strong>
                  </p>
                )}
              </div>
            </TabsContent>

            <div className="flex gap-2 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={loading || (mode === 'link' && !selectedTransactionId)}
                className="flex-1 h-9 text-xs sm:text-sm"
              >
                {loading ? 'Enregistrement...' : mode === 'new' ? 'Enregistrer' : 'Lier'}
              </Button>
            </div>
          </form>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
