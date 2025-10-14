import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, LogOut, CreditCard, Tag } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { NewAccountModal } from "@/components/NewAccountModal";
import { NewCategoryModal } from "@/components/NewCategoryModal";
import { ReportGeneratorModal } from "@/components/ReportGeneratorModal";
import { useState } from "react";

export const DashboardHeader = () => {
  const { user, signOut } = useAuth();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  
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
            <h1 className="text-3xl font-bold mb-2 text-foreground">Dashboard de vos Comptes Bancaires</h1>
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
        <Button variant="outline" onClick={() => setAccountModalOpen(true)}>
          <CreditCard className="w-4 h-4 mr-2" />
          Nouveau Compte
        </Button>
        <Button variant="outline" onClick={() => setCategoryModalOpen(true)}>
          <Tag className="w-4 h-4 mr-2" />
          Nouvelle Catégorie
        </Button>
        <Button variant="outline" onClick={() => setReportModalOpen(true)}>
          <FileText className="w-4 h-4 mr-2" />
          Générer un Rapport
        </Button>
      </div>
      
      <NewAccountModal 
        open={accountModalOpen} 
        onOpenChange={setAccountModalOpen} 
      />
      <NewCategoryModal 
        open={categoryModalOpen} 
        onOpenChange={setCategoryModalOpen} 
      />
      <ReportGeneratorModal 
        open={reportModalOpen} 
        onOpenChange={setReportModalOpen} 
      />
    </div>
  );
};