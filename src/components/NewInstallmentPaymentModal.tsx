import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useInstallmentPayments } from '@/hooks/useInstallmentPayments';
import { useFinancialData } from '@/hooks/useFinancialData';

interface NewInstallmentPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewInstallmentPaymentModal = ({ open, onOpenChange }: NewInstallmentPaymentModalProps) => {
  const { toast } = useToast();
  const { createInstallmentPayment } = useInstallmentPayments();
  const { accounts, categories } = useFinancialData();
  
  const [formData, setFormData] = useState({
    description: '',
    total_amount: '',
    installment_amount: '',
    frequency: 'monthly' as 'weekly' | 'monthly' | 'quarterly',
    start_date: new Date().toISOString().split('T')[0],
    account_id: '',
    category_id: '',
    payment_type: 'payment' as 'reimbursement' | 'payment',
  });
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setFormData({
      description: '',
      total_amount: '',
      installment_amount: '',
      frequency: 'monthly',
      start_date: new Date().toISOString().split('T')[0],
      account_id: '',
      category_id: '',
      payment_type: 'payment',
    });
  };

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

    const { error } = await createInstallmentPayment({
      description: formData.description,
      total_amount: parseFloat(formData.total_amount),
      installment_amount: parseFloat(formData.installment_amount),
      frequency: formData.frequency,
      start_date: formData.start_date,
      account_id: formData.account_id,
      category_id: formData.category_id || undefined,
      payment_type: formData.payment_type,
    });

    if (error) {
      toast({
        title: "Erreur lors de la création",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Paiement créé",
        description: "Le paiement en plusieurs fois a été créé avec succès.",
      });
      resetForm();
      onOpenChange(false);
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouveau Paiement en Plusieurs Fois</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Payment Type Selection */}
          <div className="space-y-2">
            <Label>Type de paiement *</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={formData.payment_type === 'payment' ? 'default' : 'outline'}
                onClick={() => setFormData({ ...formData, payment_type: 'payment' })}
                className="w-full"
              >
                <span className="mr-2">💳</span>
                Paiement
              </Button>
              <Button
                type="button"
                variant={formData.payment_type === 'reimbursement' ? 'default' : 'outline'}
                onClick={() => setFormData({ ...formData, payment_type: 'reimbursement' })}
                className="w-full"
              >
                <span className="mr-2">💰</span>
                Remboursement
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {formData.payment_type === 'payment'
                ? "Vous payez quelque chose en plusieurs fois (ex: achat, crédit)"
                : "Quelqu'un vous rembourse en plusieurs fois (ex: abonnement partagé) - apparaît dans les dépenses mais aussi comme entrée d'épargne"
              }
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder={formData.payment_type === 'payment'
                ? "Ex: Achat ordinateur portable"
                : "Ex: Prêt à Pierre"
              }
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="total_amount">Montant Total *</Label>
              <AmountInput
                id="total_amount"
                placeholder="0.00"
                value={formData.total_amount}
                onChange={(value) => setFormData({ ...formData, total_amount: value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="installment_amount">Montant de la Mensualité *</Label>
              <AmountInput
                id="installment_amount"
                placeholder="0.00"
                value={formData.installment_amount}
                onChange={(value) => setFormData({ ...formData, installment_amount: value })}
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
              <Label htmlFor="start_date">Date de Début *</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
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
              {loading ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};