// How a server-side reader values an account in the base currency.
//
// A main account's `balance` is already base currency. A subaccount
// (`currency` set, `parent_account_id` set) stores `balance` in ITS OWN
// currency; its base value is that balance times the weighted-average rate
// the database keeps in `fx_rate` (base per one unit, falling back to the
// opening rate). Summing raw `balance` across accounts would add pounds to
// euros — every total must go through `baseValue`.
//
// Mirrors the client's valuation, except the app shows subaccounts at the
// day's market rate; servers have no market feed, so they say "average rate".

export interface AccountRow {
  id: string;
  name: string;
  balance: number | string | null;
  currency?: string | null;
  parent_account_id?: string | null;
  fx_rate?: number | string | null;
  initial_fx_rate?: number | string | null;
}

/** Columns a reader must select for `valueAccount` to work. */
export const ACCOUNT_FX_COLUMNS = 'currency, parent_account_id, fx_rate, initial_fx_rate';

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export interface ValuedAccount {
  /** Balance in the account's own currency (base for a main account). */
  native_balance: number;
  /** ISO code of `native_balance`; null = base currency. */
  currency: string | null;
  /** Base-currency value, or null when a subaccount has no usable rate. */
  base_balance: number | null;
  /** Base per one unit of `currency` (weighted average), when foreign. */
  avg_rate: number | null;
}

export function valueAccount(a: AccountRow): ValuedAccount {
  const native = Number(a.balance) || 0;
  if (!a.currency) {
    return { native_balance: round(native), currency: null, base_balance: round(native), avg_rate: null };
  }
  // Never silently treat a missing rate as 1: that would count 100 GBP as 100 EUR.
  const rate = positive(a.fx_rate) ?? positive(a.initial_fx_rate);
  return {
    native_balance: round(native),
    currency: a.currency,
    base_balance: rate == null ? null : round(native * rate),
    avg_rate: rate == null ? null : round(rate, 6),
  };
}

/** Base value for totals; an unvalued subaccount contributes nothing. */
export const baseValue = (a: AccountRow): number => valueAccount(a).base_balance ?? 0;

/** Sum of base values. Parent balances exclude their subaccounts, so no double count. */
export const totalBase = (accounts: AccountRow[]): number =>
  round(accounts.reduce((s, a) => s + baseValue(a), 0));
