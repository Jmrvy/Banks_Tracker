import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Plus, Menu, Search, ChevronRight, Home, Wallet, Target, X, Eye, EyeOff, Moon, Sun } from "lucide-react";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useTheme } from "@/components/ThemeProvider";
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
  // AppTopbar carries these on desktop but is gated behind `!isMobile`, so
  // when the old dashboard header was removed mobile lost its only one-tap
  // privacy and theme switches. The menu sheet is the shell's overflow, so
  // they belong here — same hooks, same labels as the topbar.
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  const { resolvedTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const { open: paletteOpen, togglePalette } = useCommandPalette();

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
        className={cn("ft-tab min-w-0", active && "active")}
      >
        <item.icon className="h-5 w-5 flex-shrink-0" />
        {/* The design's bar carries five slots; this one carries six, so the
            label has to survive a narrower column than the pack allows for. */}
        <span className="w-full truncate text-center">{t(item.nameKey)}</span>
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

  /* One row of the "Plus" sheet. The design gives a mobile menu row an
     accent-tinted 34px tile, a 14px title and an 11px inset — not the
     sidebar's flat 13.5px row, which belongs to a much denser surface. */
  const MenuRow = ({ item }: { item: NavigationItem }) => {
    const active = isActive(item.path);
    return (
      <Link
        to={item.path}
        onClick={() => setMenuOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-[11px] text-left border-t border-line-soft first:border-t-0 transition-colors",
          active && "bg-[hsl(var(--accent-wash))]",
        )}
      >
        <span className="ft-kpi-icon acc h-[34px] w-[34px] rounded-[12px]">
          <item.icon className="h-4 w-4" />
        </span>
        <span className="flex-1 min-w-0 truncate text-[14px] font-semibold">{t(item.nameKey)}</span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-fg-dim" />
      </Link>
    );
  };

  return (
    <>
      <nav data-tour="nav" className="ft-tabbar safe-area-inset-bottom">
        <Tab item={TAB_HOME} />
        <Tab item={TAB_ACCOUNTS} />

        {/* Centre action — raised, and the only filled control on the bar.
            No label: the pack's FAB slot carries the glyph alone. */}
        <button
          data-tour="new-tx"
          type="button"
          onClick={() => navigate("/new-transaction")}
          aria-label={t("transactions.newTransaction")}
          className="ft-tab min-w-0"
        >
          <span className="ft-tab-fab">
            <Plus className="h-5 w-5" />
          </span>
        </button>

        <Tab item={TAB_BUDGET} />

        {/* Search opens the command palette, which is a full-screen sheet on
            mobile — reachable without relying on a hidden ⌘K shortcut. It
            lights up while its surface is open, the way the pack lights the
            search tab whenever the search sheet is up. */}
        <button
          data-tour="search"
          type="button"
          onClick={togglePalette}
          aria-label={t("common.search", { defaultValue: "Search" })}
          className={cn("ft-tab min-w-0", paletteOpen && "active")}
        >
          <Search className="h-5 w-5 flex-shrink-0" />
          <span className="w-full truncate text-center">{t("common.search", { defaultValue: "Search" })}</span>
        </button>

        {/* "Plus" — the rest of the app. */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("common.menu")}
          className={cn("ft-tab min-w-0", menuOpen && "active")}
        >
          <Menu className="h-5 w-5 flex-shrink-0" />
          <span className="w-full truncate text-center">{t("common.menu")}</span>
        </button>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        {/* `hideClose`: the sheet head carries its own dismiss, inline with
            the title, so the floating corner button would double it. The
            26px shoulder and the grab handle come from `ft-sheet`. */}
        <SheetContent side="bottom" hideClose className="flex flex-col gap-0 p-0 max-h-[88vh]">
          <div className="ft-sheet-head">
            <SheetTitle className="ft-sheet-title min-w-0 truncate text-[21px] font-normal">
              {t("common.menu")}
            </SheetTitle>
            <button
              type="button"
              onClick={togglePrivacyMode}
              aria-label={t(isPrivacyMode ? "common.showAmounts" : "common.hideAmounts")}
              className="h-[29px] w-[29px] flex-shrink-0 grid place-items-center rounded-[9px] text-fg-mute transition-colors hover:bg-bg-hover hover:text-foreground"
            >
              {isPrivacyMode ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
            </button>
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label={t("settings.theme")}
              className="h-[29px] w-[29px] flex-shrink-0 grid place-items-center rounded-[9px] text-fg-mute transition-colors hover:bg-bg-hover hover:text-foreground"
            >
              {resolvedTheme === "dark" ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
            </button>
            <SheetClose className="h-[29px] w-[29px] flex-shrink-0 grid place-items-center rounded-[9px] text-fg-mute transition-colors hover:bg-bg-hover hover:text-foreground">
              <X className="h-[17px] w-[17px]" />
              <span className="sr-only">{t("common.close")}</span>
            </SheetClose>
          </div>

          <nav className="ft-sheet-body flex-1 min-h-0">
            {menuGroups.map((group, gi) => (
              <div key={gi} className="ft-card-flush flex-shrink-0">
                {group.labelKey && (
                  <div className="px-4 pt-[13px] pb-[9px] text-[11.5px] font-bold uppercase tracking-[0.07em] text-fg-dim">
                    {t(group.labelKey)}
                  </div>
                )}
                {group.items.map((item) => (
                  <MenuRow key={item.path} item={item} />
                ))}
              </div>
            ))}

            <div className="ft-card-flush flex-shrink-0">
              <MenuRow item={settingsItem} />
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
};
