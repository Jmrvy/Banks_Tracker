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
  name: string;
  path: string;
  icon: LucideIcon;
}

export interface NavigationGroup {
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}

// Main navigation (always visible)
export const mainNavigation: NavigationItem[] = [
  { name: "Accueil", path: "/", icon: Home },
  { name: "Rapports", path: "/reports", icon: PieChart },
];

// Comptes group - Account-related pages
export const accountsGroup: NavigationGroup = {
  label: "Comptes",
  icon: Wallet,
  items: [
    { name: "Comptes", path: "/accounts", icon: Wallet },
    { name: "Transactions", path: "/transactions", icon: History },
    { name: "Epargne", path: "/savings", icon: PiggyBank },
  ],
};

// Outils group - Tools and utilities
export const toolsGroup: NavigationGroup = {
  label: "Outils",
  icon: Settings,
  items: [
    { name: "Transactions Recurrentes", path: "/recurring-transactions", icon: Receipt },
    { name: "Paiements echelonnes", path: "/installment-payments", icon: CreditCard },
    { name: "Dettes", path: "/debts", icon: Scale },
  ],
};

// Settings item
export const settingsItem: NavigationItem = {
  name: "Parametres",
  path: "/settings",
  icon: Settings,
};

// Bottom navigation items for mobile (quick access)
export const mobileBottomNav: NavigationItem[] = [
  { name: "Accueil", path: "/", icon: Home },
  { name: "Comptes", path: "/accounts", icon: Wallet },
];

// All navigation groups
export const navigationGroups: NavigationGroup[] = [accountsGroup, toolsGroup];

// Get all navigation items flat
export const getAllNavigationItems = (): NavigationItem[] => {
  return [
    ...mainNavigation,
    ...accountsGroup.items,
    ...toolsGroup.items,
    settingsItem,
  ];
};
