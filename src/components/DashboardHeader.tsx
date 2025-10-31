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
    <div className="flex flex-col space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-lg sm:rounded-xl bg-card border p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
          <div className="relative z-10 min-w-0">
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2 text-foreground truncate">
              Dashboard de vos Comptes Bancaires
            </h1>
            <p className="text-xs sm:text-sm lg:text-base text-muted-foreground truncate">
              Bienvenue, {user?.user_metadata?.full_name || user?.email || 'Utilisateur'} • {currentMonth}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <ThemeToggle />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSignOut}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
            >
              <LogOut className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
              <span className="sm:hidden">Déco</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <Button variant="outline" size="sm" onClick={() => setAccountModalOpen(true)} className="text-xs sm:text-sm">
          <CreditCard className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Nouveau Compte</span>
          <span className="sm:hidden">Compte</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCategoryModalOpen(true)} className="text-xs sm:text-sm">
          <Tag className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Nouvelle Catégorie</span>
          <span className="sm:hidden">Catégorie</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setReportModalOpen(true)} className="text-xs sm:text-sm">
          <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Générer un Rapport</span>
          <span className="sm:hidden">Rapport</span>
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