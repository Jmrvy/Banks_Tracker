import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Repeat, Calendar, Trash2, Pause, Play, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useUserPreferences } from '@/hooks/useUserPreferences';

interface RecurringTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecurringTransactionsModal({ open, onOpenChange }: RecurringTransactionsModalProps) {
  const { toast } = useToast();
  const { formatCurrency } = useUserPreferences();
  const { 
    recurringTransactions, 
    loading,
    fetchRecurringTransactions,
    updateRecurringTransaction,
    deleteRecurringTransaction 
  } = useFinancialData();

  useEffect(() => {
    if (open) {
      fetchRecurringTransactions();
    }
  }, [open, fetchRecurringTransactions]);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const result = await updateRecurringTransaction(id, { is_active: !currentStatus });
    
    if (result?.error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier le statut de la transaction récurrente.",
        variant: "destructive"
      });
    } else {
      toast({
        title: currentStatus ? "Transaction désactivée" : "Transaction activée",
        description: `La transaction récurrente a été ${currentStatus ? 'désactivée' : 'activée'}.`,
      });
      fetchRecurringTransactions();
    }
  };

  const handleDelete = async (id: string, description: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement la transaction récurrente "${description}" ?`)) {
      return;
    }

    const result = await deleteRecurringTransaction(id);
    
    if (result?.error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la transaction récurrente.",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Transaction supprimée",
        description: "La transaction récurrente a été supprimée définitivement.",
      });
      fetchRecurringTransactions();
    }
  };

  const getRecurrenceLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Hebdomadaire';
      case 'monthly': return 'Mensuelle';
      case 'yearly': return 'Annuelle';
      default: return type;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income': return 'Revenus';
      case 'expense': return 'Dépense';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'income': return 'text-green-600';
      case 'expense': return 'text-red-600';
      default: return 'text-foreground';
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-primary" />
              Transactions Récurrentes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-20 bg-muted rounded-lg"></div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" />
            Transactions Récurrentes
          </DialogTitle>
          <DialogDescription>
            Gérez vos transactions automatiques programmées
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {recurringTransactions.length === 0 ? (
            <div className="text-center py-8">
              <Repeat className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Aucune transaction récurrente</h3>
              <p className="text-muted-foreground">
                Créez votre première transaction récurrente pour automatiser vos revenus et dépenses régulières.
              </p>
            </div>
          ) : (
            recurringTransactions.map((recurring) => (
              <Card key={recurring.id} className={`border ${!recurring.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium truncate">{recurring.description}</h4>
                        <Badge variant={recurring.is_active ? 'secondary' : 'outline'}>
                          {recurring.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline">
                          {getRecurrenceLabel(recurring.recurrence_type)}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Montant :</span>
                            <span className={`font-medium ${getTypeColor(recurring.type)}`}>
                              {recurring.type === 'income' ? '+' : '-'}{formatCurrency(recurring.amount)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Type :</span>
                            <span>{getTypeLabel(recurring.type)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Compte :</span>
                            <span className="truncate">{recurring.account?.name}</span>
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Prochaine :</span>
                            <span className="font-medium">
                              {new Date(recurring.next_due_date).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Début :</span>
                            <span>{new Date(recurring.start_date).toLocaleDateString('fr-FR')}</span>
                          </div>
                          {recurring.end_date && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Fin :</span>
                              <span>{new Date(recurring.end_date).toLocaleDateString('fr-FR')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {recurring.category && (
                        <div className="flex items-center gap-2 mt-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: recurring.category.color }}
                          />
                          <span className="text-sm text-muted-foreground">
                            {recurring.category.name}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-1 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleActive(recurring.id, recurring.is_active)}
                      >
                        {recurring.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(recurring.id, recurring.description)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}