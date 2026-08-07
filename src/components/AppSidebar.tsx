import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Search, Settings as SettingsIcon, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { SidebarResumePill } from "@/components/tour/SidebarResumePill";
import {
  mainNavigation,
  accountsGroup,
  toolsGroup,
  settingsItem,
  type NavigationItem,
} from "@/config/navigation";

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { transactions } = useFinancialData();
  const { togglePalette } = useCommandPalette();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  const initials = (user?.user_metadata?.full_name || user?.email || "U")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("");

  const NavLink = ({ item }: { item: NavigationItem }) => {
    const active = isActive(item.path);
    // Only the transaction count gets a pill: it is a row count the app
    // already holds exactly, so it can never disagree with the page it
    // points at. Counts that would need deriving (budgets over, dues late)
    // are deliberately left off rather than risk a second, drifting total.
    const pill = item.path === "/transactions" && transactions.length > 0
      ? transactions.length.toLocaleString()
      : null;
    return (
      <Link to={item.path} className={cn("ft-nav-item", active && "active")}>
        <item.icon className="ft-nav-icon" />
        <span className="truncate">{t(item.nameKey)}</span>
        {item.path === "/trace" && (
          <span className="ft-tag acc ml-auto flex-shrink-0 !text-[10px]">
            {t("common.new", { defaultValue: "New" })}
          </span>
        )}
        {pill && <span className="ft-nav-pill">{pill}</span>}
      </Link>
    );
  };

  return (
    <aside
      data-tour="nav"
      className="fixed left-0 top-0 h-screen w-[250px] bg-sidebar border-r border-line flex flex-col gap-4 px-3 pt-5 pb-3 overflow-y-auto"
    >
      {/* Brand — the display serif's smallest appearance, and the only place
          the app signs its own name. */}
      <Link to="/" className="flex items-center gap-2.5 px-2 pt-0.5 pb-1">
        <span className="ft-brand-mark">S</span>
        <span className="min-w-0">
          <span className="ft-brand-name block truncate">Spending Tracker</span>
          <span className="block text-[10px] uppercase tracking-[0.1em] font-semibold text-fg-dim truncate mt-px">
            {displayName}
          </span>
        </span>
      </Link>

      {/* Search shortcut — opens the global command palette directly through
          context, not via a synthetic keyboard event (which was fragile and
          relied on the document listener still being attached). */}
      <button data-tour="search" onClick={togglePalette} className="ft-searchbtn">
        <Search className="h-[15px] w-[15px] flex-shrink-0" />
        <span className="flex-1 truncate">{t("common.searchPlaceholder")}</span>
        <span className="ft-kbd">⌘K</span>
      </button>

      {/* Navigation — three grouped clusters, 16px apart, exactly as the
          design separates them. */}
      <nav className="flex flex-col gap-4">
        <div className="flex flex-col gap-px">
          {mainNavigation.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
        </div>

        <div className="flex flex-col gap-px">
          <div className="ft-nav-label">{t(accountsGroup.labelKey)}</div>
          {accountsGroup.items.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
        </div>

        <div className="flex flex-col gap-px">
          <div className="ft-nav-label">{t(toolsGroup.labelKey)}</div>
          {toolsGroup.items.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
        </div>
      </nav>

      {/* Primary action — the one thing the app is for, always one click
          away regardless of which page is open. */}
      <Link
        to="/new-transaction"
        data-tour="new-tx"
        className="mt-3.5 flex items-center justify-center gap-[7px] h-[34px] rounded-md bg-primary text-on-accent text-[13px] font-[650] hover:brightness-105 active:translate-y-px transition-all"
      >
        <Plus className="h-[15px] w-[15px]" />
        {t("transactions.newTransaction")}
      </Link>

      <SidebarResumePill />

      {/* Footer — settings and the account this data belongs to. Language
          lives in Settings → Preferences, where the design keeps it. */}
      <div className="mt-auto pt-2.5 border-t border-line flex flex-col">
        <Link
          to={settingsItem.path}
          className={cn("ft-nav-item", isActive(settingsItem.path) && "active")}
        >
          <SettingsIcon className="ft-nav-icon" />
          <span>{t(settingsItem.nameKey)}</span>
        </Link>

        <button
          type="button"
          onClick={() => navigate("/settings")}
          aria-label={t("navigation.manageProfile")}
          className="group flex items-center gap-2.5 p-2 rounded-[12px] text-left transition-colors w-full hover:bg-bg-hover"
        >
          <span className="ft-avatar">{initials || "JM"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-[650] text-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-fg-dim truncate">{user?.email}</p>
          </div>
          <MoreHorizontal className="h-[15px] w-[15px] text-fg-dim group-hover:text-foreground flex-shrink-0" />
        </button>
      </div>
    </aside>
  );
}
