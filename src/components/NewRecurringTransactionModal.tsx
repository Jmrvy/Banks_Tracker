import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, MinusCircle, Repeat, Calendar, Clock, Target, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { DatePicker } from '@/components/ui/date-picker';
import { AVAILABLE_PLACEHOLDERS, resolveNamePlaceholders, hasPlaceholders } from '@/utils/namePlaceholders';
import { parseLocalDate } from '@/lib/dateUtils';

interface NewRecurringTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewRecurringTransactionModal({ open, onOpenChange }: NewRecurringTransactionModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { formatCurrency } = useUserPreferences();
  const { accounts, categories, createRecurringTransaction } = useFinancialData();
  
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.description || !formData.amount || !formData.account_id) {
      toast({
        title: t('common.missingInfo'),
        description: t("common.fillAllRequired", { defaultValue: "Please fill in all required fields." }),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    const result = await createRecurringTransaction({
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
        title: t('transactions.createError'),
        description: result.error.message,
        variant: "destructive",
      });
    } else {
      const typeLabel = formData.type === 'income' ? 'Revenus récurrents' : 'Dépense récurrente';
      toast({
        title: `${typeLabel} créé${formData.type === 'income' ? 's' : 'e'}`,
        description: `${typeLabel} de ${formatCurrency(parseFloat(formData.amount) || 0)} programmé${formData.type === 'income' ? 's' : 'e'} avec succès.`,
      });
      
      // Reset form
      setFormData({
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
  const selectedCategory = categories.find(cat => cat.id === formData.category_id);

  // Recurring transaction preview helpers
  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Chaque semaine';
      case 'monthly': return 'Chaque mois';
      case 'quarterly': return 'Chaque trimestre';
      case 'yearly': return 'Chaque année';
      default: return type;
    }
  };

  const getNextExecutionDate = () => {
    if (!formData.start_date) return null;
    
    const startDate = parseLocalDate(formData.start_date);
    const nextDate = new Date(startDate);
    
    switch (formData.recurrence_type) {
      case 'weekly':
        nextDate.setDate(startDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(startDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(startDate.getMonth() + 3);
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
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <DialogTitle className="text-sm sm:text-lg flex items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" />
            Nouvelle Transaction Récurrente
          </DialogTitle>
          <DialogDescription>
            Créer une transaction qui se répète automatiquement selon la fréquence choisie
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
        <form id="new-recurring-form" onSubmit={handleSubmit} className="space-y-6">
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
              {t('common.income')}
            </Button>
            <Button
              type="button"
              variant={formData.type === 'expense' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData({ ...formData, type: 'expense' })}
              className="flex-1"
            >
              <MinusCircle className="h-4 w-4 mr-1" />
              {t('common.expense')}
            </Button>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="description">Description *</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs">
                    Utilisez les variables ci-dessous pour insérer automatiquement le mois ou l'année dans le nom de la transaction.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              id="description"
              placeholder="Ex: Loyer - {MOIS} {ANNEE}"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_PLACEHOLDERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setFormData({ ...formData, description: formData.description + p.key })}
                  className="text-[11px] px-2 py-0.5 rounded-md border border-border/60 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {p.key} <span className="text-muted-foreground/60 ml-0.5">{p.example}</span>
                </button>
              ))}
            </div>
            {hasPlaceholders(formData.description) && (
              <p className="text-xs text-primary">
                Aperçu : {resolveNamePlaceholders(formData.description, formData.start_date ? parseLocalDate(formData.start_date) : new Date())}
              </p>
            )}
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
                <SelectValue placeholder={t('common.selectAccount')} />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 ? (
                  <SelectItem value="no-accounts" disabled>
                    {t('common.noAccountsAvailable')}
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
                  <SelectValue placeholder={t('common.selectCategoryOptional')} />
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
                  onDateChange={(date) => setFormData({ ...formData, start_date: date ? date.toISOString().split('T')[0] : '' })}
                  placeholder={t('common.selectStartDate')}
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>Date de fin (optionnel)</Label>
                <DatePicker
                  date={formData.end_date ? parseLocalDate(formData.end_date) : undefined}
                  onDateChange={(date) => setFormData({ ...formData, end_date: date ? date.toISOString().split('T')[0] : '' })}
                  placeholder={t('common.selectEndDate')}
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
                    <strong>Type:</strong> {formData.type === 'income' ? t('common.income') : t('common.expense')}
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
                        {formatCurrency(parseFloat(formData.amount) || 0)} par {formData.recurrence_type === 'weekly' ? 'semaine' : formData.recurrence_type === 'monthly' ? 'mois' : 'an'}
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
            <Button type="submit" form="new-recurring-form" disabled={loading} className="h-9 text-xs sm:text-sm">
              {loading ? 'Création...' : 'Créer la récurrence'}
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  );
}

export default NewRecurringTransactionModal;