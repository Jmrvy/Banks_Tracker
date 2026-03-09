import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LanguageSelector } from "@/components/LanguageSelector";
import { mainNavigation, accountsGroup, toolsGroup, settingsItem } from "@/config/navigation";

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar/80 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col shadow-[inset_-0.5px_0_0_0_hsl(210_20%_98%/0.04)]">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-white/[0.06]">
        <span className="text-2xl font-bold text-primary drop-shadow-[0_0_12px_hsl(38_70%_68%/0.3)]">JMRVY CB</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-3">
          {/* Main Navigation */}
          {mainNavigation.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  "hover:bg-white/[0.06] hover:text-sidebar-accent-foreground",
                  active
                    ? "bg-white/[0.08] text-sidebar-accent-foreground shadow-[inset_0_0.5px_0_0_hsl(210_20%_98%/0.06),0_1px_4px_-1px_hsl(220_20%_4%/0.3)]"
                    : "text-sidebar-foreground/70"
                )}
              >
                <item.icon className={cn("h-5 w-5 transition-colors", active && "text-primary")} />
                <span>{t(item.nameKey)}</span>
              </Link>
            );
          })}

          {/* Comptes Group */}
          <Collapsible defaultOpen className="mt-4">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-sidebar-foreground/90 hover:text-sidebar-foreground transition-colors">
              <div className="flex items-center gap-2">
                <accountsGroup.icon className="h-4 w-4" />
                <span>{t(accountsGroup.labelKey)}</span>
              </div>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1">
              {accountsGroup.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 ml-6 rounded-xl text-sm font-medium transition-all duration-200",
                      "hover:bg-white/[0.06] hover:text-sidebar-accent-foreground",
                      active
                        ? "bg-white/[0.08] text-sidebar-accent-foreground shadow-[inset_0_0.5px_0_0_hsl(210_20%_98%/0.06),0_1px_4px_-1px_hsl(220_20%_4%/0.3)]"
                        : "text-sidebar-foreground/70"
                    )}
                  >
                    <item.icon className={cn("h-4 w-4 transition-colors", active && "text-primary")} />
                    <span>{t(item.nameKey)}</span>
                  </Link>
                );
              })}
            </CollapsibleContent>
          </Collapsible>

          {/* Outils Group */}
          <Collapsible defaultOpen className="mt-2">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-sidebar-foreground/90 hover:text-sidebar-foreground transition-colors">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                <span>{t(toolsGroup.labelKey)}</span>
              </div>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1">
              {toolsGroup.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 ml-6 rounded-xl text-sm font-medium transition-all duration-200",
                      "hover:bg-white/[0.06] hover:text-sidebar-accent-foreground",
                      active
                        ? "bg-white/[0.08] text-sidebar-accent-foreground shadow-[inset_0_0.5px_0_0_hsl(210_20%_98%/0.06),0_1px_4px_-1px_hsl(220_20%_4%/0.3)]"
                        : "text-sidebar-foreground/70"
                    )}
                  >
                    <item.icon className={cn("h-4 w-4 transition-colors", active && "text-primary")} />
                    <span>{t(item.nameKey)}</span>
                  </Link>
                );
              })}
            </CollapsibleContent>
          </Collapsible>

        </div>
      </nav>

      {/* Language selector */}
      <div className="px-4 pb-2">
        <LanguageSelector />
      </div>

      {/* User section - links to settings */}
      <div className="p-4 border-t border-white/[0.06]">
        <Link
          to={settingsItem.path}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200",
            "hover:bg-white/[0.06] hover:text-sidebar-accent-foreground",
            isActive(settingsItem.path)
              ? "bg-white/[0.08] text-sidebar-accent-foreground"
              : ""
          )}
        >
          <div className="h-8 w-8 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center text-sm font-semibold shadow-[0_0_12px_0_hsl(38_70%_68%/0.25)]">
            JM
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">Joris</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{t(settingsItem.nameKey)}</p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
