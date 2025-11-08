import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData, type Transaction } from '@/hooks/useFinancialData';

interface EditTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
}

export function EditTransactionModal({ open, onOpenChange, transaction }: EditTransactionModalProps) {
  const { toast } = useToast();
  const { accounts, categories, updateTransaction } = useFinancialData();
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    account_id: '',
    category_id: '',
    transaction_date: '',
    value_date: '',
    transfer_to_account_id: '',
    transfer_fee: ''
  });
  const [loading, setLoading] = useState(false);

  // Update form data when transaction changes
  useEffect(() => {
    if (transaction) {
      setFormData({
        description: transaction.description,
        amount: Math.abs(transaction.amount).toString(),
        type: transaction.type,
        account_id: transaction.account_id,
        category_id: transaction.category?.id || '',
        transaction_date: transaction.transaction_date,
        value_date: transaction.value_date || transaction.transaction_date,
        transfer_to_account_id: transaction.transfer_to_account_id || '',
        transfer_fee: transaction.transfer_fee?.toString() || ''
      });
    }
  }, [transaction]);

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      type: 'expense',
      account_id: '',
      category_id: '',
      transaction_date: '',
      value_date: '',
      transfer_to_account_id: '',
      transfer_fee: ''
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    
    // Pour les transferts, la description n'est pas obligatoire
    const descriptionRequired = formData.type !== 'transfer';
    
    if ((descriptionRequired && !formData.description) || !formData.amount || !formData.account_id) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const updates = {
      description: formData.description || (formData.type === 'transfer' ? 'Transfert' : ''),
      amount: parseFloat(formData.amount),
      type: formData.type,
      account_id: formData.account_id,
      category_id: formData.category_id || undefined,
      transaction_date: formData.transaction_date,
      value_date: formData.value_date,
      ...(formData.type === 'transfer' && {
        transfer_to_account_id: formData.transfer_to_account_id,
        transfer_fee: formData.transfer_fee ? parseFloat(formData.transfer_fee) : 0
      })
    };

    const { error } = await updateTransaction(transaction.id, updates);

    if (error) {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de la modification de la transaction",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Succès",
        description: "Transaction modifiée avec succès",
      });
      resetForm();
      onOpenChange(false);
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Modifier la transaction</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">
              Description {formData.type !== 'transfer' && '*'}
            </Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder={formData.type === 'transfer' ? "Description (optionnelle)" : "Ex: Courses Carrefour"}
              required={formData.type !== 'transfer'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Montant *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as any }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Dépense</SelectItem>
                <SelectItem value="income">Revenu</SelectItem>
                <SelectItem value="transfer">Virement</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Compte *</Label>
            <Select
              value={formData.account_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, account_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un compte" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.type === 'transfer' && (
            <>
              <div className="space-y-2">
                <Label>Vers le compte *</Label>
                <Select
                  value={formData.transfer_to_account_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, transfer_to_account_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un compte" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(account => account.id !== formData.account_id).map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frais de virement</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.transfer_fee}
                  onChange={(e) => setFormData(prev => ({ ...prev, transfer_fee: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </>
          )}

          {formData.type !== 'transfer' && (
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value === 'none' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune catégorie</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Date Comptable *</Label>
            <Input
              type="date"
              value={formData.transaction_date}
              onChange={(e) => {
                const newDate = e.target.value;
                setFormData(prev => ({ 
                  ...prev, 
                  transaction_date: newDate,
                  // Mettre à jour value_date seulement si elle est égale à l'ancienne transaction_date
                  value_date: prev.value_date === prev.transaction_date ? newDate : prev.value_date
                }));
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Date Valeur *</Label>
            <Input
              type="date"
              value={formData.value_date}
              onChange={(e) => setFormData(prev => ({ ...prev, value_date: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Date effective de la transaction
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Modification...' : 'Modifier'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}