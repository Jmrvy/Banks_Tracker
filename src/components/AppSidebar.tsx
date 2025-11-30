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
  ChevronDown,
  Wrench,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const mainNavigation = [
  { name: "Home", path: "/", icon: Home },
  { name: "Insights", path: "/insights", icon: TrendingUp },
];

const accountsGroup = [
  { name: "Comptes", path: "/accounts", icon: Wallet },
  { name: "Transactions", path: "/transactions", icon: History },
  { name: "Dettes", path: "/debts", icon: Scale },
];

const toolsGroup = [
  { name: "Rapports", path: "/reports", icon: PieChart },
  { name: "Récurrents", path: "/recurring-transactions", icon: Receipt },
  { name: "Paiements échelonnés", path: "/installment-payments", icon: CreditCard },
];

export function AppSidebar() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const isGroupActive = (items: typeof accountsGroup) => {
    return items.some(item => isActive(item.path));
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <span className="text-2xl font-bold text-primary">⚡ JMRVY CB</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-3">
          {/* Main Navigation */}
          {mainNavigation.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.name}
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
            );
          })}

          {/* Comptes Group */}
          <Collapsible defaultOpen={isGroupActive(accountsGroup)} className="mt-4">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-sidebar-foreground/90 hover:text-sidebar-foreground transition-colors">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                <span>Comptes</span>
              </div>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1">
              {accountsGroup.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 ml-6 rounded-lg text-sm font-medium transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </CollapsibleContent>
          </Collapsible>

          {/* Outils Group */}
          <Collapsible defaultOpen={isGroupActive(toolsGroup)} className="mt-2">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-sidebar-foreground/90 hover:text-sidebar-foreground transition-colors">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                <span>Outils</span>
              </div>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1">
              {toolsGroup.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 ml-6 rounded-lg text-sm font-medium transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </CollapsibleContent>
          </Collapsible>

          {/* Settings */}
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-4",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive("/settings")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70"
            )}
          >
            <Settings className="h-5 w-5" />
            <span>Paramètres</span>
          </Link>
        </div>
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
