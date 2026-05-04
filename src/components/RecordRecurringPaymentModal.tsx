import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData, RecurringTransaction } from '@/hooks/useFinancialData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/dateUtils';
import { Check, Plus, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveNamePlaceholders } from '@/utils/namePlaceholders';

interface RecordRecurringPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurringTransactionId: string;
  onPaymentRecorded?: () => void;
}

export const RecordRecurringPaymentModal = ({
  open,
  onOpenChange,
  recurringTransactionId,
  onPaymentRecorded
}: RecordRecurringPaymentModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { transactions, recurringTransactions, refetch } = useFinancialData();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'new' | 'link'>('link');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const recurringTransaction = recurringTransactions.find(rt => rt.id === recurringTransactionId);

  // Get transactions that could be linked (same account, same type, not already linked to a recurring transaction)
  const linkableTransactions = useMemo(() => {
    if (!recurringTransaction) return [];

    return transactions
      .filter(t => {
        if (t.type !== recurringTransaction.type) return false;
        if (t.account_id !== recurringTransaction.account_id) return false;
        if (t.recurring_transaction_id) return false; // Already linked
        if (t.installment_payment_id) return false; // Part of an installment
        return true;
      })
      .sort((a, b) => parseLocalDate(b.transaction_date).getTime() - parseLocalDate(a.transaction_date).getTime())
      .slice(0, 50);
  }, [transactions, recurringTransaction]);

  const selectedTransaction = linkableTransactions.find(t => t.id === selectedTransactionId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !recurringTransaction) return;

    setLoading(true);

    try {
      if (mode === 'new') {
        const paymentAmount = parseFloat(amount);
        if (!paymentAmount || paymentAmount <= 0) {
          toast({ title: t('common.invalidAmount'), description: t("common.enterValidAmount", { defaultValue: "Please enter a valid amount." }), variant: "destructive" });
          setLoading(false);
          return;
        }

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const { error: txError } = await supabase
          .from('transactions')
          .insert([{
            user_id: user.id,
            account_id: recurringTransaction.account_id,
            category_id: recurringTransaction.category_id,
            description: resolveNamePlaceholders(recurringTransaction.description, new Date()),
            amount: paymentAmount,
            type: recurringTransaction.type,
            transaction_date: todayStr,
            value_date: todayStr,
            include_in_stats: true,
            recurring_transaction_id: recurringTransactionId,
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
          .update({ recurring_transaction_id: recurringTransactionId })
          .eq('id', selectedTransactionId)
          .eq('user_id', user.id);

        if (linkError) {
          toast({ title: t('common.error'), description: linkError.message, variant: "destructive" });
          setLoading(false);
          return;
        }
      }

      await refetch();
      toast({
        title: t('common.paymentRecorded'),
        description: mode === 'new' ? t('recurring.createdAndLinked') : t('recurring.linked'),
      });

      setAmount('');
      setSelectedTransactionId(null);
      onOpenChange(false);
      onPaymentRecorded?.();
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">Lier / Enregistrer un Paiement</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
        {recurringTransaction && (
          <div className="p-3 bg-muted rounded-lg space-y-1.5 text-xs sm:text-sm mb-3">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Description</span>
              <span className="font-medium truncate">{recurringTransaction.description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Montant</span>
              <span className="font-medium whitespace-nowrap">{formatCurrency(recurringTransaction.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Compte</span>
              <span className="font-medium truncate">{recurringTransaction.account?.name}</span>
            </div>
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'new' | 'link')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link" className="gap-1.5 text-xs sm:text-sm">
              <Link className="h-3.5 w-3.5" />
              Lier existante
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-1.5 text-xs sm:text-sm">
              <Plus className="h-3.5 w-3.5" />
              Nouvelle
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit}>
            <TabsContent value="link" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">{t('recurring.selectExistingTransaction', { defaultValue: 'Select an existing transaction' })}</Label>
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
                              selectedTransactionId === t.id ? "text-primary-foreground" : t.type === 'income' ? "text-success" : "text-destructive"
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
                      Les transactions doivent être du même compte et du même type.
                    </p>
                  </div>
                )}
                {selectedTransaction && (
                  <p className="text-xs text-muted-foreground">
                    Montant: <strong>{formatCurrency(selectedTransaction.amount)}</strong>
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="new" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-xs sm:text-sm">{t('recurring.paymentAmount', { defaultValue: 'Payment amount' })} *</Label>
                <AmountInput
                  id="amount"
                  placeholder="0.00"
                  value={amount}
                  onChange={(value) => setAmount(value)}
                  required={mode === 'new'}
                />
                <p className="text-xs text-muted-foreground">
                  Montant attendu: {recurringTransaction ? formatCurrency(recurringTransaction.amount) : '—'}
                </p>
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
                {loading ? 'Enregistrement...' : mode === 'link' ? 'Lier' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
