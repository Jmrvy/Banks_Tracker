import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useDebts, Debt } from '@/hooks/useDebts';
import { useFinancialData } from '@/hooks/useFinancialData';
import { Loader2 } from 'lucide-react';

interface EditDebtModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: Debt | null;
}

export const EditDebtModal = ({ open, onOpenChange, debt }: EditDebtModalProps) => {
  const { t } = useTranslation();
  const { updateDebt } = useDebts();
  const { categories } = useFinancialData();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    type: 'loan_received' as 'loan_given' | 'loan_received',
    payment_frequency: 'monthly',
    payment_amount: '',
    interest_rate: '',
    end_date: '',
    contact_name: '',
    contact_info: '',
    notes: '',
    status: 'active' as 'active' | 'completed' | 'defaulted',
    category_id: ''
  });

  useEffect(() => {
    if (debt) {
      setFormData({
        description: debt.description,
        type: debt.type,
        payment_frequency: debt.payment_frequency || 'monthly',
        payment_amount: debt.payment_amount.toString(),
        interest_rate: debt.interest_rate.toString(),
        end_date: debt.end_date || '',
        contact_name: debt.contact_name || '',
        contact_info: debt.contact_info || '',
        notes: debt.notes || '',
        status: debt.status,
        category_id: debt.category_id || ''
      });
    }
  }, [debt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debt) return;

    setLoading(true);

    try {
      await updateDebt(debt.id, {
        description: formData.description,
        type: formData.type,
        payment_frequency: formData.payment_frequency,
        payment_amount: parseFloat(formData.payment_amount),
        interest_rate: parseFloat(formData.interest_rate),
        end_date: formData.end_date || null,
        contact_name: formData.contact_name || null,
        contact_info: formData.contact_info || null,
        notes: formData.notes || null,
        status: formData.status,
        category_id: formData.category_id || null
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating debt:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!debt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">{t('debts.editDebt', { defaultValue: 'Edit debt' })}</DialogTitle>
        </DialogHeader>

        <form id="edit-debt-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
          <div>
            <Label htmlFor="description">{t('common.description', { defaultValue: 'Description' })} *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="type">{t('common.type', { defaultValue: 'Type' })} *</Label>
            <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loan_received">{t('debts.loanReceived', { defaultValue: 'Loan received' })}</SelectItem>
                <SelectItem value="loan_given">{t('debts.loanGiven', { defaultValue: 'Loan given' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="payment_frequency">{t('debts.frequency', { defaultValue: 'Frequency' })}</Label>
              <Select value={formData.payment_frequency} onValueChange={(v) => setFormData({ ...formData, payment_frequency: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t('common.monthly', { defaultValue: 'Monthly' })}</SelectItem>
                  <SelectItem value="quarterly">{t('common.quarterly', { defaultValue: 'Quarterly' })}</SelectItem>
                  <SelectItem value="semi_annual">{t('common.semiAnnual', { defaultValue: 'Semi-annual' })}</SelectItem>
                  <SelectItem value="annual">{t('common.annual', { defaultValue: 'Annual' })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="payment_amount">{t('debts.paymentAmount', { defaultValue: 'Payment amount' })}</Label>
              <AmountInput
                id="payment_amount"
                value={formData.payment_amount}
                onChange={(value) => setFormData({ ...formData, payment_amount: value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="interest_rate">{t('debts.interestRate', { defaultValue: 'Interest rate (%)' })}</Label>
              <AmountInput
                id="interest_rate"
                value={formData.interest_rate}
                onChange={(value) => setFormData({ ...formData, interest_rate: value })}
              />
            </div>

            <div>
              <Label htmlFor="end_date">{t('debts.endDate', { defaultValue: 'Expected end date' })}</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contact_name">{t('debts.contact', { defaultValue: 'Contact' })}</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="contact_info">{t('debts.contactInfo', { defaultValue: 'Contact info' })}</Label>
              <Input
                id="contact_info"
                value={formData.contact_info}
                onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="status">{t('common.status', { defaultValue: 'Status' })}</Label>
            <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('debts.active', { defaultValue: 'Active' })}</SelectItem>
                <SelectItem value="completed">{t('debts.completed', { defaultValue: 'Completed' })}</SelectItem>
                <SelectItem value="defaulted">{t('debts.defaulted', { defaultValue: 'Defaulted' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="category_id">{t('debts.paymentCategory', { defaultValue: 'Payment category' })}</Label>
            <Select value={formData.category_id} onValueChange={(value) => setFormData({ ...formData, category_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder={t('common.optional', { defaultValue: 'Optional' })} />
              </SelectTrigger>
              <SelectContent>
                {/* Repayments run opposite to the loan. */}
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">{t('common.notes', { defaultValue: 'Notes' })}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

        </form>

        <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t border-line">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-xs sm:text-sm">
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button type="submit" form="edit-debt-form" disabled={loading} className="h-9 text-xs sm:text-sm">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
