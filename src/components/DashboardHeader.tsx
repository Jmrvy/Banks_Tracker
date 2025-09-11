import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Download, Settings, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { NewTransactionModal } from "./NewTransactionModal";

export const DashboardHeader = () => {
  const { user, signOut } = useAuth();
  const [showNewTransaction, setShowNewTransaction] = useState(false);
  
  const currentMonth = new Date().toLocaleDateString('fr-FR', { 
    month: 'long', 
    year: 'numeric' 
  });

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="flex flex-col space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl bg-card border p-8">
        <div className="flex items-center justify-between">
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-2 text-foreground">Tableau de Bord Financier</h1>
            <p className="text-lg text-muted-foreground">
              Bienvenue, {user?.user_metadata?.full_name || user?.email || 'Utilisateur'} • {currentMonth}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSignOut}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setShowNewTransaction(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle Transaction
        </Button>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Exporter Données
        </Button>
        <Button variant="outline">
          <Settings className="w-4 h-4 mr-2" />
          Paramètres
        </Button>
      </div>

      <NewTransactionModal 
        open={showNewTransaction} 
        onOpenChange={setShowNewTransaction} 
      />
    </div>
  );
};