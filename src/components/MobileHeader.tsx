import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  TrendingUp,
  Wallet,
  History,
  CreditCard,
  Scale,
  PieChart,
  Receipt,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const mainNavigation = [
  { name: "Accueil", path: "/", icon: Home },
  { name: "Rapports", path: "/reports", icon: PieChart },
];

const accountsGroup = [
  { name: "Comptes", path: "/accounts", icon: Wallet },
  { name: "Transactions", path: "/transactions", icon: History },
];

const toolsGroup = [
  { name: "Récurrents", path: "/recurring-transactions", icon: Receipt },
  { name: "Paiements échelonnés", path: "/installment-payments", icon: CreditCard },
  { name: "Dettes", path: "/debts", icon: Scale },
];

export const MobileHeader = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-background/95 backdrop-blur-lg border-b border-border/50 shadow-sm z-50 md:hidden">
        <div className="flex items-center justify-center h-full px-4">
          <span className="text-lg font-bold text-primary">⚡ JMRVY CB</span>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
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
                      onClick={() => setOpen(false)}
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
                      onClick={() => setOpen(false)}
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
                      onClick={() => setOpen(false)}
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
                onClick={() => setOpen(false)}
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
