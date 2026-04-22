import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/hooks/use-toast';
import { useInstallmentPayments, InstallmentPayment } from '@/hooks/useInstallmentPayments';
import { useFinancialData } from '@/hooks/useFinancialData';
import { format, parseISO } from 'date-fns';

interface EditInstallmentPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentPayment: InstallmentPayment;
}

export const EditInstallmentPaymentModal = ({ open, onOpenChange, installmentPayment }: EditInstallmentPaymentModalProps) => {
  const { toast } = useToast();
  const { updateInstallmentPayment } = useInstallmentPayments();
  const { accounts, categories } = useFinancialData();

  const [formData, setFormData] = useState({
    description: installmentPayment.description,
    total_amount: installmentPayment.total_amount.toString(),
    installment_amount: installmentPayment.installment_amount.toString(),
    frequency: installmentPayment.frequency,
    next_payment_date: parseISO(installmentPayment.next_payment_date),
    account_id: installmentPayment.account_id,
    category_id: installmentPayment.category_id || '',
    payment_type: (installmentPayment.payment_type || 'payment') as 'reimbursement' | 'payment',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFormData({
      description: installmentPayment.description,
      total_amount: installmentPayment.total_amount.toString(),
      installment_amount: installmentPayment.installment_amount.toString(),
      frequency: installmentPayment.frequency,
      next_payment_date: parseISO(installmentPayment.next_payment_date),
      account_id: installmentPayment.account_id,
      category_id: installmentPayment.category_id || '',
      payment_type: (installmentPayment.payment_type || 'payment') as 'reimbursement' | 'payment',
    });
  }, [installmentPayment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.description || !formData.total_amount || !formData.installment_amount || !formData.account_id) {
      toast({
        title: "Informations manquantes",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { error } = await updateInstallmentPayment(installmentPayment.id, {
      description: formData.description,
      total_amount: parseFloat(formData.total_amount),
      installment_amount: parseFloat(formData.installment_amount),
      frequency: formData.frequency,
      next_payment_date: format(formData.next_payment_date, 'yyyy-MM-dd'),
      account_id: formData.account_id,
      category_id: formData.category_id || null,
      payment_type: formData.payment_type,
    });

    if (error) {
      toast({
        title: "Erreur lors de la modification",
        description: error.message,
        variant: "destructive",
      });
    } else {
      const label = formData.payment_type === 'reimbursement' ? 'remboursement' : 'paiement';
      toast({
        title: `${label.charAt(0).toUpperCase() + label.slice(1)} échelonné modifié`,
        description: `Le ${label} échelonné a été modifié avec succès.`,
      });
      onOpenChange(false);
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg">Modifier le Paiement Échelonné</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-2 sm:px-6 space-y-3 sm:space-y-4">
          {/* Payment Type */}
          <div className="space-y-2">
            <Label>Type *</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={formData.payment_type === 'payment' ? 'default' : 'outline'}
                onClick={() => setFormData({ ...formData, payment_type: 'payment' })}
                className="w-full text-xs sm:text-sm"
                size="sm"
              >
                💳 Paiement
              </Button>
              <Button
                type="button"
                variant={formData.payment_type === 'reimbursement' ? 'default' : 'outline'}
                onClick={() => setFormData({ ...formData, payment_type: 'reimbursement' })}
                className="w-full text-xs sm:text-sm"
                size="sm"
              >
                💰 Remboursement
              </Button>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description *</Label>
            <Textarea
              placeholder="Ex: Achat ordinateur portable"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={2}
            />
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Montant Total *</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.total_amount}
                onChange={(e) => setFormData({ ...formData, total_amount: e.target.value.replace(/,/g, '.') })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Montant par échéance *</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.installment_amount}
                onChange={(e) => setFormData({ ...formData, installment_amount: e.target.value.replace(/,/g, '.') })}
                required
              />
            </div>
          </div>

          {/* Frequency + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fréquence *</Label>
              <Select
                value={formData.frequency}
                onValueChange={(value: 'weekly' | 'monthly' | 'quarterly') => setFormData({ ...formData, frequency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Hebdomadaire</SelectItem>
                  <SelectItem value="monthly">Mensuel</SelectItem>
                  <SelectItem value="quarterly">Trimestriel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prochain paiement *</Label>
              <DatePicker
                date={formData.next_payment_date}
                onDateChange={(d) => d && setFormData({ ...formData, next_payment_date: d })}
                placeholder="Choisir une date"
              />
            </div>
          </div>

          {/* Account */}
          <div className="space-y-1.5">
            <Label>Compte source *</Label>
            <Select
              value={formData.account_id}
              onValueChange={(value) => setFormData({ ...formData, account_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un compte" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Catégorie</Label>
            <Select
              value={formData.category_id}
              onValueChange={(value) => setFormData({ ...formData, category_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Optionnel" />
              </SelectTrigger>
              <SelectContent>
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
        </form>

        {/* Footer */}
        <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="flex-1 h-9 text-xs sm:text-sm"
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="flex-1 h-9 text-xs sm:text-sm">
            {loading ? 'Modification...' : 'Modifier'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
