import {
  Home,
  PieChart,
  Wallet,
  CreditCard,
  Receipt,
  Settings,
  History,
  Scale,
  PiggyBank,
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

// Main navigation (always visible)
export const mainNavigation: NavigationItem[] = [
  { nameKey: "navigation.home", path: "/", icon: Home },
  { nameKey: "navigation.reports", path: "/reports", icon: PieChart },
];

// Comptes group - Account-related pages (includes Debts as requested)
export const accountsGroup: NavigationGroup = {
  labelKey: "navigation.accounts",
  icon: Wallet,
  items: [
    { nameKey: "navigation.accounts", path: "/accounts", icon: Wallet },
    { nameKey: "navigation.transactions", path: "/transactions", icon: History },
    { nameKey: "navigation.savings", path: "/savings", icon: PiggyBank },
    { nameKey: "navigation.debts", path: "/debts", icon: Scale },
  ],
};

// Outils group - Tools and utilities
export const toolsGroup: NavigationGroup = {
  labelKey: "navigation.tools",
  icon: Settings,
  items: [
    { nameKey: "navigation.recurringTransactions", path: "/recurring-transactions", icon: Receipt },
    { nameKey: "navigation.installmentPayments", path: "/installment-payments", icon: CreditCard },
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
