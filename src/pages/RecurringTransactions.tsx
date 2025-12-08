import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
        
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Repeat className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            Transactions Récurrentes
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 ml-10 sm:ml-13">
            Gérez vos transactions automatiques
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Active</p>
                  <p className="text-lg sm:text-2xl font-bold">
                    {recurringTransactions.filter(t => t.is_active).length}
                  </p>
                </div>
                <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                  <Play className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Inactive</p>
                  <p className="text-lg sm:text-2xl font-bold">
                    {recurringTransactions.filter(t => !t.is_active).length}
                  </p>
                </div>
                <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-full bg-muted/20 flex items-center justify-center flex-shrink-0">
                  <Pause className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">7 jours</p>
                  <p className="text-lg sm:text-2xl font-bold">
                    {recurringTransactions.filter(t => {
                      if (!t.is_active) return false;
                      const nextDue = new Date(t.next_due_date);
                      const inSevenDays = new Date();
                      inSevenDays.setDate(inSevenDays.getDate() + 7);
                      return nextDue <= inSevenDays;
                    }).length}
                  </p>
                </div>
                <div className="h-7 w-7 sm:h-10 sm:w-10 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h2 className="text-base sm:text-lg font-semibold">Toutes les Récurrentes</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
              {recurringTransactions.length} transaction{recurringTransactions.length > 1 ? 's' : ''}
            </p>
          </div>
          <Button 
            onClick={() => setShowNewRecurring(true)} 
            className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm"
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
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Créer une Récurrente
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {recurringTransactions.map((recurring) => (
              <Card key={recurring.id} className="bg-card/50 backdrop-blur border-border/50 hover:shadow-lg transition-all duration-200">
                <CardHeader className="p-3 sm:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm sm:text-lg font-semibold truncate">{recurring.description}</CardTitle>
                    <Badge 
                      variant={recurring.is_active ? 'default' : 'secondary'}
                      className="text-[10px] sm:text-xs flex-shrink-0"
                    >
                      {recurring.is_active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0 sm:pt-0">
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-xs">Montant:</span>
                      <span className={`font-bold text-base ${
                        recurring.type === 'income' ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(recurring.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-xs">Type:</span>
                      <span className="font-medium">{getTypeLabel(recurring.type)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-xs">Fréquence:</span>
                      <span className="font-medium">{getRecurrenceLabel(recurring.recurrence_type)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-xs">Prochain paiement:</span>
                      <span className={`font-medium ${
                        recurring.is_active && new Date(recurring.next_due_date) <= new Date() 
                          ? 'text-warning' 
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
                        <Badge variant="outline" className="gap-1.5">
                          <div 
                            className="w-2.5 h-2.5 rounded-full" 
                            style={{ backgroundColor: recurring.category.color }}
                          />
                          {recurring.category.name}
                        </Badge>
                      </div>
                    )}
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

                  <div className="flex gap-2 pt-2 border-t border-border">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingTransaction(recurring)}
                      title="Modifier"
                      className="hover:bg-muted flex-1"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleActive(recurring.id, recurring.is_active)}
                      title={recurring.is_active ? 'Désactiver' : 'Activer'}
                      className="hover:bg-muted flex-1"
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
                      className="hover:bg-destructive/10 hover:text-destructive flex-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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