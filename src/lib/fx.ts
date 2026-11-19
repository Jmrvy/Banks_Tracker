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
