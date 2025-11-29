import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Home,
  Plus,
  Wallet,
  TrendingUp,
  PieChart
} from "lucide-react";

const navItems = [
  {
    path: "/",
    icon: Home,
    label: "Accueil"
  },
  {
    path: "/accounts",
    icon: Wallet,
    label: "Comptes"
  },
  {
    path: "/new-transaction",
    icon: Plus,
    label: "Ajouter"
  },
  {
    path: "/insights",
    icon: TrendingUp,
    label: "Insights"
  },
  {
    path: "/reports",
    icon: PieChart,
    label: "Rapports"
  }
];

export const MobileNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/98 backdrop-blur-lg border-t border-border/50 shadow-lg z-50 md:hidden">
      <div className="flex items-center justify-around px-2 py-1.5 safe-area-inset-bottom">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              onClick={() => navigate(item.path)}
              className={`flex flex-col h-14 flex-1 max-w-[80px] gap-1 transition-all duration-200 ${
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className={`h-5 w-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              <span className={`text-[9px] leading-tight font-medium ${isActive ? 'font-semibold' : ''}`}>
                {item.label}
              </span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
};
