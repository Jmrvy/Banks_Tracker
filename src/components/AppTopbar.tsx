import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Eye, EyeOff, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useOffline } from "@/hooks/useOffline";
import { useTheme } from "@/components/ThemeProvider";
import {
  mainNavigation,
  accountsGroup,
  toolsGroup,
  settingsItem,
} from "@/config/navigation";

interface Crumb {
  /** i18n key, resolved at render. */
  labelKey: string;
  /** Absent on the group segment — groups are labels, not destinations. */
  path?: string;
}

/**
 * Where a route sits in the information architecture, read off the same
 * navigation config the sidebar renders from. Deriving it here means a nav
 * item can never disagree with the breadcrumb above the page.
 */
function crumbsFor(pathname: string): Crumb[] {
  const inGroup = (group: typeof accountsGroup) =>
    group.items.find((item) =>
      item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)
    );

  const main = mainNavigation.find((item) =>
    item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)
  );
  if (main) return [{ labelKey: main.nameKey, path: main.path }];

  const account = inGroup(accountsGroup);
  if (account) {
    return [
      { labelKey: accountsGroup.labelKey },
      { labelKey: account.nameKey, path: account.path },
    ];
  }

  const tool = inGroup(toolsGroup);
  if (tool) {
    return [
      { labelKey: toolsGroup.labelKey },
      { labelKey: tool.nameKey, path: tool.path },
    ];
  }

  if (pathname.startsWith(settingsItem.path)) {
    return [
      { labelKey: "navigation.account" },
      { labelKey: settingsItem.nameKey, path: settingsItem.path },
    ];
  }
  if (pathname.startsWith("/new-transaction")) {
    return [
      { labelKey: "navigation.entry" },
      { labelKey: "transactions.newTransaction", path: "/new-transaction" },
    ];
  }
  // Installment detail lives under the Scheduled page's plans tab.
  if (pathname.startsWith("/installment-payments")) {
    return [
      { labelKey: toolsGroup.labelKey },
      { labelKey: "navigation.scheduled", path: "/scheduled" },
      { labelKey: "installments.title" },
    ];
  }
  return [];
}

/**
 * Desktop chrome above every page: where you are on the left, the two
 * view-level switches (privacy, theme) on the right. Page-specific actions
 * stay in the page header — this bar is only ever about the whole app.
 */
export function AppTopbar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  const { resolvedTheme, setTheme } = useTheme();
  const { isOnline } = useOffline();

  const crumbs = crumbsFor(location.pathname);
  // The bar itself never unmounts — a route the nav config does not cover
  // (404, OAuth consent) simply shows no trail, but keeps its border and its
  // two view-level switches, exactly as the design does.

  // "system" resolves against the OS, so the toggle flips away from what is
  // actually on screen rather than from the stored preference.
  const isDark = resolvedTheme === "dark";

  return (
    <div className="ft-topbar">
      {crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="ft-crumbs">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            const label = t(crumb.labelKey);
            return (
              <span key={`${crumb.labelKey}-${i}`} className="flex items-center gap-[7px] min-w-0">
                {last ? (
                  <span className="here" aria-current="page">
                    {label}
                  </span>
                ) : crumb.path ? (
                  <Link to={crumb.path} className="hover:text-foreground transition-colors truncate">
                    {label}
                  </Link>
                ) : (
                  <span className="truncate">{label}</span>
                )}
                {!last && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
              </span>
            );
          })}
        </nav>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* The pack shows "synced N minutes ago" here. There is no sync
            timestamp to read, but there IS a real connection state, so the
            chip reports that instead of inventing a freshness claim. */}
        <span className="ft-chip hidden md:inline-flex" title={t(isOnline ? "common.online" : "common.offline")}>
          <i className={cn(isOnline ? "ft-live" : "h-1.5 w-1.5 rounded-full bg-fg-dim")} />
          {t(isOnline ? "common.online" : "common.offline")}
        </span>
        <button
          type="button"
          onClick={togglePrivacyMode}
          aria-label={t(isPrivacyMode ? "common.showAmounts" : "common.hideAmounts")}
          title={t(isPrivacyMode ? "common.showAmounts" : "common.hideAmounts")}
          className="h-[29px] w-[29px] grid place-items-center rounded-[9px] text-muted-foreground hover:bg-bg-hover hover:text-foreground transition-colors"
        >
          {isPrivacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={t("settings.theme")}
          title={t("settings.theme")}
          className="h-[29px] w-[29px] grid place-items-center rounded-[9px] text-muted-foreground hover:bg-bg-hover hover:text-foreground transition-colors"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
