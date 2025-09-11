import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Repeat, PlusCircle, MinusCircle, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';

interface NewRecurringTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewRecurringTransactionModal({ open, onOpenChange }: NewRecurringTransactionModalProps) {
  const { toast } = useToast();
  const { accounts, categories, createRecurringTransaction } = useFinancialData();
  
  const [formData, setFormData] = useState({
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
        title: "Erreur lors de la création",
        description: result.error.message,
        variant: "destructive",
      });
    } else {
      const typeLabel = formData.type === 'income' ? 'Revenus récurrents' : 'Dépense récurrente';
      toast({
        title: `${typeLabel} créé${formData.type === 'income' ? 's' : 'e'}`,
        description: `${typeLabel} de ${formData.amount}€ programmé${formData.type === 'income' ? 's' : 'e'} avec succès.`,
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

  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Chaque semaine';
      case 'monthly': return 'Chaque mois';
      case 'yearly': return 'Chaque année';
      default: return type;
    }
  };

  const getNextExecutionDate = () => {
    if (!formData.start_date) return null;
    
    const startDate = new Date(formData.start_date);
    const nextDate = new Date(startDate);
    
    switch (formData.recurrence_type) {
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" />
            Transaction Récurrente
          </DialogTitle>
          <DialogDescription>
            Créer une transaction qui se répétera automatiquement
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
              placeholder="Ex: Salaire mensuel, Loyer, Abonnement Netflix..."
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

          {/* Recurrence Type */}
          <div className="space-y-2">
            <Label htmlFor="recurrence">Fréquence *</Label>
            <Select 
              value={formData.recurrence_type} 
              onValueChange={(value: 'weekly' | 'monthly' | 'yearly') => 
                setFormData({ ...formData, recurrence_type: value })
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
            <Label htmlFor="start_date">Date de début *</Label>
            <Input
              id="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              required
            />
          </div>

          {/* End Date (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="end_date">Date de fin (optionnel)</Label>
            <Input
              id="end_date"
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              min={formData.start_date}
            />
            <div className="text-xs text-muted-foreground">
              Laissez vide pour une récurrence infinie
            </div>
          </div>

          {/* Preview */}
          {formData.start_date && (
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
                  <span className="font-medium">{getRecurrenceLabel(formData.recurrence_type)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Première exécution :</span>
                  <span className="font-medium">
                    {new Date(formData.start_date).toLocaleDateString('fr-FR')}
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
                {formData.end_date && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fin :</span>
                    <span className="font-medium">
                      {new Date(formData.end_date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                )}
                {selectedAccount && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Impact sur {selectedAccount.name} :</span>
                    <span className={`font-medium ${formData.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {formData.type === 'income' ? '+' : '-'}{formData.amount}€
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4">
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
      </DialogContent>
    </Dialog>
  );
}