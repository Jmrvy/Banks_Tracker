import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        notes: formData.notes || null,
        principal_amount: null,
        interest_amount: null,
        insurance_amount: null,
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
          <DialogTitle className="text-sm sm:text-lg">{t('debts.addPayment', { defaultValue: 'Add a payment' })}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
          <div className="space-y-2 p-4 bg-bg-subtle rounded-lg">
            <p className="text-sm font-medium">{debt.description}</p>
            <p className="text-sm text-muted-foreground">
              {t('debts.remainingAmount', { defaultValue: 'Remaining' })}:{' '}
              <span className="font-semibold text-primary font-mono">{formatCurrency(debt.remaining_amount)}</span>
            </p>
          </div>

          <form id="add-payment-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="amount">{t('common.amount', { defaultValue: 'Amount' })} *</Label>
              <AmountInput
                id="amount"
                value={formData.amount}
                onChange={(value) => setFormData({ ...formData, amount: value })}
                placeholder="0.00"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('common.max', { defaultValue: 'Max' })}: <span className="font-mono tabular-nums">{formatCurrency(debt.remaining_amount)}</span>
              </p>
            </div>

            <div>
              <Label htmlFor="payment_date">{t('debts.paymentDate', { defaultValue: 'Payment date' })} *</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="notes">{t('common.notes', { defaultValue: 'Notes' })}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t('debts.paymentNotesPlaceholder', { defaultValue: 'Notes on this payment…' })}
              />
            </div>
          </form>
        </div>

        <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t border-line">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-xs sm:text-sm">
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button type="submit" form="add-payment-form" disabled={loading} className="h-9 text-xs sm:text-sm">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
