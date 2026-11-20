/**
 * Foreign-currency subaccounts.
 *
 * A subaccount (e.g. "CB Ultra · GBP") holds money in its own currency.
 * Every transaction still carries `amount` in the base currency — that is
 * what every statistic sums — and, when one side is a subaccount,
 * `foreign_amount` in that subaccount's currency.
 *
 * The base value of spending in a subaccount is set by the database
 * (`revalue_foreign_account`) at the weighted average rate of the currency
 * bought so far. `foldForeignLedger` is the same rule, used to preview the
 * base value of a transaction before it is saved. Keep the two in step.
 */

export interface FxAccountLike {
  id: string;
  currency?: string | null;
  parent_account_id?: string | null;
  initial_balance?: number | null;
  initial_fx_rate?: number | null;
  fx_rate?: number | null;
}

export interface FxTransactionLike {
  id?: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  foreign_amount?: number | null;
  account_id: string;
  transfer_to_account_id?: string | null;
  transfer_fee?: number | null;
  transaction_date: string;
  created_at?: string | null;
}

export const isForeignAccount = (a: { currency?: string | null } | null | undefined): boolean =>
  !!a?.currency;

/** The figure that moves `accountId`'s own balance (its own currency). */
export function legAmount(
  tx: Pick<FxTransactionLike, 'amount' | 'foreign_amount'>,
  account: { currency?: string | null } | null | undefined,
): number {
  if (isForeignAccount(account) && tx.foreign_amount != null) return Number(tx.foreign_amount) || 0;
  return Number(tx.amount) || 0;
}

export interface ForeignLedgerState {
  /** Units of the foreign currency held. */
  units: number;
  /** Base currency per one foreign unit, weighted by what was paid. */
  rate: number;
}

/**
 * Replays a subaccount's history in accounting order.
 * - Money converted in adds units at the base amount paid (moves the rate).
 * - Spending, income and conversions out leave the rate unchanged.
 */
export function foldForeignLedger(
  account: FxAccountLike,
  transactions: FxTransactionLike[],
  upTo?: string,
): ForeignLedgerState {
  let rate = Number(account.initial_fx_rate ?? account.fx_rate ?? 1) || 1;
  let units = Number(account.initial_balance ?? 0) || 0;
  let cost = units * rate;

  const rows = transactions
    .filter(
      (t) =>
        (t.account_id === account.id ||
          (t.type === 'transfer' && t.transfer_to_account_id === account.id)) &&
        (upTo == null || t.transaction_date <= upTo),
    )
    .sort(
      (a, b) =>
        a.transaction_date.localeCompare(b.transaction_date) ||
        (a.created_at ?? '').localeCompare(b.created_at ?? '') ||
        (a.id ?? '').localeCompare(b.id ?? ''),
    );

  for (const t of rows) {
    const f = Number(t.foreign_amount ?? t.amount) || 0;
    if (t.type === 'transfer' && t.transfer_to_account_id === account.id && t.account_id !== account.id) {
      units += f;
      cost += Number(t.amount) || 0;
      if (units > 1e-6) rate = cost / units;
    } else if (t.type === 'transfer') {
      units -= f + (Number(t.transfer_fee) || 0);
    } else if (t.type === 'income') {
      units += f;
    } else {
      units -= f;
    }
    cost = units * rate;
  }

  return { units, rate };
}

export const roundTo = (n: number, digits = 2) => {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
};

/** Formats an amount in an explicit currency (not the user's base). */
export function formatInCurrency(amount: number, currency: string, locale = 'fr-FR'): string {
  try {
    return amount.toLocaleString(locale, { style: 'currency', currency });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Currencies offered when creating a subaccount (any ISO code is accepted). */
export const COMMON_CURRENCIES = ['GBP', 'USD', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'MAD', 'TRY', 'AED', 'CNY', 'SGD', 'HKD', 'NZD', 'MXN', 'BRL', 'ZAR', 'THB', 'INR', 'EUR'];

/**
 * How a form's amount maps onto the two figures a transaction stores, given
 * the accounts it touches.
 * - `spend`: income or expense on a subaccount — typed in its currency.
 * - `convert_in`: base money into a subaccount — typed in base, plus what
 *   arrives in the subaccount's currency (the rate the user chose).
 * - `convert_out`: subaccount money back to a base account — typed in the
 *   subaccount's currency, plus what arrives in base.
 * - `unsupported`: between two subaccounts (the database refuses these).
 */
export type ForeignMode = 'none' | 'spend' | 'convert_in' | 'convert_out' | 'unsupported';

export function foreignMode(
  type: 'income' | 'expense' | 'transfer',
  source: { currency?: string | null } | null | undefined,
  dest?: { currency?: string | null } | null,
): ForeignMode {
  const s = isForeignAccount(source);
  if (type !== 'transfer') return s ? 'spend' : 'none';
  const d = isForeignAccount(dest);
  if (s && d) return 'unsupported';
  if (d) return 'convert_in';
  if (s) return 'convert_out';
  return 'none';
}

/**
 * The `amount` (base) and `foreign_amount` (subaccount currency) to save.
 * `rate` is base per one foreign unit. `received`, when given, is the
 * figure the user typed for the other side and wins over the rate.
 */
export function resolveLegs(input: {
  mode: ForeignMode;
  entered: number;
  rate: number;
  received?: number | null;
}): { amount: number; foreign_amount: number | null } {
  const { mode, entered } = input;
  const rate = input.rate > 0 ? input.rate : 1;
  const received = input.received != null && input.received > 0 ? input.received : null;
  switch (mode) {
    case 'spend':
      return { amount: roundTo(entered * rate), foreign_amount: entered };
    case 'convert_in':
      return { amount: entered, foreign_amount: received ?? roundTo(entered / rate) };
    case 'convert_out':
      return { amount: received ?? roundTo(entered * rate), foreign_amount: entered };
    default:
      return { amount: entered, foreign_amount: null };
  }
}

/** The currency a transaction's `foreign_amount` is in, if any. */
export function foreignCurrencyOf(tx: {
  foreign_amount?: number | null;
  account?: { currency?: string | null } | null;
  transfer_to_account?: { currency?: string | null } | null;
}): string | null {
  if (tx.foreign_amount == null) return null;
  return tx.account?.currency || tx.transfer_to_account?.currency || null;
}
