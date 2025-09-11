import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Download, Settings } from "lucide-react";

export const DashboardHeader = () => {
  const currentMonth = new Date().toLocaleDateString('fr-FR', { 
    month: 'long', 
    year: 'numeric' 
  });

  return (
    <div className="flex flex-col space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-accent p-8 text-white">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold mb-2">Tableau de Bord Financier</h1>
          <p className="text-lg opacity-90">
            Suivi mensuel • {currentMonth}
          </p>
        </div>
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button className="bg-card text-card-foreground border hover:bg-secondary">
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