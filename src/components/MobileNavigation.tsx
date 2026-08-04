import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Plus, Menu, Search, ChevronRight, Home, Wallet, Target } from "lucide-react";
import {
  mainNavigation,
  accountsGroup,
  toolsGroup,
  settingsItem,
  type NavigationItem,
} from "@/config/navigation";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";

/**
 * The four destinations flanking the centre action. Deliberately not the
 * whole IA — everything else lives one tap away behind "Plus", which keeps
 * the bar readable at thumb size. Home / Accounts / Budget are the three
 * screens people open without a task in mind; Search is how they arrive
 * with one.
 */
const TAB_HOME: NavigationItem = { nameKey: "navigation.home", path: "/", icon: Home };
const TAB_ACCOUNTS: NavigationItem = { nameKey: "navigation.accounts", path: "/accounts", icon: Wallet };
const TAB_BUDGET: NavigationItem = { nameKey: "navigation.budget", path: "/budget", icon: Target };

export const MobileNavigation = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { togglePalette } = useCommandPalette();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const Tab = ({ item }: { item: NavigationItem }) => {
    const active = isActive(item.path);
    return (
      <button
        type="button"
        onClick={() => navigate(item.path)}
        aria-current={active ? "page" : undefined}
        className={cn("ft-tab", active && "active")}
      >
        <item.icon className="h-5 w-5" />
        <span>{t(item.nameKey)}</span>
      </button>
    );
  };

  /* Everything not on the bar. Grouped exactly as the sidebar groups it, so
     the two navigations teach the same map. */
  const menuGroups = [
    { labelKey: null as string | null, items: mainNavigation },
    { labelKey: accountsGroup.labelKey, items: accountsGroup.items },
    { labelKey: toolsGroup.labelKey, items: toolsGroup.items },
  ];

  return (
    <>
      <nav data-tour="nav" className="ft-tabbar safe-area-inset-bottom">
        <Tab item={TAB_HOME} />
        <Tab item={TAB_ACCOUNTS} />

        {/* Centre action — raised, and the only filled control on the bar. */}
        <button
          data-tour="new-tx"
          type="button"
          onClick={() => navigate("/new-transaction")}
          aria-label={t("transactions.newTransaction")}
          className="ft-tab"
        >
          <span className="ft-tab-fab">
            <Plus className="h-5 w-5" />
          </span>
        </button>

        <Tab item={TAB_BUDGET} />

        {/* Search opens the command palette, which is a full-screen sheet on
            mobile — reachable without relying on a hidden ⌘K shortcut. */}
        <button
          data-tour="search"
          type="button"
          onClick={togglePalette}
          aria-label={t("common.search", { defaultValue: "Search" })}
          className="ft-tab"
        >
          <Search className="h-5 w-5" />
          <span>{t("common.search", { defaultValue: "Search" })}</span>
        </button>

        {/* "Plus" — the rest of the app. */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("common.menu")}
          className="ft-tab"
        >
          <Menu className="h-5 w-5" />
          <span>{t("common.menu")}</span>
        </button>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="p-0 rounded-t-3xl max-h-[85vh] flex flex-col">
          <SheetHeader className="px-5 pt-4 pb-3 border-b border-line-soft flex-shrink-0">
            <SheetTitle className="text-left font-display text-xl font-normal tracking-tight">
              {t("common.menu")}
            </SheetTitle>
          </SheetHeader>

          <nav className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
            {menuGroups.map((group, gi) => (
              <div key={gi} className="flex flex-col gap-px">
                {group.labelKey && <div className="ft-nav-label">{t(group.labelKey)}</div>}
                {group.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMenuOpen(false)}
                      className={cn("ft-nav-item py-2.5 text-sm", active && "active")}
                    >
                      <item.icon className="h-[18px] w-[18px] flex-shrink-0 ft-nav-icon" />
                      <span className="flex-1">{t(item.nameKey)}</span>
                      <ChevronRight className="h-4 w-4 text-fg-dim" />
                    </Link>
                  );
                })}
              </div>
            ))}

            <div className="flex flex-col gap-px pt-2 border-t border-line-soft">
              <Link
                to={settingsItem.path}
                onClick={() => setMenuOpen(false)}
                className={cn("ft-nav-item py-2.5 text-sm", isActive(settingsItem.path) && "active")}
              >
                <settingsItem.icon className="h-[18px] w-[18px] flex-shrink-0 ft-nav-icon" />
                <span className="flex-1">{t(settingsItem.nameKey)}</span>
                <ChevronRight className="h-4 w-4 text-fg-dim" />
              </Link>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
};
