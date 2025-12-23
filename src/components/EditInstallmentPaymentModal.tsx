import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useInstallmentPayments, InstallmentPayment } from '@/hooks/useInstallmentPayments';
import { useFinancialData } from '@/hooks/useFinancialData';

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
    next_payment_date: installmentPayment.next_payment_date,
    account_id: installmentPayment.account_id,
    category_id: installmentPayment.category_id || '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFormData({
      description: installmentPayment.description,
      total_amount: installmentPayment.total_amount.toString(),
      installment_amount: installmentPayment.installment_amount.toString(),
      frequency: installmentPayment.frequency,
      next_payment_date: installmentPayment.next_payment_date,
      account_id: installmentPayment.account_id,
      category_id: installmentPayment.category_id || '',
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
      next_payment_date: formData.next_payment_date,
      account_id: formData.account_id,
      category_id: formData.category_id || null,
    });

    if (error) {
      toast({
        title: "Erreur lors de la modification",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Paiement modifié",
        description: "Le paiement en plusieurs fois a été modifié avec succès.",
      });
      onOpenChange(false);
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le Paiement Échelonné</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Ex: Achat ordinateur portable"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total_amount">Montant Total *</Label>
              <Input
                id="total_amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={formData.total_amount}
                onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="installment_amount">Montant de la Mensualité *</Label>
              <Input
                id="installment_amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={formData.installment_amount}
                onChange={(e) => setFormData({ ...formData, installment_amount: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="frequency">Fréquence *</Label>
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

            <div className="space-y-2">
              <Label htmlFor="next_payment_date">Prochain Paiement *</Label>
              <Input
                id="next_payment_date"
                type="date"
                value={formData.next_payment_date}
                onChange={(e) => setFormData({ ...formData, next_payment_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account">Compte Source *</Label>
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

          <div className="space-y-2">
            <Label htmlFor="category">Catégorie</Label>
            <Select
              value={formData.category_id}
              onValueChange={(value) => setFormData({ ...formData, category_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une catégorie (optionnel)" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Modification...' : 'Modifier'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
