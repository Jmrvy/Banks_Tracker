import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { LanguageSelector } from "@/components/LanguageSelector";
import { SidebarResumePill } from "@/components/tour/SidebarResumePill";
import {
  mainNavigation,
  accountsGroup,
  toolsGroup,
  type NavigationItem,
} from "@/config/navigation";

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { togglePalette } = useCommandPalette();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const initials = (user?.user_metadata?.full_name || user?.email || "U")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("");

  const NavLink = ({ item }: { item: NavigationItem }) => {
    const active = isActive(item.path);
    return (
      <Link
        to={item.path}
        className={cn("ft-nav-item", active && "active")}
      >
        <item.icon className="ft-nav-icon" />
        <span>{t(item.nameKey)}</span>
      </Link>
    );
  };

  return (
    <aside data-tour="nav" className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-line flex flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="h-7 w-7 rounded-lg bg-foreground text-background dark:bg-primary dark:text-primary-foreground grid place-items-center font-bold text-sm tracking-tight">
          S
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">Spending</div>
          <div className="text-[11px] text-muted-foreground -mt-0.5">Tracker</div>
        </div>
      </div>

      {/* Search shortcut — opens the global command palette directly through
          context, not via a synthetic keyboard event (which was fragile and
          relied on the document listener still being attached). */}
      <div className="px-3 pb-3">
        <button
          data-tour="search"
          onClick={togglePalette}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-[12.5px] text-muted-foreground bg-bg-subtle border border-line hover:bg-bg-hover hover:text-foreground transition-colors text-left"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1">{t("common.searchPlaceholder")}</span>
          <kbd className="text-[10px] font-mono bg-bg-elev border border-line-strong text-fg-dim px-1 py-px rounded">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {/* Main */}
        <div className="flex flex-col gap-px">
          {mainNavigation.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
        </div>

        {/* Accounts group */}
        <div className="flex flex-col gap-px mt-2">
          <div className="ft-nav-label">{t(accountsGroup.labelKey)}</div>
          {accountsGroup.items.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
        </div>

        {/* Tools group */}
        <div className="flex flex-col gap-px mt-2">
          <div className="ft-nav-label">{t(toolsGroup.labelKey)}</div>
          {toolsGroup.items.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
        </div>
      </nav>

      {/* Language selector */}
      <SidebarResumePill />

      {/* Language selector */}
      <div className="px-3 pb-2">
        <LanguageSelector />
      </div>

      {/* User footer — clickable: opens Settings */}
      <button
        type="button"
        onClick={() => navigate("/settings")}
        aria-label={t("navigation.settings")}
        className={cn(
          "group flex items-center gap-2.5 px-3 py-3 border-t border-line text-left transition-colors w-full hover:bg-bg-hover",
          location.pathname.startsWith("/settings") && "bg-bg-subtle"
        )}
      >
        <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold flex-shrink-0">
          {initials || "JM"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground truncate">
            {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
          </p>
          <p className="text-[11px] text-fg-dim truncate">Personal · Pro</p>
        </div>
        <SettingsIcon className="h-4 w-4 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
      </button>
    </aside>
  );
}
