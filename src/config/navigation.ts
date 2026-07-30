import {
  Home,
  Sparkles,
  BarChart3,
  Wallet,
  CalendarClock,
  Settings,
  History,
  PiggyBank,
  Target,
  LucideIcon,
} from "lucide-react";

export interface NavigationItem {
  nameKey: string; // i18n key
  path: string;
  icon: LucideIcon;
}

export interface NavigationGroup {
  labelKey: string; // i18n key
  icon: LucideIcon;
  items: NavigationItem[];
}

// Main navigation (always visible).
// Trace sits alongside Home rather than in a group: it is a destination
// in its own right, and burying the copilot under "Tools" would make it
// the least discoverable thing in the app.
export const mainNavigation: NavigationItem[] = [
  { nameKey: "navigation.home", path: "/", icon: Home },
  { nameKey: "navigation.trace", path: "/trace", icon: Sparkles },
];

// Comptes group — Account-related pages.
// Debts moved to the unified `/scheduled` page (loans tab) per the audit's
// IA simplification: subscriptions / plans / loans share one mental model.
export const accountsGroup: NavigationGroup = {
  labelKey: "navigation.accounts",
  icon: Wallet,
  items: [
    { nameKey: "navigation.accounts", path: "/accounts", icon: Wallet },
    { nameKey: "navigation.transactions", path: "/transactions", icon: History },
    { nameKey: "navigation.savings", path: "/savings", icon: PiggyBank },
  ],
};

// Outils group — Tools and utilities.
// `Scheduled` consolidates the previous Recurring + Installments + Debts
// entries into one item with sub-tabs.
export const toolsGroup: NavigationGroup = {
  labelKey: "navigation.tools",
  icon: Settings,
  items: [
    { nameKey: "navigation.analyse", path: "/analyse", icon: BarChart3 },
    { nameKey: "navigation.budget", path: "/budget", icon: Target },
    { nameKey: "navigation.scheduled", path: "/scheduled", icon: CalendarClock },
  ],
};

// Settings item
export const settingsItem: NavigationItem = {
  nameKey: "navigation.settings",
  path: "/settings",
  icon: Settings,
};

// Bottom navigation items for mobile (quick access)
export const mobileBottomNav: NavigationItem[] = [
  { nameKey: "navigation.home", path: "/", icon: Home },
  { nameKey: "navigation.accounts", path: "/accounts", icon: Wallet },
];

// All navigation groups
export const navigationGroups: NavigationGroup[] = [accountsGroup, toolsGroup];
