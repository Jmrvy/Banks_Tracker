import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDebts, Debt } from '@/hooks/useDebts';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { Loader2 } from 'lucide-react';

interface AddPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: Debt | null;
}

export const AddPaymentModal = ({ open, onOpenChange, debt }: AddPaymentModalProps) => {
  const { addPayment } = useDebts();
  const { formatCurrency } = useUserPreferences();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const resetForm = () => {
    setFormData({
      amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      notes: ''
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debt) return;

    setLoading(true);

    try {
      await addPayment({
        debt_id: debt.id,
        amount: parseFloat(formData.amount),
        payment_date: formData.payment_date,
        notes: formData.notes || null
      });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding payment:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!debt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">Ajouter un paiement</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
          <div className="space-y-2 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium">{debt.description}</p>
            <p className="text-sm text-muted-foreground">
              Montant restant: <span className="font-semibold text-primary">{formatCurrency(debt.remaining_amount)}</span>
            </p>
          </div>

          <form id="add-payment-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="amount">Montant *</Label>
              <AmountInput
                id="amount"
                value={formData.amount}
                onChange={(value) => setFormData({ ...formData, amount: value })}
                placeholder="0.00"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum: {formatCurrency(debt.remaining_amount)}
              </p>
            </div>

            <div>
              <Label htmlFor="payment_date">Date du paiement *</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes sur ce paiement..."
              />
            </div>
          </form>
        </div>

        <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-xs sm:text-sm">
            Annuler
          </Button>
          <Button type="submit" form="add-payment-form" disabled={loading} className="h-9 text-xs sm:text-sm">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
