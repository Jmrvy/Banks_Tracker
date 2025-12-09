import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, MinusCircle, ArrowRightLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { DatePicker } from '@/components/ui/date-picker';
import { transactionSchemaWithTransfer, validateForm } from '@/lib/validations';

interface NewTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewTransactionModal = ({ open, onOpenChange }: NewTransactionModalProps) => {
  const { toast } = useToast();
  const { formatCurrency } = useUserPreferences();
  const { accounts, categories, createTransaction, createTransfer } = useFinancialData();
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    account_id: '',
    to_account_id: '',
    category_id: '',
    transfer_fee: '',
    transaction_date: new Date().toISOString().split('T')[0],
    value_date: new Date().toISOString().split('T')[0],
    include_in_stats: true
  });
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      type: 'expense',
      account_id: '',
      to_account_id: '',
      category_id: '',
      transfer_fee: '',
      transaction_date: new Date().toISOString().split('T')[0],
      value_date: new Date().toISOString().split('T')[0],
      include_in_stats: true
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data with zod schema
    const validation = validateForm(transactionSchemaWithTransfer, {
      ...formData,
      to_account_id: formData.to_account_id || undefined,
    });
    
    if (!validation.success) {
      toast({
        title: "Erreur de validation",
        description: (validation as { success: false; error: string }).error,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    let error;
    
    if (formData.type === 'transfer') {
      const result = await createTransfer({
        description: formData.description || 'Transfert',
        amount: parseFloat(formData.amount),
        from_account_id: formData.account_id,
        to_account_id: formData.to_account_id,
        transfer_fee: formData.transfer_fee ? parseFloat(formData.transfer_fee) : 0,
        transaction_date: formData.transaction_date,
      });
      error = result?.error;
    } else {
      const result = await createTransaction({
        description: formData.description,
        amount: parseFloat(formData.amount),
        type: formData.type as 'income' | 'expense',
        account_id: formData.account_id,
        category_id: formData.category_id || undefined,
        transaction_date: formData.transaction_date,
        value_date: formData.value_date,
        include_in_stats: formData.include_in_stats,
      });
      error = result?.error;
    }

    if (error) {
      toast({
        title: "Erreur lors de la création",
        description: error.message,
        variant: "destructive",
      });
    } else {
      const typeLabel = formData.type === 'income' ? 'Revenus' : 
                       formData.type === 'transfer' ? 'Transfert' : 'Dépense';
      toast({
        title: `${typeLabel} créé${formData.type === 'transfer' ? '' : 'e'}`,
        description: `${typeLabel} de ${formData.amount}€ ajouté${formData.type === 'transfer' ? '' : 'e'} avec succès.`,
      });
      
      resetForm();
      onOpenChange(false);
    }
    
    setLoading(false);
  };

  const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
  const selectedToAccount = accounts.find(acc => acc.id === formData.to_account_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Nouvelle Transaction</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4 pt-2 sm:pt-4">
          {/* Transaction Type Toggle */}
          <div className="flex gap-1.5 sm:gap-2">
            <Button
              type="button"
              variant={formData.type === 'income' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData({ ...formData, type: 'income' })}
              className="flex-1 h-9 sm:h-10 text-xs sm:text-sm px-2 sm:px-3"
            >
              <PlusCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
              <span className="hidden xs:inline">Revenus</span>
              <span className="xs:hidden">+</span>
            </Button>
            <Button
              type="button"
              variant={formData.type === 'expense' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData({ ...formData, type: 'expense' })}
              className="flex-1 h-9 sm:h-10 text-xs sm:text-sm px-2 sm:px-3"
            >
              <MinusCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
              <span className="hidden xs:inline">Dépense</span>
              <span className="xs:hidden">-</span>
            </Button>
            <Button
              type="button"
              variant={formData.type === 'transfer' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData({ ...formData, type: 'transfer' })}
              className="flex-1 h-9 sm:h-10 text-xs sm:text-sm px-2 sm:px-3"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
              <span className="hidden xs:inline">Transfert</span>
              <span className="xs:hidden">⇄</span>
            </Button>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Description {formData.type !== 'transfer' && '*'}
            </Label>
            <Textarea
              id="description"
              placeholder={formData.type === 'transfer' ? "Description (optionnelle)..." : "Saisissez la description..."}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required={formData.type !== 'transfer'}
              rows={2}
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Montant *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>

          {/* Account Selection */}
          <div className="space-y-2">
            <Label htmlFor="account">Compte *</Label>
            <Select 
              value={formData.account_id} 
              onValueChange={(value) => setFormData({ ...formData, account_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un compte" />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 ? (
                  <SelectItem value="no-accounts" disabled>
                    Aucun compte disponible
                  </SelectItem>
                ) : (
                  accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{account.name}</span>
                        <Badge variant="outline" className="ml-2 text-xs">
                          {formatCurrency(account.balance)}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedAccount && (
              <div className="text-sm text-muted-foreground">
                Solde actuel: {formatCurrency(selectedAccount.balance)}
              </div>
            )}
          </div>

          {/* Destination Account Selection (Transfer only) */}
          {formData.type === 'transfer' && (
            <div className="space-y-2">
              <Label htmlFor="to_account">Compte de destination *</Label>
              <Select 
                value={formData.to_account_id} 
                onValueChange={(value) => setFormData({ ...formData, to_account_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner le compte de destination" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter(acc => acc.id !== formData.account_id).map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{account.name}</span>
                        <Badge variant="outline" className="ml-2 text-xs">
                          {formatCurrency(account.balance)}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedToAccount && (
                <div className="text-sm text-muted-foreground">
                  Solde actuel: {formatCurrency(selectedToAccount.balance)}
                </div>
              )}
            </div>
          )}

          {/* Transfer Fee (Transfer only) */}
          {formData.type === 'transfer' && (
            <div className="space-y-2">
              <Label htmlFor="transfer_fee">Frais de transfert (optionnel)</Label>
              <Input
                id="transfer_fee"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.transfer_fee}
                onChange={(e) => setFormData({ ...formData, transfer_fee: e.target.value })}
              />
            </div>
          )}

          {/* Category Selection (Not for transfers) */}
          {formData.type !== 'transfer' && (
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
          )}

          {/* Transaction Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">Date Comptable *</Label>
              <DatePicker
                date={formData.transaction_date ? new Date(formData.transaction_date) : undefined}
                onDateChange={(date) => {
                  const newDate = date ? date.toISOString().split('T')[0] : '';
                  setFormData(prev => ({ 
                    ...prev, 
                    transaction_date: newDate,
                    // Sync value_date only if it matches the old transaction_date
                    value_date: prev.value_date === prev.transaction_date ? newDate : prev.value_date
                  }));
                }}
                placeholder="Date comptable"
              />
            </div>
            
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">Date Valeur *</Label>
              <DatePicker
                date={formData.value_date ? new Date(formData.value_date) : undefined}
                onDateChange={(date) => setFormData({ ...formData, value_date: date ? date.toISOString().split('T')[0] : '' })}
                placeholder="Date valeur"
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Par défaut = date comptable
              </p>
            </div>
          </div>

          {/* Include in Stats Toggle */}
          <div className="flex items-center justify-between space-x-2 p-4 border border-border rounded-lg bg-accent/30">
            <div className="space-y-0.5">
              <Label htmlFor="include_in_stats" className="text-sm font-medium">
                Inclure dans les statistiques
              </Label>
              <p className="text-xs text-muted-foreground">
                Si désactivé, cette transaction n'apparaîtra pas dans les calculs de revenus/dépenses
              </p>
            </div>
            <Switch
              id="include_in_stats"
              checked={formData.include_in_stats}
              onCheckedChange={(checked) => setFormData({ ...formData, include_in_stats: checked })}
            />
          </div>

          {/* Actions */}
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
