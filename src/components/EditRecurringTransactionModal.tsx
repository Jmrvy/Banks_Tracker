import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, MinusCircle, Repeat, Clock, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData, RecurringTransaction } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { DatePicker } from '@/components/ui/date-picker';

interface EditRecurringTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: RecurringTransaction | null;
}

export function EditRecurringTransactionModal({ open, onOpenChange, transaction }: EditRecurringTransactionModalProps) {
  const { toast } = useToast();
  const { formatCurrency } = useUserPreferences();
  const { accounts, categories, updateRecurringTransaction } = useFinancialData();
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense',
    account_id: '',
    category_id: '',
    recurrence_type: 'monthly' as 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    start_date: new Date().toISOString().split('T')[0],
    end_date: ''
  });
  const [loading, setLoading] = useState(false);

  // Load transaction data when modal opens
  useEffect(() => {
    if (transaction && open) {
      // Filter recurrence_type to only supported values
      const supportedRecurrence = ['weekly', 'monthly', 'quarterly', 'yearly'];
      const recurrenceType = supportedRecurrence.includes(transaction.recurrence_type) 
        ? transaction.recurrence_type as 'weekly' | 'monthly' | 'quarterly' | 'yearly'
        : 'monthly';
        
      setFormData({
        description: transaction.description,
        amount: transaction.amount.toString(),
        type: transaction.type,
        account_id: transaction.account_id,
        category_id: transaction.category_id || '',
        recurrence_type: recurrenceType,
        start_date: transaction.start_date,
        end_date: transaction.end_date || ''
      });
    }
  }, [transaction, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transaction || !formData.description || !formData.amount || !formData.account_id) {
      toast({
        title: "Informations manquantes",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    const result = await updateRecurringTransaction(transaction.id, {
      description: formData.description,
      amount: parseFloat(formData.amount),
      type: formData.type,
      account_id: formData.account_id,
      category_id: formData.category_id || undefined,
      recurrence_type: formData.recurrence_type,
      start_date: formData.start_date,
      end_date: formData.end_date || undefined,
    });

    if (result?.error) {
      toast({
        title: "Erreur lors de la modification",
        description: result.error.message,
        variant: "destructive",
      });
    } else {
      const typeLabel = formData.type === 'income' ? 'Revenus récurrents' : 'Dépense récurrente';
      toast({
        title: `${typeLabel} modifié${formData.type === 'income' ? 's' : 'e'}`,
        description: `${typeLabel} de ${formData.amount}€ mis à jour avec succès.`,
      });
      
      onOpenChange(false);
    }
    
    setLoading(false);
  };

  const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
  const selectedCategory = categories.find(cat => cat.id === formData.category_id);

  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Chaque semaine';
      case 'monthly': return 'Chaque mois';
      case 'quarterly': return 'Chaque trimestre';
      case 'yearly': return 'Chaque année';
      default: return type;
    }
  };

  // Parse "YYYY-MM-DD" as local date to avoid UTC shift bugs
  const parseLocalDate = (dateStr: string): Date => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  // Show the actual next_due_date from the DB transaction.
  // If the user changed start_date or recurrence_type, recalculate a preview.
  const getNextExecutionDate = (): Date | null => {
    if (!transaction) return null;

    const startChanged = formData.start_date !== transaction.start_date;
    const recurrenceChanged = formData.recurrence_type !== transaction.recurrence_type;

    // If no recurrence config changed, show the real DB value
    if (!startChanged && !recurrenceChanged) {
      return parseLocalDate(transaction.next_due_date);
    }

    // Otherwise, recalculate what next_due_date would be
    if (!formData.start_date) return null;
    const startDate = parseLocalDate(formData.start_date);
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Safe date advancement helper
    const addInterval = (d: Date): Date => {
      const cy = d.getFullYear(), cm = d.getMonth(), cd = d.getDate();
      switch (formData.recurrence_type) {
        case 'weekly': return new Date(cy, cm, cd + 7);
        case 'monthly': {
          const next = new Date(cy, cm + 1, cd);
          return next.getMonth() !== (cm + 1) % 12 ? new Date(cy, cm + 2, 0) : next;
        }
        case 'quarterly': {
          const next = new Date(cy, cm + 3, cd);
          return next.getMonth() !== (cm + 3) % 12 ? new Date(cy, cm + 4, 0) : next;
        }
        case 'yearly': return new Date(cy + 1, cm, cd);
        default: return new Date(cy, cm + 1, cd);
      }
    };

    // Roll forward from start_date until we find a future date
    let nextDue = addInterval(startDate);
    while (nextDue <= todayMidnight) {
      nextDue = addInterval(nextDue);
    }
    return nextDue;
  };

  const nextExecution = getNextExecutionDate();

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg flex items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" />
            Modifier Transaction Récurrente
          </DialogTitle>
          <DialogDescription>
            Modifier une transaction qui se répète automatiquement
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
        <form id="edit-recurring-form" onSubmit={handleSubmit} className="space-y-6">
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
              placeholder="Ex: Salaire mensuel, Loyer, Abonnement Netflix..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Montant *</Label>
            <AmountInput
              id="amount"
              placeholder="0.00"
              value={formData.amount}
              onChange={(value) => setFormData({ ...formData, amount: value })}
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

          {/* Category Selection (Expense only) */}
          {formData.type === 'expense' && (
            <div className="space-y-2">
              <Label htmlFor="category">Catégorie</Label>
              <Select 
                value={formData.category_id} 
                onValueChange={(value) => setFormData({ ...formData, category_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une catégorie (optionnel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune catégorie</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: category.color }}
                        />
                        <span>{category.name}</span>
                        {category.budget && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Budget: {formatCurrency(category.budget)}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Recurrence Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Configuration de la récurrence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Recurrence Type */}
              <div className="space-y-2">
                <Label htmlFor="recurrence_type">Fréquence *</Label>
                <Select 
                  value={formData.recurrence_type} 
                  onValueChange={(value) => setFormData({ ...formData, recurrence_type: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Chaque semaine</SelectItem>
                    <SelectItem value="monthly">Chaque mois</SelectItem>
                    <SelectItem value="quarterly">Chaque trimestre</SelectItem>
                    <SelectItem value="yearly">Chaque année</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label>Date de début *</Label>
                <DatePicker
                  date={formData.start_date ? parseLocalDate(formData.start_date) : undefined}
                  onDateChange={(date) => {
                    if (!date) { setFormData({ ...formData, start_date: '' }); return; }
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    setFormData({ ...formData, start_date: `${y}-${m}-${d}` });
                  }}
                  placeholder="Sélectionner la date de début"
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>Date de fin (optionnel)</Label>
                <DatePicker
                  date={formData.end_date ? parseLocalDate(formData.end_date) : undefined}
                  onDateChange={(date) => {
                    if (!date) { setFormData({ ...formData, end_date: '' }); return; }
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    setFormData({ ...formData, end_date: `${y}-${m}-${d}` });
                  }}
                  placeholder="Sélectionner la date de fin"
                />
                <div className="text-xs text-muted-foreground">
                  Laissez vide pour une récurrence sans fin
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {formData.amount && formData.start_date && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Aperçu de la récurrence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Type:</strong> {formData.type === 'income' ? 'Revenus' : 'Dépense'}
                  </div>
                  <div>
                    <strong>Montant:</strong> {formatCurrency(parseFloat(formData.amount) || 0)}
                  </div>
                  <div>
                    <strong>Fréquence:</strong> {getRecurrenceLabel(formData.recurrence_type)}
                  </div>
                  <div>
                    <strong>Date de début:</strong> {parseLocalDate(formData.start_date).toLocaleDateString('fr-FR')}
                  </div>
                  {nextExecution && (
                    <div className="col-span-2">
                      <strong>Prochaine exécution:</strong> {nextExecution.toLocaleDateString('fr-FR')}
                    </div>
                  )}
                  {formData.end_date && (
                    <div className="col-span-2">
                      <strong>Fin de récurrence:</strong> {parseLocalDate(formData.end_date).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                </div>

                {selectedCategory && selectedCategory.budget && formData.type === 'expense' && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: selectedCategory.color }}
                      />
                      <span>
                        <strong>Impact sur le budget {selectedCategory.name}:</strong> 
                        {formatCurrency(parseFloat(formData.amount) || 0)} par {formData.recurrence_type === 'weekly' ? 'semaine' : formData.recurrence_type === 'monthly' ? 'mois' : formData.recurrence_type === 'quarterly' ? 'trimestre' : 'an'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </form>
        </div>

          {/* Form Actions */}
          <div className="flex gap-2 p-4 sm:px-6 flex-shrink-0 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-9 text-xs sm:text-sm"
            >
              Annuler
            </Button>
            <Button type="submit" form="edit-recurring-form" disabled={loading} className="h-9 text-xs sm:text-sm">
              {loading ? 'Modification...' : 'Enregistrer les modifications'}
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  );
}

export default EditRecurringTransactionModal;
