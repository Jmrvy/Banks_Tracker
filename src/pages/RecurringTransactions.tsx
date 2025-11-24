import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Repeat, Calendar, Trash2, Pause, Play, Plus, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFinancialData, RecurringTransaction } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useNavigate } from "react-router-dom";
import NewRecurringTransactionModal from "@/components/NewRecurringTransactionModal";
import EditRecurringTransactionModal from "@/components/EditRecurringTransactionModal";

const RecurringTransactions = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showNewRecurring, setShowNewRecurring] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<RecurringTransaction | null>(null);
  const { formatCurrency } = useUserPreferences();
  const { 
    recurringTransactions, 
    loading,
    fetchRecurringTransactions,
    updateRecurringTransaction,
    deleteRecurringTransaction 
  } = useFinancialData();

  useEffect(() => {
    fetchRecurringTransactions();
  }, [fetchRecurringTransactions]);

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
      case 'quarterly': return 'Trimestrielle';
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

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Repeat className="h-6 w-6 text-primary" />
            Récurrentes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Transactions automatiques
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card>
            <CardContent className="p-2 sm:p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                <div className="flex-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Active</p>
                  <p className="text-base sm:text-xl lg:text-2xl font-bold">
                    {recurringTransactions.filter(t => t.is_active).length}
                  </p>
                </div>
                <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Play className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-2 sm:p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                <div className="flex-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Inactive</p>
                  <p className="text-base sm:text-xl lg:text-2xl font-bold">
                    {recurringTransactions.filter(t => !t.is_active).length}
                  </p>
                </div>
                <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-gray-500/10 flex items-center justify-center">
                  <Pause className="h-3 w-3 sm:h-4 sm:w-4 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-2 sm:p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                <div className="flex-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">7j</p>
                  <p className="text-base sm:text-xl lg:text-2xl font-bold">
                    {recurringTransactions.filter(t => {
                      if (!t.is_active) return false;
                      const nextDue = new Date(t.next_due_date);
                      const inSevenDays = new Date();
                      inSevenDays.setDate(inSevenDays.getDate() + 7);
                      return nextDue <= inSevenDays;
                    }).length}
                  </p>
                </div>
                <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm sm:text-lg lg:text-xl">Toutes les Récurrentes</CardTitle>
                <CardDescription className="text-[10px] sm:text-sm hidden sm:block">
                  {recurringTransactions.length} transaction{recurringTransactions.length > 1 ? 's' : ''} récurrente{recurringTransactions.length > 1 ? 's' : ''}
                </CardDescription>
              </div>
              <Button onClick={() => setShowNewRecurring(true)} size="sm" className="text-xs sm:text-sm">
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">Nouvelle</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            {loading ? (
              <div className="space-y-2 sm:space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-16 sm:h-20 bg-muted rounded-lg"></div>
                  </div>
                ))}
              </div>
            ) : recurringTransactions.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <Repeat className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                <h3 className="text-sm sm:text-lg font-medium mb-2">Aucune récurrente</h3>
                <p className="text-muted-foreground text-xs sm:text-sm mb-3 sm:mb-4 px-4">
                  Créez votre première transaction récurrente.
                </p>
                <Button onClick={() => navigate("/?modal=transaction&tab=recurring")} size="sm">
                  <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  <span className="text-xs sm:text-sm">Créer</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-4">
                {recurringTransactions.map((recurring) => (
                  <Card key={recurring.id} className={`border-l-2 sm:border-l-4 ${
                    recurring.is_active 
                      ? recurring.type === 'income' 
                        ? 'border-l-green-500' 
                        : 'border-l-red-500'
                      : 'border-l-gray-400 opacity-60'
                  }`}>
                    <CardContent className="p-2 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2 flex-wrap">
                            <h4 className="font-medium truncate text-xs sm:text-sm">{recurring.description}</h4>
                            <Badge variant={recurring.is_active ? 'secondary' : 'outline'} className="text-[10px] sm:text-xs px-1 sm:px-2 py-0">
                              {recurring.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-2 py-0 hidden sm:inline-flex">
                              {getRecurrenceLabel(recurring.recurrence_type)}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 text-[10px] sm:text-sm">
                            <div className="space-y-0.5 sm:space-y-1">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Montant:</span>
                                <span className={`font-medium ${getTypeColor(recurring.type)}`}>
                                  {recurring.type === 'income' ? '+' : '-'}{formatCurrency(recurring.amount)}
                                </span>
                              </div>
                              <div className="flex justify-between sm:hidden">
                                <span className="text-muted-foreground">Prochaine:</span>
                                <span className={`font-medium ${
                                  recurring.is_active && new Date(recurring.next_due_date) <= new Date() 
                                    ? 'text-orange-600' 
                                    : ''
                                }`}>
                                  {new Date(recurring.next_due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            
                            <div className="space-y-0.5 sm:space-y-1 hidden sm:block">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Compte:</span>
                                <span className="truncate">{recurring.account?.name}</span>
                              </div>
                              {recurring.category && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Catégorie:</span>
                                  <div className="flex items-center gap-1">
                                    <div 
                                      className="w-2 h-2 rounded-full" 
                                      style={{ backgroundColor: recurring.category.color }}
                                    />
                                    <span className="truncate text-xs">{recurring.category.name}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <div className="space-y-0.5 sm:space-y-1 hidden sm:block">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Prochaine:</span>
                                <span className={`font-medium ${
                                  recurring.is_active && new Date(recurring.next_due_date) <= new Date() 
                                    ? 'text-orange-600' 
                                    : ''
                                }`}>
                                  {new Date(recurring.next_due_date).toLocaleDateString('fr-FR')}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Début:</span>
                                <span>{new Date(recurring.start_date).toLocaleDateString('fr-FR')}</span>
                              </div>
                            </div>
                            
                            <div className="space-y-0.5 sm:space-y-1 hidden lg:block">
                              {recurring.end_date && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Fin:</span>
                                  <span>{new Date(recurring.end_date).toLocaleDateString('fr-FR')}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Créée:</span>
                                <span>{new Date(recurring.created_at).toLocaleDateString('fr-FR')}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-0.5 sm:gap-1 ml-2 sm:ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingTransaction(recurring)}
                            title="Modifier"
                            className="h-6 w-6 sm:h-8 sm:w-8 p-0"
                          >
                            <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleActive(recurring.id, recurring.is_active)}
                            title={recurring.is_active ? 'Désactiver' : 'Activer'}
                            className="h-6 w-6 sm:h-8 sm:w-8 p-0"
                          >
                            {recurring.is_active ? (
                              <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
                            ) : (
                              <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(recurring.id, recurring.description)}
                            title="Supprimer"
                            className="h-6 w-6 sm:h-8 sm:w-8 p-0"
                          >
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <NewRecurringTransactionModal 
        open={showNewRecurring} 
        onOpenChange={setShowNewRecurring} 
      />

      <EditRecurringTransactionModal 
        open={!!editingTransaction} 
        onOpenChange={(open) => !open && setEditingTransaction(null)} 
        transaction={editingTransaction}
      />
    </div>
  );
};

export default RecurringTransactions;