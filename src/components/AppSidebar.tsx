import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Search, Settings as SettingsIcon, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { LanguageSelector } from "@/components/LanguageSelector";
import { SidebarResumePill } from "@/components/tour/SidebarResumePill";
import { TraceMark } from "@/components/trace/TraceMark";
import { useTrace } from "@/contexts/TraceContext";
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
  const { openDock } = useTrace();

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
      className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-line flex flex-col gap-4 px-3 pt-5 pb-3 overflow-y-auto"
    >
      {/* Brand — the display serif's smallest appearance, and the only place
          the app signs its own name. */}
      <Link to="/" className="flex items-center gap-2.5 px-2 pb-1">
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
      <div className="flex flex-col gap-1.5">
        <button
          data-tour="search"
          onClick={togglePalette}
          className="flex items-center gap-2 w-full px-2.5 py-2.5 rounded-md text-[12.5px] text-fg-dim bg-bg-elev border border-line hover:border-line-strong hover:text-fg-mute transition-colors text-left"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1">{t("common.searchPlaceholder")}</span>
          <kbd className="text-[10px] font-mono bg-bg-elev border border-line-strong text-fg-dim px-1.5 py-px rounded-[5px]">
            ⌘K
          </kbd>
        </button>

        {/* Ask Trace about the page currently open. Distinct from the
            palette: the palette is deterministic search, this is the
            copilot scoped to what the user is looking at. */}
        <button
          onClick={openDock}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-[12.5px] text-fg-dim bg-bg-elev border border-line hover:border-line-strong hover:text-fg-mute transition-colors text-left"
        >
          <TraceMark size="sm" plain />
          <span className="flex-1 truncate">
            {t("trace.askAboutPage", { defaultValue: "Ask Trace about this page" })}
          </span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col">
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
        className="flex items-center justify-center gap-2 h-[38px] rounded-md bg-primary text-on-accent text-[13px] font-bold hover:brightness-105 active:translate-y-px transition-all"
      >
        <Plus className="h-4 w-4" />
        {t("transactions.newTransaction")}
      </Link>

      <SidebarResumePill />

      {/* Footer — settings, language, and the account this data belongs to. */}
      <div className="mt-auto pt-2.5 border-t border-line flex flex-col gap-1">
        <div className="px-0.5 pb-1">
          <LanguageSelector />
        </div>

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
          className="group flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors w-full hover:bg-bg-hover"
        >
          <div className="h-8 w-8 rounded-[11px] bg-primary/[0.16] text-accent-deep grid place-items-center text-xs font-bold flex-shrink-0">
            {initials || "JM"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-fg-dim truncate">{user?.email}</p>
          </div>
          <MoreHorizontal className="h-4 w-4 text-fg-dim group-hover:text-foreground flex-shrink-0" />
        </button>
      </div>
    </aside>
  );
}
