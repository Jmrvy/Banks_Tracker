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

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="space-y-4">
      {/* Hero Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Bonjour, {user?.user_metadata?.full_name?.split(' ')[0] || 'Utilisateur'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString('fr-FR', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button 
            variant="outline" 
            size="icon"
            onClick={handleSignOut}
            className="h-9 w-9"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Button 
          variant="outline" 
          onClick={() => setAccountModalOpen(true)}
          className="flex flex-col h-auto py-3 px-2 items-center gap-1.5"
        >
          <CreditCard className="h-5 w-5 text-primary" />
          <span className="text-xs font-medium">Compte</span>
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setCategoryModalOpen(true)}
          className="flex flex-col h-auto py-3 px-2 items-center gap-1.5"
        >
          <Tag className="h-5 w-5 text-primary" />
          <span className="text-xs font-medium">Catégorie</span>
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setReportModalOpen(true)}
          className="flex flex-col h-auto py-3 px-2 items-center gap-1.5"
        >
          <FileText className="h-5 w-5 text-primary" />
          <span className="text-xs font-medium">Rapport</span>
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
