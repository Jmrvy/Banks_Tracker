/**
 * Shared label constants for bank names, account types, and recurrence frequencies.
 * Use these with i18n keys: t(`accounts.banks.${bank}`) or t(`accounts.types.${type}`)
 * Fallback maps are provided for non-i18n contexts (emails, edge functions, etc.)
 */

/** All supported bank identifiers */
export const BANK_IDS = [
  'societe_generale',
  'revolut',
  'boursorama',
  'bnp_paribas',
  'credit_agricole',
  'lcl',
  'caisse_epargne',
  'credit_mutuel',
  'other',
] as const;

export type BankId = (typeof BANK_IDS)[number];

/** Fallback labels for banks (used when i18n is unavailable) */
export const BANK_LABELS: Record<BankId, string> = {
  societe_generale: 'Société Générale',
  revolut: 'Revolut',
  boursorama: 'Boursorama',
  bnp_paribas: 'BNP Paribas',
  credit_agricole: 'Crédit Agricole',
  lcl: 'LCL',
  caisse_epargne: "Caisse d'Épargne",
  credit_mutuel: 'Crédit Mutuel',
  other: 'Autre',
};

/** All supported account types */
export const ACCOUNT_TYPE_IDS = ['checking', 'savings', 'credit', 'investment'] as const;

export type AccountTypeId = (typeof ACCOUNT_TYPE_IDS)[number];

/** Fallback labels for account types */
export const ACCOUNT_TYPE_LABELS: Record<AccountTypeId, string> = {
  checking: 'Compte Courant',
  savings: "Livret d'Épargne",
  credit: 'Carte de Crédit',
  investment: 'Compte Titre',
};

/** All supported recurrence frequencies */
export const RECURRENCE_TYPE_IDS = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;

export type RecurrenceTypeId = (typeof RECURRENCE_TYPE_IDS)[number];

/** Fallback labels for recurrence frequencies */
export const RECURRENCE_LABELS: Record<RecurrenceTypeId, string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  yearly: 'Annuel',
};

/** Bank brand colors for consistent display */
export const BANK_COLORS: Record<string, string> = {
  societe_generale: '#E1001A',
  revolut: '#0075EB',
  boursorama: '#D42E12',
  bnp_paribas: '#00915A',
  credit_agricole: '#009F4D',
  lcl: '#003DA5',
  caisse_epargne: '#CF0A2C',
  credit_mutuel: '#005DA2',
  other: '#6B7280',
};

/**
 * Helper to get a bank label with i18n fallback.
 * Usage: getBankLabel(bank, t) where t is the i18next translate function.
 */
export function getBankLabel(bank: string, t?: (key: string) => string): string {
  if (t) {
    const translated = t(`accounts.banks.${bank}`);
    if (translated !== `accounts.banks.${bank}`) return translated;
  }
  return BANK_LABELS[bank as BankId] || bank;
}

/**
 * Helper to get an account type label with i18n fallback.
 */
export function getAccountTypeLabel(type: string, t?: (key: string) => string): string {
  if (t) {
    const translated = t(`accounts.types.${type}`);
    if (translated !== `accounts.types.${type}`) return translated;
  }
  return ACCOUNT_TYPE_LABELS[type as AccountTypeId] || type;
}

/**
 * Helper to get a recurrence label with i18n fallback.
 */
export function getRecurrenceLabel(recurrence: string, t?: (key: string) => string): string {
  if (t) {
    const translated = t(`recurring.frequencies.${recurrence}`);
    if (translated !== `recurring.frequencies.${recurrence}`) return translated;
  }
  return RECURRENCE_LABELS[recurrence as RecurrenceTypeId] || recurrence;
}
