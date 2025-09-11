import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Repeat, Calendar, Trash2, Pause, Play, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useNavigate } from "react-router-dom";

const RecurringTransactions = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/")}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Repeat className="h-6 w-6 text-primary" />
              Transactions Récurrentes
            </h1>
            <p className="text-muted-foreground text-sm">
              Gérez vos transactions automatiques programmées
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Active</p>
                  <p className="text-2xl font-bold">
                    {recurringTransactions.filter(t => t.is_active).length}
                  </p>
                </div>
                <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Play className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Inactive</p>
                  <p className="text-2xl font-bold">
                    {recurringTransactions.filter(t => !t.is_active).length}
                  </p>
                </div>
                <div className="h-8 w-8 rounded-full bg-gray-500/10 flex items-center justify-center">
                  <Pause className="h-4 w-4 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Prochaines 7j</p>
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
                <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Toutes les Transactions Récurrentes</CardTitle>
                <CardDescription>
                  {recurringTransactions.length} transaction{recurringTransactions.length > 1 ? 's' : ''} récurrente{recurringTransactions.length > 1 ? 's' : ''}
                </CardDescription>
              </div>
              <Button onClick={() => navigate("/?modal=transaction&tab=recurring")}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle Récurrence
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-20 bg-muted rounded-lg"></div>
                  </div>
                ))}
              </div>
            ) : recurringTransactions.length === 0 ? (
              <div className="text-center py-12">
                <Repeat className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Aucune transaction récurrente</h3>
                <p className="text-muted-foreground mb-4">
                  Créez votre première transaction récurrente pour automatiser vos revenus et dépenses régulières.
                </p>
                <Button onClick={() => navigate("/?modal=transaction&tab=recurring")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Créer une transaction récurrente
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recurringTransactions.map((recurring) => (
                  <Card key={recurring.id} className={`border-l-4 ${
                    recurring.is_active 
                      ? recurring.type === 'income' 
                        ? 'border-l-green-500' 
                        : 'border-l-red-500'
                      : 'border-l-gray-400 opacity-60'
                  }`}>
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
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
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
                            </div>
                            
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Compte :</span>
                                <span className="truncate">{recurring.account?.name}</span>
                              </div>
                              {recurring.category && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Catégorie :</span>
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
                            
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Prochaine :</span>
                                <span className={`font-medium ${
                                  recurring.is_active && new Date(recurring.next_due_date) <= new Date() 
                                    ? 'text-orange-600' 
                                    : ''
                                }`}>
                                  {new Date(recurring.next_due_date).toLocaleDateString('fr-FR')}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Début :</span>
                                <span>{new Date(recurring.start_date).toLocaleDateString('fr-FR')}</span>
                              </div>
                            </div>
                            
                            <div className="space-y-1">
                              {recurring.end_date && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Fin :</span>
                                  <span>{new Date(recurring.end_date).toLocaleDateString('fr-FR')}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Créée :</span>
                                <span>{new Date(recurring.created_at).toLocaleDateString('fr-FR')}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-1 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleActive(recurring.id, recurring.is_active)}
                            title={recurring.is_active ? 'Désactiver' : 'Activer'}
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
                            title="Supprimer"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RecurringTransactions;