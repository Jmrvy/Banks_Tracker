import { useMemo } from "react";
import type { Account, Transaction } from "@/hooks/useFinancialData";
import { parseLocalDate } from "@/lib/dateUtils";

export interface AccountSeriesPoint {
  d: number;
  v: number;
}

export interface AccountSeries {
  accountId: string;
  series: AccountSeriesPoint[];
  change30d: number;
  changePct: number;
}

/**
 * Replays transactions backward from each account's current balance to produce
 * a 90-day balance series + 30-day delta. Used by the Accounts overview cards.
 */
export function useAccountSeries(
  accounts: Account[],
  transactions: Transaction[],
  days = 90,
): Record<string, AccountSeries> {
  return useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    // For each account, build a per-day delta map covering the window
    const deltasByAccount = new Map<string, Map<string, number>>();
    for (const acc of accounts) {
      deltasByAccount.set(acc.id, new Map());
    }

    for (const txn of transactions) {
      // This is a cash-balance replay, not a statistics series: every bank
      // movement counts, including rows excluded from reports. Future
      // accounting dates are not in the displayed window and are ignored.
      const d = parseLocalDate(txn.transaction_date);
      if (d > today) continue;
      const k = dayKey(d);

      if (txn.type === "income") {
        const m = deltasByAccount.get(txn.account_id);
        if (m) m.set(k, (m.get(k) || 0) + txn.amount);
      } else if (txn.type === "expense") {
        const m = deltasByAccount.get(txn.account_id);
        if (m) m.set(k, (m.get(k) || 0) - txn.amount);
      } else if (txn.type === "transfer") {
        const fromMap = deltasByAccount.get(txn.account_id);
        if (fromMap) fromMap.set(k, (fromMap.get(k) || 0) - txn.amount - (txn.transfer_fee || 0));
        if (txn.transfer_to_account_id) {
          const toMap = deltasByAccount.get(txn.transfer_to_account_id);
          if (toMap) toMap.set(k, (toMap.get(k) || 0) + txn.amount);
        }
      }
    }

    const out: Record<string, AccountSeries> = {};
    for (const acc of accounts) {
      const deltaMap = deltasByAccount.get(acc.id) ?? new Map<string, number>();
      const series: AccountSeriesPoint[] = new Array(days);
      let v = acc.balance;
      for (let i = days - 1; i >= 0; i--) {
        const day = new Date(today);
        day.setDate(today.getDate() - (days - 1 - i));
        series[i] = { d: i, v };
        v -= deltaMap.get(dayKey(day)) || 0;
      }
      // change30d = last - 30 days ago
      const change30d = days >= 30
        ? series[days - 1].v - series[days - 30].v
        : 0;
      const baseline = days >= 30 ? series[days - 30].v : 0;
      const changePct = baseline === 0 ? 0 : (change30d / Math.abs(baseline)) * 100;

      out[acc.id] = {
        accountId: acc.id,
        series,
        change30d,
        changePct,
      };
    }
    return out;
  }, [accounts, transactions, days]);
}
