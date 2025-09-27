import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Home, 
  Plus, 
  BarChart3, 
  Repeat, 
  Settings
} from "lucide-react";

const navItems = [
  {
    path: "/",
    icon: Home,
    label: "Dashboard",
    primary: true
  },
  {
    path: "/new-transaction",
    icon: Plus,
    label: "Transaction"
  },
  {
    path: "/recurring-transactions",
    icon: Repeat,
    label: "Récurrentes"
  },
  {
    path: "/reports",
    icon: BarChart3,
    label: "Rapports"
  },
  {
    path: "/settings",
    icon: Settings,
    label: "Paramètres"
  }
];

export const MobileNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border z-50">
      <div className="container mx-auto px-2">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Button
                key={item.path}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                onClick={() => navigate(item.path)}
                className={`flex flex-col h-14 w-16 gap-1 text-xs ${
                  item.primary && location.pathname === "/" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""
                } ${isActive && !item.primary ? "bg-accent text-accent-foreground" : ""}`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] leading-none">{item.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
