import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Download, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export const DashboardHeader = () => {
  const currentMonth = new Date().toLocaleDateString('fr-FR', { 
    month: 'long', 
    year: 'numeric' 
  });

  return (
    <div className="flex flex-col space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl bg-card border p-8">
        <div className="flex items-center justify-between">
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-2 text-foreground">Tableau de Bord Financier</h1>
            <p className="text-lg text-muted-foreground">
              Suivi mensuel • {currentMonth}
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button>
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
    </div>
  );
};