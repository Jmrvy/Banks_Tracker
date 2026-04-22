import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useDebts, Debt } from '@/hooks/useDebts';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Check, Plus, Link, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScheduledPayment {
  id: string;
  debt_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  actual_amount: number | null;
  is_paid: boolean | null;
  paid_date: string | null;
}

interface LinkDebtPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: Debt;
  scheduledPayment: ScheduledPayment;
  onPaymentRecorded?: () => void;
}

export const LinkDebtPaymentModal = ({
  open,
  onOpenChange,
  debt,
  scheduledPayment,
  onPaymentRecorded,
}: LinkDebtPaymentModalProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { formatCurrency } = useUserPreferences();
  const { transactions, accounts, refetch } = useFinancialData();
  const { addPayment } = useDebts();
  const [amount, setAmount] = useState(scheduledPayment.scheduled_amount.toString());
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'new' | 'link'>('link');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');

  // For loan_received we pay (expense), for loan_given we receive (income)
  const expectedType = debt.type === 'loan_received' ? 'expense' : 'income';

  const linkableTransactions = useMemo(() => {
    return transactions
      .filter(t => {
        if (t.type !== expectedType) return false;
        // Don't show transactions already linked to installments
        if (t.installment_payment_id) return false;
        return true;
      })
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  }, [transactions, expectedType]);

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return linkableTransactions;
    const query = searchQuery.toLowerCase().trim();
    return linkableTransactions.filter(t => {
      const description = (t.description || '').toLowerCase();
      const amount = t.amount.toString();
      const date = format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: fr });
      const accountName = (t.account?.name || '').toLowerCase();
      return description.includes(query) || amount.includes(query) || date.includes(query) || accountName.includes(query);
    });
  }, [linkableTransactions, searchQuery]);

  const selectedTransaction = linkableTransactions.find(t => t.id === selectedTransactionId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      let paymentAmount: number;
      let paymentDate: string;

      if (mode === 'new') {
        paymentAmount = parseFloat(amount);
        if (!paymentAmount || paymentAmount <= 0) {
          toast({ title: "Montant invalide", description: "Veuillez saisir un montant valide.", variant: "destructive" });
          setLoading(false);
          return;
        }
        if (!selectedAccountId) {
          toast({ title: "Compte requis", description: "Veuillez sélectionner un compte.", variant: "destructive" });
          setLoading(false);
          return;
        }

        const today = new Date();
        paymentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Create a new transaction
        const suffix = debt.type === 'loan_received' ? 'Remboursement dette' : 'Remboursement prêt';
        const { error: txError } = await supabase
          .from('transactions')
          .insert([{
            user_id: user.id,
            account_id: selectedAccountId,
            description: `${debt.description} (${suffix})`,
            amount: paymentAmount,
            type: expectedType,
            transaction_date: paymentDate,
            value_date: paymentDate,
            include_in_stats: true,
            category_id: debt.category_id || null,
          }]);

        if (txError) {
          toast({ title: "Erreur", description: txError.message, variant: "destructive" });
          setLoading(false);
          return;
        }
      } else {
        if (!selectedTransactionId || !selectedTransaction) {
          toast({ title: "Transaction non sélectionnée", description: "Veuillez sélectionner une transaction.", variant: "destructive" });
          setLoading(false);
          return;
        }
        paymentAmount = selectedTransaction.amount;
        paymentDate = selectedTransaction.transaction_date;
      }

      // Mark the scheduled payment as paid
      const { error: scheduleError } = await supabase
        .from('scheduled_debt_payments')
        .update({
          is_paid: true,
          paid_date: paymentDate,
          actual_amount: paymentAmount,
        })
        .eq('id', scheduledPayment.id)
        .eq('user_id', user.id);

      if (scheduleError) {
        console.error('Error updating scheduled payment:', scheduleError);
      }

      // Record the debt payment
      await addPayment({
        debt_id: debt.id,
        amount: paymentAmount,
        payment_date: paymentDate,
        notes: mode === 'link' && selectedTransaction
          ? `Lié à: ${selectedTransaction.description}`
          : null,
      });

      // Recalculate remaining_amount from all debt_payments (avoids double-counting with DB trigger)
      const { data: allDebtPayments } = await supabase
        .from('debt_payments')
        .select('amount')
        .eq('debt_id', debt.id)
        .eq('user_id', user.id);

      const totalPaid = (allDebtPayments || []).reduce((sum: number, dp: { amount: number }) => sum + Number(dp.amount), 0);
      const newRemaining = Math.max(0, debt.total_amount - totalPaid);
      const updates: Record<string, any> = { remaining_amount: newRemaining };
      if (newRemaining <= 0) {
        updates.status = 'completed';
      }

      await supabase
        .from('debts')
        .update(updates)
        .eq('id', debt.id)
        .eq('user_id', user.id);

      await refetch();

      toast({
        title: "Paiement enregistré",
        description: `Échéance marquée comme payée. Restant: ${formatCurrency(newRemaining)}`,
      });

      setAmount('');
      setSelectedTransactionId(null);
      onOpenChange(false);
      onPaymentRecorded?.();
    } catch (error) {
      console.error('Error recording payment:', error);
      toast({ title: "Erreur", description: "Impossible d'enregistrer le paiement", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">Enregistrer un paiement</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
          {/* Scheduled payment info */}
          <div className="p-3 bg-muted rounded-lg space-y-1.5 text-xs sm:text-sm mb-3">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Échéance</span>
              <span className="font-medium">
                {format(new Date(scheduledPayment.scheduled_date), 'dd MMM yyyy', { locale: fr })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Montant prévu</span>
              <span className="font-medium whitespace-nowrap">{formatCurrency(scheduledPayment.scheduled_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-[11px] sm:text-xs">Restant sur la dette</span>
              <span className="font-medium text-primary whitespace-nowrap">{formatCurrency(debt.remaining_amount)}</span>
            </div>
          </div>

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
                  <Label className="text-xs sm:text-sm">Sélectionner une transaction existante</Label>
                  {linkableTransactions.length > 0 && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Rechercher par description, montant, date, compte..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 pl-8 pr-8 text-xs sm:text-sm"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  {linkableTransactions.length > 0 ? (
                    <ScrollArea className="h-[220px] border rounded-md p-2">
                      {filteredTransactions.length > 0 ? (
                      <div className="space-y-1">
                        {filteredTransactions.map((t) => (
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
                                {format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: fr })}
                                {t.account && ` • ${t.account.name}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={cn(
                                "text-sm font-semibold",
                                selectedTransactionId === t.id ? "text-primary-foreground" : ""
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
                      ) : (
                        <div className="h-full flex items-center justify-center py-8">
                          <p className="text-xs text-muted-foreground text-center">
                            Aucun résultat pour "{searchQuery}"
                          </p>
                        </div>
                      )}
                    </ScrollArea>
                  ) : (
                    <div className="h-[120px] flex items-center justify-center border rounded-md">
                      <p className="text-sm text-muted-foreground text-center px-4">
                        Aucune transaction {expectedType === 'expense' ? 'de dépense' : 'de revenu'} disponible.
                      </p>
                    </div>
                  )}
                  {selectedTransaction && (
                    <div className="p-2.5 bg-muted/50 rounded-md space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Montant de la transaction</span>
                        <span className="font-semibold">{formatCurrency(selectedTransaction.amount)}</span>
                      </div>
                      {selectedTransaction.amount !== scheduledPayment.scheduled_amount && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Écart avec l'échéance</span>
                          <span className={cn(
                            "font-medium",
                            selectedTransaction.amount > scheduledPayment.scheduled_amount
                              ? "text-green-600 dark:text-green-400"
                              : "text-orange-600 dark:text-orange-400"
                          )}>
                            {selectedTransaction.amount > scheduledPayment.scheduled_amount ? '+' : ''}
                            {formatCurrency(selectedTransaction.amount - scheduledPayment.scheduled_amount)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="new" className="space-y-3 pt-3">
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm">Compte *</Label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} {a.bank ? `(${a.bank})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-payment-amount" className="text-xs sm:text-sm">Montant *</Label>
                  <AmountInput
                    id="debt-payment-amount"
                    placeholder="0.00"
                    value={amount}
                    onChange={(value) => setAmount(value)}
                    required={mode === 'new'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Montant prévu: {formatCurrency(scheduledPayment.scheduled_amount)}
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
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Enregistrement...
                    </>
                  ) : mode === 'new' ? 'Enregistrer' : 'Lier'}
                </Button>
              </div>
            </form>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
