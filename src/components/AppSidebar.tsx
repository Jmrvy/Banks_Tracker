import { Link, useLocation } from "react-router-dom";
import {
  Home,
  PieChart,
  TrendingUp,
  Wallet,
  CreditCard,
  Receipt,
  Settings,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Home", path: "/", icon: Home },
  { name: "Comptes", path: "/accounts", icon: Wallet },
  { name: "Transactions", path: "/transactions", icon: History },
  { name: "Rapports", path: "/reports", icon: PieChart },
  { name: "Insights", path: "/insights", icon: TrendingUp },
  { name: "Récurrents", path: "/recurring-transactions", icon: Receipt },
  { name: "Dettes", path: "/debts", icon: CreditCard },
  { name: "Paramètres", path: "/settings", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <span className="text-2xl font-bold text-primary">⚡ JMRVY CB</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navigation.map((item) => {
            const active = isActive(item.path);

            return (
              <li key={item.name}>
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
            JM
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">Joris</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">Gérer le profil</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
