import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Palette, Database, Trash2, Edit3, Save, X, Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { cn } from "@/lib/utils";

const Settings = () => {
  const { user, signOut } = useAuth();
  const { accounts, categories, transactions, loading: financialLoading, refetch } = useFinancialData();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState({
    fullName: user?.user_metadata?.full_name || "",
    email: user?.email || ""
  });
  
  const { preferences, updatePreferences, formatCurrency } = useUserPreferences();

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<any>({});

  const [updateLoading, setUpdateLoading] = useState(false);
  
  // Notification preferences state
  const [notificationPrefs, setNotificationPrefs] = useState({
    email: user?.email || "",
    budgetAlerts: true,
    monthlyReports: true
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [testBudgetLoading, setTestBudgetLoading] = useState(false);

  // Load notification preferences on mount
  useEffect(() => {
    const loadNotificationPrefs = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setNotificationPrefs({
          email: data.email,
          budgetAlerts: data.budget_alerts,
          monthlyReports: data.monthly_reports
        });
      }
    };

    loadNotificationPrefs();
  }, [user]);

  const savePreferences = () => {
    toast({
      title: "Préférences sauvegardées",
      description: "Vos préférences ont été mises à jour avec succès.",
    });
  };

  const testBudgetCheck = async () => {
    setTestBudgetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-budgets');
      
      if (error) throw error;

      toast({
        title: "Vérification effectuée",
        description: "La vérification des budgets a été lancée. Consultez les logs pour voir les résultats.",
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de lancer la vérification des budgets.",
        variant: "destructive",
      });
    } finally {
      setTestBudgetLoading(false);
    }
  };

  const saveNotificationPreferences = async () => {
    if (!user) return;
    
    setNotifLoading(true);
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          email: notificationPrefs.email,
          budget_alerts: notificationPrefs.budgetAlerts,
          monthly_reports: notificationPrefs.monthlyReports
        });

      if (error) throw error;

      toast({
        title: "Notifications configurées",
        description: "Vos préférences de notification ont été sauvegardées.",
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder les préférences de notification.",
        variant: "destructive"
      });
    } finally {
      setNotifLoading(false);
    }
  };

  const updateProfile = async () => {
    setUpdateLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: profile.fullName }
      });

      if (error) throw error;

      toast({
        title: "Profil mis à jour",
        description: "Votre profil a été mis à jour avec succès.",
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le profil.",
        variant: "destructive"
      });
    } finally {
      setUpdateLoading(false);
    }
  };


  const startEditingCategory = (category: any) => {
    setEditingCategory(category.id);
    setEditingValues({
      name: category.name,
      color: category.color,
      budget: category.budget || ""
    });
  };

  const startEditingAccount = (account: any) => {
    setEditingAccount(account.id);
    setEditingValues({
      name: account.name,
      bank: account.bank
    });
  };

  const saveCategory = async (categoryId: string) => {
    try {
      const { error } = await supabase
        .from('categories')
        .update({
          name: editingValues.name,
          color: editingValues.color,
          budget: editingValues.budget ? Number(editingValues.budget) : null
        })
        .eq('id', categoryId);

      if (error) throw error;

      setEditingCategory(null);
      setEditingValues({});
      refetch();
      
      toast({
        title: "Catégorie mise à jour",
        description: "La catégorie a été modifiée avec succès.",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier la catégorie.",
        variant: "destructive"
      });
    }
  };

  const saveAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('accounts')
        .update({
          name: editingValues.name,
          bank: editingValues.bank
        })
        .eq('id', accountId);

      if (error) throw error;

      setEditingAccount(null);
      setEditingValues({});
      refetch();
      
      toast({
        title: "Compte mis à jour",
        description: "Le compte a été modifié avec succès.",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier le compte.",
        variant: "destructive"
      });
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette catégorie ? Cette action est irréversible.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      refetch();
      
      toast({
        title: "Catégorie supprimée",
        description: "La catégorie a été supprimée avec succès.",
      });
    } catch (error) {
      toast({
        title: "Erreur", 
        description: "Impossible de supprimer la catégorie.",
        variant: "destructive"
      });
    }
  };

  const deleteAccount = async (accountId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce compte ? Cette action supprimera aussi toutes les transactions associées.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', accountId);

      if (error) throw error;

      refetch();
      
      toast({
        title: "Compte supprimé",
        description: "Le compte a été supprimé avec succès.",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le compte.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
        
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Paramètres</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Gérer votre compte
          </p>
        </div>

        <div className="grid gap-3 sm:gap-4">
          
          {/* Profil Utilisateur */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 sm:h-5 sm:w-5" />
                <CardTitle className="text-sm sm:text-base">Profil</CardTitle>
              </div>
              <CardDescription className="text-xs sm:text-sm hidden sm:block">
                Modifiez vos informations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6">
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="fullName" className="text-xs sm:text-sm">Nom complet</Label>
                  <Input
                    id="fullName"
                    value={profile.fullName}
                    onChange={(e) => setProfile(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Votre nom"
                    className="h-8 sm:h-10 text-xs sm:text-sm"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="email" className="text-xs sm:text-sm">Email</Label>
                  <Input
                    id="email"
                    value={profile.email}
                    disabled
                    className="bg-muted h-8 sm:h-10 text-xs sm:text-sm"
                  />
                </div>
              </div>
              <Button onClick={updateProfile} disabled={updateLoading} className="w-full sm:w-auto h-8 sm:h-10 text-xs sm:text-sm">
                {updateLoading ? "Mise à jour..." : "Mettre à jour"}
              </Button>
            </CardContent>
          </Card>

          {/* Préférences */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 sm:h-5 sm:w-5" />
                <CardTitle className="text-sm sm:text-base">Préférences</CardTitle>
              </div>
              <CardDescription className="text-xs sm:text-sm hidden sm:block">
                Personnalisez l'affichage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6">
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Thème</Label>
                  <p className="text-sm text-muted-foreground">Choisissez entre le thème clair et sombre</p>
                </div>
                <ThemeToggle />
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Devise</Label>
                    <Select 
                      value={preferences.currency} 
                      onValueChange={(value) => updatePreferences({ currency: value })}
                    >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">Euro (€)</SelectItem>
                      <SelectItem value="USD">Dollar ($)</SelectItem>
                      <SelectItem value="GBP">Livre (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Format de date</Label>
                  <Select 
                    value={preferences.dateFormat} 
                    onValueChange={(value) => updatePreferences({ dateFormat: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Notifications</Label>
                  <p className="text-sm text-muted-foreground">Recevoir des alertes sur les budgets et rapports mensuels</p>
                </div>
                <Switch
                  checked={preferences.enableNotifications}
                  onCheckedChange={(checked) => updatePreferences({ enableNotifications: checked })}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Type de date pour les calculs</Label>
                <Select 
                  value={preferences.dateType} 
                  onValueChange={(value: 'accounting' | 'value') => updatePreferences({ dateType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accounting">Date Comptable</SelectItem>
                    <SelectItem value="value">Date Valeur</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choisissez quelle date utiliser pour les calculs de soldes et rapports
                </p>
              </div>

              <Button onClick={savePreferences} className="w-full sm:w-auto">
                Sauvegarder les préférences
              </Button>
            </CardContent>
          </Card>

          {/* Notifications par Email */}
          {preferences.enableNotifications && (
            <Card>
              <CardHeader className="p-3 sm:p-6">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                  <CardTitle className="text-sm sm:text-base">Notifications par Email</CardTitle>
                </div>
                <CardDescription className="text-xs sm:text-sm hidden sm:block">
                  Configurez vos alertes et rapports
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6">
                <div className="space-y-2">
                  <Label htmlFor="notif-email" className="text-xs sm:text-sm">Email pour les notifications</Label>
                  <Input
                    id="notif-email"
                    type="email"
                    value={notificationPrefs.email}
                    onChange={(e) => setNotificationPrefs(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="votre@email.com"
                    className="h-8 sm:h-10 text-xs sm:text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cet email sera utilisé pour toutes les notifications
                  </p>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs sm:text-sm">Alertes de budget</Label>
                      <p className="text-xs text-muted-foreground">Recevoir un email quand un budget est dépassé</p>
                    </div>
                    <Switch
                      checked={notificationPrefs.budgetAlerts}
                      onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, budgetAlerts: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs sm:text-sm">Rapports mensuels</Label>
                      <p className="text-xs text-muted-foreground">Recevoir un résumé financier chaque début de mois</p>
                    </div>
                    <Switch
                      checked={notificationPrefs.monthlyReports}
                      onCheckedChange={(checked) => setNotificationPrefs(prev => ({ ...prev, monthlyReports: checked }))}
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button 
                    onClick={saveNotificationPreferences} 
                    disabled={notifLoading}
                    className="w-full sm:w-auto"
                  >
                    {notifLoading ? "Sauvegarde..." : "Sauvegarder les notifications"}
                  </Button>
                  <Button 
                    onClick={testBudgetCheck} 
                    disabled={testBudgetLoading}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    {testBudgetLoading ? "Vérification..." : "Tester la vérification des budgets"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Le bouton de test déclenche manuellement la vérification des budgets. En production, cela sera automatique via un cron job quotidien.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Gestion des Comptes */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 sm:h-5 sm:w-5" />
                <CardTitle className="text-sm sm:text-base">Mes Comptes</CardTitle>
              </div>
              <CardDescription className="text-xs sm:text-sm hidden sm:block">
                Gérez vos comptes
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              <div className="space-y-2 sm:space-y-3">
                {accounts.map((account) => (
                  <div key={account.id} className="p-3 border rounded-lg bg-muted/30 dark:bg-muted/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {editingAccount === account.id ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              value={editingValues.name || ""}
                              onChange={(e) => setEditingValues(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Nom du compte"
                              className="h-8 sm:h-10 text-xs sm:text-sm"
                            />
                            <Select
                              value={editingValues.bank || ""}
                              onValueChange={(value) => setEditingValues(prev => ({ ...prev, bank: value }))}
                            >
                              <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm">
                                <SelectValue placeholder="Banque" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="boursorama">Boursorama</SelectItem>
                                <SelectItem value="revolut">Revolut</SelectItem>
                                <SelectItem value="societe_generale">Société Générale</SelectItem>
                                <SelectItem value="bnp_paribas">BNP Paribas</SelectItem>
                                <SelectItem value="credit_agricole">Crédit Agricole</SelectItem>
                                <SelectItem value="other">Autre</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm font-medium text-foreground">{account.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-xs text-muted-foreground capitalize">
                                {account.bank}
                              </p>
                              <span className="text-xs text-muted-foreground">•</span>
                              <p className="text-xs font-semibold text-foreground">
                                {formatCurrency(Number(account.balance))}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {editingAccount === account.id ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => saveAccount(account.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                              <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingAccount(null)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                              <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startEditingAccount(account)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                              <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteAccount(account.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Gestion des Catégories */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 sm:h-5 sm:w-5" />
                <CardTitle className="text-sm sm:text-base">Mes Catégories</CardTitle>
              </div>
              <CardDescription className="text-xs sm:text-sm hidden sm:block">
                Gérez vos catégories de dépenses
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              <div className="space-y-2 sm:space-y-3">
                {categories.map((category) => (
                  <div key={category.id} className="p-3 border rounded-lg bg-muted/30 dark:bg-muted/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {editingCategory === category.id ? (
                          <div className="grid gap-2 sm:grid-cols-3">
                            <Input
                              value={editingValues.name || ""}
                              onChange={(e) => setEditingValues(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Nom de la catégorie"
                              className="h-8 sm:h-10 text-xs sm:text-sm"
                            />
                            <div className="flex gap-2">
                              <Input
                                type="color"
                                value={editingValues.color || "#3B82F6"}
                                onChange={(e) => setEditingValues(prev => ({ ...prev, color: e.target.value }))}
                                className="w-12 sm:w-16 h-8 sm:h-10 p-1"
                              />
                              <Input
                                type="number"
                                value={editingValues.budget || ""}
                                onChange={(e) => setEditingValues(prev => ({ ...prev, budget: e.target.value }))}
                                placeholder="Budget €"
                                className="h-8 sm:h-10 text-xs sm:text-sm"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <div 
                              className="w-3 h-3 sm:w-4 sm:h-4 rounded-full mt-0.5 flex-shrink-0"
                              style={{ backgroundColor: category.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{category.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {category.budget ? 
                                  `Budget: ${formatCurrency(Number(category.budget))}` : 
                                  'Pas de budget'
                                }
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {editingCategory === category.id ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => saveCategory(category.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                              <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingCategory(null)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                              <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startEditingCategory(category)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                              <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteCategory(category.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>


          {/* Déconnexion */}
          <div className="pt-2">
            <Button 
              variant="destructive" 
              onClick={signOut}
              className="w-full h-10 text-sm"
            >
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;