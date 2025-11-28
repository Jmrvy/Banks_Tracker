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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 pb-24">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Repeat className="h-5 w-5 text-primary" />
            </div>
            Transactions Récurrentes
          </h1>
          <p className="text-sm text-muted-foreground mt-2 ml-13">
            Gérez vos transactions automatiques récurrentes
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">Active</p>
                  <p className="text-2xl font-bold">
                    {recurringTransactions.filter(t => t.is_active).length}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Play className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">Inactive</p>
                  <p className="text-2xl font-bold">
                    {recurringTransactions.filter(t => !t.is_active).length}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-gray-500/10 flex items-center justify-center">
                  <Pause className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">Prochains 7j</p>
                  <p className="text-2xl font-bold">
                    {recurringTransactions.filter(t => {
                      if (!t.is_active) return false;
                      const nextDue = new Date(t.next_due_date);
                      const inSevenDays = new Date();
                      inSevenDays.setDate(inSevenDays.getDate() + 7);
                      return nextDue <= inSevenDays;
                    }).length}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Toutes les Récurrentes</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {recurringTransactions.length} transaction{recurringTransactions.length > 1 ? 's' : ''} récurrente{recurringTransactions.length > 1 ? 's' : ''}
            </p>
          </div>
          <Button 
            onClick={() => setShowNewRecurring(true)} 
            size="lg"
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle Récurrente
          </Button>
        </div>

        {/* Main Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-32 bg-muted rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : recurringTransactions.length === 0 ? (
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-12">
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Repeat className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">Aucune récurrente</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Créez votre première transaction récurrente.
                </p>
                <Button 
                  onClick={() => setShowNewRecurring(true)} 
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Créer une Récurrente
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {recurringTransactions.map((recurring) => (
              <Card key={recurring.id} className={`bg-card/50 backdrop-blur border-l-4 ${
                recurring.is_active 
                  ? recurring.type === 'income' 
                    ? 'border-l-green-500' 
                    : 'border-l-red-500'
                  : 'border-l-gray-400 opacity-60'
              } hover:shadow-lg transition-all duration-200`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <h4 className="font-semibold text-lg">{recurring.description}</h4>
                        <Badge 
                          variant={recurring.is_active ? 'default' : 'outline'}
                          className={recurring.is_active ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white' : ''}
                        >
                          {recurring.is_active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs">Total:</span>
                            <span className={`font-bold text-base ${getTypeColor(recurring.type)}`}>
                              {formatCurrency(recurring.amount)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs">Mensualité:</span>
                            <span className="font-semibold">{formatCurrency(recurring.amount)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs">Fréquence:</span>
                            <span className="font-medium">{getRecurrenceLabel(recurring.recurrence_type)}</span>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs">Prochain paiement:</span>
                            <span className={`font-medium ${
                              recurring.is_active && new Date(recurring.next_due_date) <= new Date() 
                                ? 'text-orange-500' 
                                : ''
                            }`}>
                              {new Date(recurring.next_due_date).toLocaleDateString('fr-FR', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric' 
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs">Compte:</span>
                            <span className="font-medium truncate">{recurring.account?.name}</span>
                          </div>
                          {recurring.category && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground text-xs">Catégorie:</span>
                              <div className="flex items-center gap-1.5">
                                <div 
                                  className="w-2.5 h-2.5 rounded-full" 
                                  style={{ backgroundColor: recurring.category.color }}
                                />
                                <span className="font-medium text-xs">{recurring.category.name}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs">Début:</span>
                            <span className="font-medium">
                              {new Date(recurring.start_date).toLocaleDateString('fr-FR', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric' 
                              })}
                            </span>
                          </div>
                          {recurring.end_date && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground text-xs">Fin:</span>
                              <span className="font-medium">
                                {new Date(recurring.end_date).toLocaleDateString('fr-FR', { 
                                  day: '2-digit', 
                                  month: 'short', 
                                  year: 'numeric' 
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTransaction(recurring)}
                        title="Modifier"
                        className="hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleActive(recurring.id, recurring.is_active)}
                        title={recurring.is_active ? 'Désactiver' : 'Activer'}
                        className="hover:bg-muted"
                      >
                        {recurring.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(recurring.id, recurring.description)}
                        title="Supprimer"
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
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