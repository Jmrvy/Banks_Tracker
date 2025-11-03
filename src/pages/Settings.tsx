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
import { ArrowLeft, User, Palette, Database, Download, Trash2, Edit3, Save, X } from "lucide-react";
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

  const savePreferences = () => {
    toast({
      title: "Préférences sauvegardées",
      description: "Vos préférences ont été mises à jour avec succès.",
    });
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

  const exportData = () => {
    const data = {
      accounts,
      categories,
      transactions,
      exportDate: new Date().toISOString(),
      user: user?.email
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Données exportées",
      description: "Vos données financières ont été téléchargées.",
    });
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-accent/5 pb-24">
      <div className="container mx-auto px-3 sm:px-4 py-4 space-y-4">
        
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/")}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Paramètres</h1>
            <p className="text-sm text-muted-foreground">
              Gérer votre compte
            </p>
          </div>
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

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Notifications</Label>
                    <p className="text-sm text-muted-foreground">Recevoir des alertes sur les budgets</p>
                  </div>
                  <Switch
                    checked={preferences.enableNotifications}
                    onCheckedChange={(checked) => updatePreferences({ enableNotifications: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Export automatique</Label>
                    <p className="text-sm text-muted-foreground">Sauvegarder automatiquement vos données</p>
                  </div>
                  <Switch
                    checked={preferences.autoExport}
                    onCheckedChange={(checked) => updatePreferences({ autoExport: checked })}
                  />
                </div>
              </div>

              <Button onClick={savePreferences} className="w-full sm:w-auto">
                Sauvegarder les préférences
              </Button>
            </CardContent>
          </Card>

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

          {/* Export des données */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 sm:h-5 sm:w-5" />
                <CardTitle className="text-sm sm:text-base">Export des Données</CardTitle>
              </div>
              <CardDescription className="text-xs sm:text-sm hidden sm:block">
                Sauvegardez toutes vos données financières
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-muted/30 dark:bg-muted/20 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Exporter toutes les données</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Télécharge un fichier JSON contenant tous vos comptes, transactions et catégories
                  </p>
                </div>
                <Button onClick={exportData} variant="outline" size="sm" className="w-full sm:w-auto flex-shrink-0">
                  <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2" />
                  Exporter
                </Button>
              </div>
              
              <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                <p>• Format : JSON</p>
                <p>• Contenu : Comptes, catégories, transactions</p>
                <p>• Compatible avec les imports futurs</p>
              </div>
            </CardContent>
          </Card>

          {/* Zone de danger */}
          <Card className="border-destructive/50">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-destructive text-sm sm:text-base">Zone de danger</CardTitle>
              <CardDescription className="text-xs sm:text-sm hidden sm:block">
                Actions irréversibles sur votre compte
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              <Button 
                variant="destructive" 
                onClick={signOut}
                size="sm"
                className="w-full sm:w-auto h-8 sm:h-10 text-xs sm:text-sm"
              >
                Se déconnecter
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;