import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, MinusCircle, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';

interface NewTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewTransactionModal({ open, onOpenChange }: NewTransactionModalProps) {
  const { toast } = useToast();
  const { accounts, categories, transactions, createTransaction } = useFinancialData();
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense',
    account_id: '',
    category_id: '',
    transaction_date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.description || !formData.amount || !formData.account_id) {
      toast({
        title: "Informations manquantes",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    const { error } = await createTransaction({
      description: formData.description,
      amount: parseFloat(formData.amount),
      type: formData.type,
      account_id: formData.account_id,
      category_id: formData.category_id || undefined,
      transaction_date: formData.transaction_date,
    });

    if (error) {
      toast({
        title: "Erreur lors de la création",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Transaction créée",
        description: `${formData.type === 'income' ? 'Revenus' : 'Dépense'} de ${formData.amount}€ ajoutée avec succès.`,
      });
      
      // Reset form
      setFormData({
        description: '',
        amount: '',
        type: 'expense',
        account_id: '',
        category_id: '',
        transaction_date: new Date().toISOString().split('T')[0]
      });
      
      onOpenChange(false);
    }
    
    setLoading(false);
  };

  const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
  const selectedCategory = categories.find(cat => cat.id === formData.category_id);

  // Calculate transaction impact preview
  const transactionPreview = useMemo(() => {
    if (!selectedAccount || !formData.amount) return null;

    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) return null;

    const impact = formData.type === 'income' ? amount : -amount;
    const newBalance = selectedAccount.balance + impact;
    
    let budgetImpact = null;
    if (selectedCategory && selectedCategory.budget && formData.type === 'expense') {
      // Calculate current month expenses for this category
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      const monthlyExpenses = transactions
        .filter(t => {
          const tDate = new Date(t.transaction_date);
          return t.category?.name === selectedCategory.name &&
                 t.type === 'expense' &&
                 tDate.getMonth() === currentMonth &&
                 tDate.getFullYear() === currentYear;
        })
        .reduce((sum, t) => sum + t.amount, 0);

      const newCategorySpent = monthlyExpenses + amount;
      const budgetUsagePercent = (newCategorySpent / selectedCategory.budget) * 100;
      
      budgetImpact = {
        currentSpent: monthlyExpenses,
        newSpent: newCategorySpent,
        budget: selectedCategory.budget,
        usagePercent: budgetUsagePercent,
        isOverBudget: budgetUsagePercent > 100
      };
    }

    return {
      currentBalance: selectedAccount.balance,
      impact,
      newBalance,
      budgetImpact
    };
  }, [selectedAccount, formData.amount, formData.type, selectedCategory, transactions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {formData.type === 'income' ? (
              <PlusCircle className="h-5 w-5 text-green-500" />
            ) : (
              <MinusCircle className="h-5 w-5 text-red-500" />
            )}
            Nouvelle Transaction
          </DialogTitle>
          <DialogDescription>
            Ajouter une nouvelle transaction de type {formData.type === 'income' ? 'revenus' : 'dépense'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Transaction Type Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={formData.type === 'income' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData({ ...formData, type: 'income' })}
              className="flex-1"
            >
              <PlusCircle className="h-4 w-4 mr-1" />
              Revenus
            </Button>
            <Button
              type="button"
              variant={formData.type === 'expense' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData({ ...formData, type: 'expense' })}
              className="flex-1"
            >
              <MinusCircle className="h-4 w-4 mr-1" />
              Dépense
            </Button>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Saisissez la description de la transaction..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
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
                Solde actuel: {selectedAccount.balance.toFixed(2)}€
              </div>
            )}
            {accounts.length === 0 && (
              <div className="text-sm text-muted-foreground text-red-500">
                Aucun compte trouvé. Veuillez d'abord créer un compte.
              </div>
            )}
          </div>

          {/* Category Selection */}
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

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.transaction_date}
              onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
            />
          </div>

          {/* Transaction Preview */}
          {transactionPreview && (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Eye className="w-4 h-4" />
                  Prévisualisation de l'impact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Account Balance Impact */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{selectedAccount?.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Solde actuel: {transactionPreview.currentBalance.toLocaleString('fr-FR', { 
                        style: 'currency', 
                        currency: 'EUR' 
                      })}</span>
                      <span>•</span>
                      <span className={`flex items-center gap-1 ${
                        transactionPreview.impact >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transactionPreview.impact >= 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {transactionPreview.impact >= 0 ? '+' : ''}{transactionPreview.impact.toLocaleString('fr-FR', { 
                          style: 'currency', 
                          currency: 'EUR' 
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Nouveau solde</p>
                    <p className={`font-semibold ${
                      transactionPreview.newBalance >= 0 ? 'text-foreground' : 'text-red-600'
                    }`}>
                      {transactionPreview.newBalance.toLocaleString('fr-FR', { 
                        style: 'currency', 
                        currency: 'EUR' 
                      })}
                    </p>
                  </div>
                </div>

                {/* Budget Impact */}
                {transactionPreview.budgetImpact && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: selectedCategory?.color }}
                        />
                        <span className="text-sm font-medium">{selectedCategory?.name}</span>
                      </div>
                      <Badge variant={transactionPreview.budgetImpact.isOverBudget ? 'destructive' : 'secondary'}>
                        {transactionPreview.budgetImpact.usagePercent.toFixed(0)}%
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex justify-between">
                        <span>Dépensé ce mois:</span>
                        <span>{transactionPreview.budgetImpact.currentSpent.toLocaleString('fr-FR', { 
                          style: 'currency', 
                          currency: 'EUR' 
                        })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Après cette transaction:</span>
                        <span className={transactionPreview.budgetImpact.isOverBudget ? 'text-red-600 font-medium' : ''}>
                          {transactionPreview.budgetImpact.newSpent.toLocaleString('fr-FR', { 
                            style: 'currency', 
                            currency: 'EUR' 
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Budget mensuel:</span>
                        <span>{transactionPreview.budgetImpact.budget.toLocaleString('fr-FR', { 
                          style: 'currency', 
                          currency: 'EUR' 
                        })}</span>
                      </div>
                      {transactionPreview.budgetImpact.isOverBudget && (
                        <div className="text-red-600 font-medium pt-1">
                          ⚠️ Dépassement du budget de {((transactionPreview.budgetImpact.usagePercent - 100)).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading || accounts.length === 0}>
              {loading ? 'Création...' : `Créer ${formData.type === 'income' ? 'revenus' : 'dépense'}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}