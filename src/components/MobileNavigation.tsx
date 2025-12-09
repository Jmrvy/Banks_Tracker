import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Home,
  Plus,
  Wallet,
  Menu,
  TrendingUp,
  History,
  CreditCard,
  Scale,
  PieChart,
  Receipt,
  Settings,
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
  }
];

const mainNavigation = [
  { name: "Accueil", path: "/", icon: Home },
  { name: "Insights", path: "/insights", icon: TrendingUp },
  { name: "Rapports", path: "/reports", icon: PieChart },
];

const accountsGroup = [
  { name: "Comptes", path: "/accounts", icon: Wallet },
  { name: "Transactions", path: "/transactions", icon: History },
];

const toolsGroup = [
  { name: "Transactions Récurrentes", path: "/recurring-transactions", icon: Receipt },
  { name: "Paiements échelonnés", path: "/installment-payments", icon: CreditCard },
  { name: "Dettes", path: "/debts", icon: Scale },
];

export const MobileNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-background/98 backdrop-blur-lg border-t border-border/50 shadow-lg z-50 md:hidden safe-area-inset-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {navItems.map((item) => {
            const isItemActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                onClick={() => navigate(item.path)}
                className={`flex flex-col h-12 flex-1 max-w-[72px] gap-0.5 px-1 transition-all duration-200 ${
                  isItemActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                <Icon className={`h-5 w-5 transition-transform ${isItemActive ? 'scale-110' : ''}`} />
                <span className={`text-[10px] leading-tight font-medium ${isItemActive ? 'font-semibold' : ''}`}>
                  {item.label}
                </span>
              </Button>
            );
          })}
          
          {/* Menu button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(true)}
            className="flex flex-col h-12 flex-1 max-w-[72px] gap-0.5 px-1 transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-accent/50"
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] leading-tight font-medium">Menu</span>
          </Button>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-[280px] p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="text-left">Menu</SheetTitle>
          </SheetHeader>

          <nav className="flex-1 overflow-y-auto py-4">
            <div className="space-y-1 px-3">
              {/* Main Navigation */}
              <div className="mb-4">
                {mainNavigation.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/70"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              <Separator className="my-2" />

              {/* Comptes Group */}
              <div className="mb-4">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                  COMPTES
                </div>
                {accountsGroup.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/70"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              <Separator className="my-2" />

              {/* Outils Group */}
              <div className="mb-4">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                  OUTILS
                </div>
                {toolsGroup.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/70"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>

              <Separator className="my-2" />

              {/* Settings */}
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive("/settings")
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/70"
                )}
              >
                <Settings className="h-5 w-5" />
                <span>Paramètres</span>
              </Link>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
};
