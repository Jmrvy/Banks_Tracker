// Values an account in the base currency for MCP callers. A currency
// subaccount stores `balance` in its own currency; its base value is that
// times the weighted-average `fx_rate` (falling back to the opening rate).
// Same rule as supabase/functions/_shared/accountValue.ts — never treat a
// missing rate as 1, or 100 GBP would count as 100 EUR.

interface Row {
  balance: number | string | null;
  currency?: string | null;
  fx_rate?: number | string | null;
  initial_fx_rate?: number | string | null;
}

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round = (n: number, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;

export function valueAccount(a: Row) {
  const native = Number(a.balance) || 0;
  if (!a.currency) return { base_balance: round(native), native_balance: round(native), avg_rate: null as number | null };
  const rate = positive(a.fx_rate) ?? positive(a.initial_fx_rate);
  return {
    base_balance: rate == null ? null : round(native * rate),
    native_balance: round(native),
    avg_rate: rate == null ? null : round(rate, 6),
  };
}
