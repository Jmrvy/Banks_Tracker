import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Home, 
  Plus, 
  TrendingUp,
  Repeat,
  Settings
} from "lucide-react";

const navItems = [
  {
    path: "/",
    icon: Home,
    label: "Accueil",
    primary: true
  },
  {
    path: "/insights",
    icon: TrendingUp,
    label: "Insights"
  },
  {
    path: "/new-transaction",
    icon: Plus,
    label: "Ajouter"
  },
  {
    path: "/recurring-transactions",
    icon: Repeat,
    label: "Récurrentes"
  },
  {
    path: "/settings",
    icon: Settings,
    label: "Compte"
  }
];

export const MobileNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/98 backdrop-blur-lg border-t border-border/50 shadow-lg z-50">
      <div className="container mx-auto px-1 sm:px-2">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                onClick={() => navigate(item.path)}
                className={`flex flex-col h-16 w-16 gap-1.5 transition-all duration-200 ${
                  isActive 
                    ? "text-primary bg-primary/10" 
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                <Icon className={`h-5 w-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className={`text-[10px] leading-none font-medium ${isActive ? 'font-semibold' : ''}`}>
                  {item.label}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
