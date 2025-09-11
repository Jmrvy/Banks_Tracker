import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, MinusCircle, TrendingUp, TrendingDown, Eye, ArrowRightLeft, Repeat, Calendar, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useNavigate } from 'react-router-dom';
import { useUserPreferences } from '@/hooks/useUserPreferences';

interface NewTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewTransactionModal({ open, onOpenChange }: NewTransactionModalProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { formatCurrency } = useUserPreferences();
  const { accounts, categories, transactions, createTransaction, createTransfer, createRecurringTransaction } = useFinancialData();
  
  const [activeTab, setActiveTab] = useState('transaction');
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    account_id: '',
    to_account_id: '',
    category_id: '',
    transfer_fee: '',
    transaction_date: new Date().toISOString().split('T')[0]
  });
  const [recurringFormData, setRecurringFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense',
    account_id: '',
    category_id: '',
    recurrence_type: 'monthly' as 'weekly' | 'monthly' | 'yearly',
    start_date: new Date().toISOString().split('T')[0],
    end_date: ''
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
        description: formData.description,
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
        transaction_date: new Date().toISOString().split('T')[0]
      });
      
      onOpenChange(false);
    }
    
    setLoading(false);
  };

  const handleRecurringSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!recurringFormData.description || !recurringFormData.amount || !recurringFormData.account_id) {
      toast({
        title: "Informations manquantes",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    const result = await createRecurringTransaction({
      description: recurringFormData.description,
      amount: parseFloat(recurringFormData.amount),
      type: recurringFormData.type,
      account_id: recurringFormData.account_id,
      category_id: recurringFormData.category_id || undefined,
      recurrence_type: recurringFormData.recurrence_type,
      start_date: recurringFormData.start_date,
      end_date: recurringFormData.end_date || undefined,
    });

    if (result?.error) {
      toast({
        title: "Erreur lors de la création",
        description: result.error.message,
        variant: "destructive",
      });
    } else {
      const typeLabel = recurringFormData.type === 'income' ? 'Revenus récurrents' : 'Dépense récurrente';
      toast({
        title: `${typeLabel} créé${recurringFormData.type === 'income' ? 's' : 'e'}`,
        description: `${typeLabel} de ${recurringFormData.amount}€ programmé${recurringFormData.type === 'income' ? 's' : 'e'} avec succès.`,
      });
      
      // Reset form
      setRecurringFormData({
        description: '',
        amount: '',
        type: 'expense',
        account_id: '',
        category_id: '',
        recurrence_type: 'monthly',
        start_date: new Date().toISOString().split('T')[0],
        end_date: ''
      });
      
      onOpenChange(false);
    }
    
    setLoading(false);
  };

  const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
  const selectedToAccount = accounts.find(acc => acc.id === formData.to_account_id);
  const selectedCategory = categories.find(cat => cat.id === formData.category_id);
  
  // For recurring transactions
  const recurringSelectedAccount = accounts.find(acc => acc.id === recurringFormData.account_id);
  const recurringSelectedCategory = categories.find(cat => cat.id === recurringFormData.category_id);

  // Calculate transaction impact preview
  const transactionPreview = useMemo(() => {
    if (!selectedAccount || !formData.amount) return null;

    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) return null;

    let impact = 0;
    let toAccountImpact = 0;
    let newToAccountBalance = 0;
    let totalCost = amount;

    if (formData.type === 'transfer') {
      const transferFee = formData.transfer_fee ? parseFloat(formData.transfer_fee) : 0;
      totalCost = amount + transferFee;
      impact = -totalCost;
      toAccountImpact = amount;
      newToAccountBalance = selectedToAccount ? selectedToAccount.balance + toAccountImpact : 0;
    } else {
      impact = formData.type === 'income' ? amount : -amount;
    }

    const newBalance = selectedAccount.balance + impact;
    
    let budgetImpact = null;
    if (selectedCategory && selectedCategory.budget && formData.type === 'expense') {
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
      budgetImpact,
      isTransfer: formData.type === 'transfer',
      toAccountImpact,
      newToAccountBalance,
      totalCost
    };
  }, [selectedAccount, selectedToAccount, formData.amount, formData.type, formData.transfer_fee, selectedCategory, transactions]);

  // Recurring transaction preview helpers
  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Chaque semaine';
      case 'monthly': return 'Chaque mois';  
      case 'yearly': return 'Chaque année';
      default: return type;
    }
  };

  const getNextExecutionDate = () => {
    if (!recurringFormData.start_date) return null;
    
    const startDate = new Date(recurringFormData.start_date);
    const nextDate = new Date(startDate);
    
    switch (recurringFormData.recurrence_type) {
      case 'weekly':
        nextDate.setDate(startDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(startDate.getMonth() + 1);
        break;
      case 'yearly':
        nextDate.setFullYear(startDate.getFullYear() + 1);
        break;
    }
    
    return nextDate;
  };

  const nextExecution = getNextExecutionDate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            Nouvelle Transaction
          </DialogTitle>
          <DialogDescription>
            Créer une transaction ponctuelle ou récurrente
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="transaction" className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              Transaction
            </TabsTrigger>
            <TabsTrigger value="recurring" className="flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              Récurrente
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transaction" className="space-y-4 mt-4">
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
                <Button
                  type="button"
                  variant={formData.type === 'transfer' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, type: 'transfer' })}
                  className="flex-1"
                >
                  <ArrowRightLeft className="h-4 w-4 mr-1" />
                  Transfert
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
                  <div className="text-xs text-muted-foreground">
                    Les frais seront déduits du compte source en plus du montant du transfert.
                  </div>
                </div>
              )}

              {/* Category Selection */}
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
                        <p className="text-sm font-medium">
                          {selectedAccount?.name} 
                          {transactionPreview.isTransfer && " (Source)"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Solde actuel: {formatCurrency(transactionPreview.currentBalance)}</span>
                          <span>•</span>
                          <span className={`flex items-center gap-1 ${
                            transactionPreview.impact >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {transactionPreview.impact >= 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {transactionPreview.impact >= 0 ? '+' : ''}{formatCurrency(transactionPreview.impact)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Nouveau solde</p>
                        <p className={`font-semibold ${
                          transactionPreview.newBalance >= 0 ? 'text-foreground' : 'text-red-600'
                        }`}>
                          {formatCurrency(transactionPreview.newBalance)}
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
                            <span>Budget mensuel:</span>
                            <span>{formatCurrency(transactionPreview.budgetImpact.budget)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Dépensé ce mois:</span>
                            <span>{formatCurrency(transactionPreview.budgetImpact.currentSpent)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Après cette transaction:</span>
                            <span className={transactionPreview.budgetImpact.isOverBudget ? 'text-red-600 font-medium' : ''}>
                              {formatCurrency(transactionPreview.budgetImpact.newSpent)}
                            </span>
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading || accounts.length === 0}
                  className="flex-1"
                >
                  {loading ? "Création..." : "Créer Transaction"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="recurring" className="space-y-4 mt-4">
            <form onSubmit={handleRecurringSubmit} className="space-y-4">
              {/* Transaction Type Toggle for Recurring */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={recurringFormData.type === 'income' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRecurringFormData({ ...recurringFormData, type: 'income' })}
                  className="flex-1"
                >
                  <PlusCircle className="h-4 w-4 mr-1" />
                  Revenus
                </Button>
                <Button
                  type="button"
                  variant={recurringFormData.type === 'expense' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRecurringFormData({ ...recurringFormData, type: 'expense' })}
                  className="flex-1"
                >
                  <MinusCircle className="h-4 w-4 mr-1" />
                  Dépense
                </Button>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="recurring-description">Description *</Label>
                <Textarea
                  id="recurring-description"
                  placeholder="Ex: Salaire mensuel, Loyer, Abonnement Netflix..."
                  value={recurringFormData.description}
                  onChange={(e) => setRecurringFormData({ ...recurringFormData, description: e.target.value })}
                  required
                />
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="recurring-amount">Montant *</Label>
                <Input
                  id="recurring-amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={recurringFormData.amount}
                  onChange={(e) => setRecurringFormData({ ...recurringFormData, amount: e.target.value })}
                  required
                />
              </div>

              {/* Account Selection */}
              <div className="space-y-2">
                <Label htmlFor="recurring-account">Compte *</Label>
                <Select 
                  value={recurringFormData.account_id} 
                  onValueChange={(value) => setRecurringFormData({ ...recurringFormData, account_id: value })}
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
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <Label htmlFor="recurring-category">Catégorie</Label>
                <Select 
                  value={recurringFormData.category_id} 
                  onValueChange={(value) => setRecurringFormData({ ...recurringFormData, category_id: value })}
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

              {/* Recurrence Type */}
              <div className="space-y-2">
                <Label htmlFor="recurrence">Fréquence *</Label>
                <Select 
                  value={recurringFormData.recurrence_type} 
                  onValueChange={(value: 'weekly' | 'monthly' | 'yearly') => 
                    setRecurringFormData({ ...recurringFormData, recurrence_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuelle</SelectItem>
                    <SelectItem value="yearly">Annuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label htmlFor="recurring-start-date">Date de début *</Label>
                <Input
                  id="recurring-start-date"
                  type="date"
                  value={recurringFormData.start_date}
                  onChange={(e) => setRecurringFormData({ ...recurringFormData, start_date: e.target.value })}
                  required
                />
              </div>

              {/* End Date (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="recurring-end-date">Date de fin (optionnel)</Label>
                <Input
                  id="recurring-end-date"
                  type="date"
                  value={recurringFormData.end_date}
                  onChange={(e) => setRecurringFormData({ ...recurringFormData, end_date: e.target.value })}
                  min={recurringFormData.start_date}
                />
                <div className="text-xs text-muted-foreground">
                  Laissez vide pour une récurrence infinie
                </div>
              </div>

              {/* Preview */}
              {recurringFormData.start_date && (
                <Card className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4" />
                      Récapitulatif de la récurrence
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Fréquence :</span>
                      <span className="font-medium">{getRecurrenceLabel(recurringFormData.recurrence_type)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Première exécution :</span>
                      <span className="font-medium">
                        {new Date(recurringFormData.start_date).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    {nextExecution && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Prochaine exécution :</span>
                        <span className="font-medium">
                          {nextExecution.toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    )}
                    {recurringFormData.end_date && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Fin :</span>
                        <span className="font-medium">
                          {new Date(recurringFormData.end_date).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    )}
                    {recurringSelectedAccount && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Impact sur {recurringSelectedAccount.name} :</span>
                        <span className={`font-medium ${recurringFormData.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                          {recurringFormData.type === 'income' ? '+' : '-'}{formatCurrency(parseFloat(recurringFormData.amount) || 0)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading || accounts.length === 0}
                  className="flex-1"
                >
                  {loading ? "Création..." : "Créer la récurrence"}
                </Button>
              </div>
            </form>

            {/* Link to manage existing recurring transactions */}
            <div className="pt-4 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/recurring-transactions");
                }}
                className="w-full flex items-center gap-2"
              >
                <Settings2 className="h-4 w-4" />
                Gérer les transactions récurrentes existantes
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}