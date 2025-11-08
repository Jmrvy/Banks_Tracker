import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, MinusCircle, ArrowRightLeft, ArrowLeft, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useNavigate } from 'react-router-dom';
import { useUserPreferences } from '@/hooks/useUserPreferences';

const NewTransaction = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { formatCurrency } = useUserPreferences();
  const { accounts, categories, transactions, createTransaction, createTransfer } = useFinancialData();
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    account_id: '',
    to_account_id: '',
    category_id: '',
    transfer_fee: '',
    transaction_date: new Date().toISOString().split('T')[0],
    value_date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Pour les transferts, la description n'est pas obligatoire
    const descriptionRequired = formData.type !== 'transfer';
    
    if ((descriptionRequired && !formData.description) || !formData.amount || !formData.account_id) {
      toast({
        title: "Informations manquantes",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    if (formData.type === 'transfer' && !formData.to_account_id) {
      toast({
        title: "Compte de destination requis",
        description: "Veuillez sélectionner un compte de destination pour le transfert.",
        variant: "destructive",
      });
      return;
    }

    if (formData.type === 'transfer' && formData.account_id === formData.to_account_id) {
      toast({
        title: "Comptes identiques",
        description: "Le compte source et le compte de destination doivent être différents.",
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
        value_date: formData.value_date,
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
      
      // Reset form
      setFormData({
        description: '',
        amount: '',
        type: 'expense',
        account_id: '',
        to_account_id: '',
        category_id: '',
        transfer_fee: '',
        transaction_date: new Date().toISOString().split('T')[0],
        value_date: new Date().toISOString().split('T')[0]
      });
      
      navigate('/');
    }
    
    setLoading(false);
  };

  const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
  const selectedToAccount = accounts.find(acc => acc.id === formData.to_account_id);
  const selectedCategory = categories.find(cat => cat.id === formData.category_id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-accent/5 pb-24">
      <div className="container mx-auto px-3 sm:px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/")}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Plus className="h-6 w-6 text-primary" />
              Nouvelle Transaction
            </h1>
            <p className="text-sm text-muted-foreground">
              Ajouter une transaction
            </p>
          </div>
        </div>


        <div className="space-y-3 sm:space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              {/* Transaction Type Toggle */}
              <div className="flex gap-1.5 sm:gap-2">
                <Button
                  type="button"
                  variant={formData.type === 'income' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, type: 'income' })}
                  className="flex-1 h-8 sm:h-9 text-xs sm:text-sm"
                >
                  <PlusCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  <span className="hidden sm:inline">Revenus</span>
                  <span className="sm:hidden">+</span>
                </Button>
                <Button
                  type="button"
                  variant={formData.type === 'expense' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, type: 'expense' })}
                  className="flex-1 h-8 sm:h-9 text-xs sm:text-sm"
                >
                  <MinusCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  <span className="hidden sm:inline">Dépense</span>
                  <span className="sm:hidden">-</span>
                </Button>
                <Button
                  type="button"
                  variant={formData.type === 'transfer' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, type: 'transfer' })}
                  className="flex-1 h-8 sm:h-9 text-xs sm:text-sm"
                >
                  <ArrowRightLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  <span className="hidden sm:inline">Transfert</span>
                  <span className="sm:hidden">⇄</span>
                </Button>
              </div>

              {/* Description */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="description" className="text-xs sm:text-sm">
                  Description {formData.type !== 'transfer' && '*'}
                </Label>
                <Textarea
                  id="description"
                  placeholder={formData.type === 'transfer' ? "Description (optionnelle)..." : "Description..."}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required={formData.type !== 'transfer'}
                  className="min-h-[60px] sm:min-h-[80px] text-xs sm:text-sm"
                />
              </div>

              {/* Amount */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="amount" className="text-xs sm:text-sm">Montant *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  className="h-8 sm:h-10 text-xs sm:text-sm"
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
                              {account.bank.replace(/_/g, ' ').toUpperCase()}
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
                              {account.bank.replace(/_/g, ' ').toUpperCase()}
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

              {/* Transaction Date */}
              <div className="space-y-2">
                <Label htmlFor="date">Date Comptable *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.transaction_date}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setFormData({ 
                      ...formData, 
                      transaction_date: newDate,
                      // Mettre à jour value_date seulement si elle est égale à l'ancienne transaction_date
                      value_date: formData.value_date === formData.transaction_date ? newDate : formData.value_date
                    });
                  }}
                  required
                />
              </div>

              {/* Value Date */}
              <div className="space-y-2">
                <Label htmlFor="value_date">Date Valeur *</Label>
                <Input
                  id="value_date"
                  type="date"
                  value={formData.value_date}
                  onChange={(e) => setFormData({ ...formData, value_date: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Date effective de la transaction (par défaut = date comptable)
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/')}
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
        </div>
      </div>
    </div>
  );
};

export default NewTransaction;
