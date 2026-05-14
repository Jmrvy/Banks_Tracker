/**
 * Single source of truth for "what is this transaction worth, in the
 * context of a sum?". Used by the command palette result row, the search
 * result modal, and any other place that displays an aggregated total
 * across mixed-type transactions.
 *
 *  - income  → +amount
 *  - expense → −(amount − refunded_amount). A refunded expense is a
 *              smaller real outflow.
 *  - transfer → 0. Transfers between the user's own accounts are net-zero
 *               wealth movements; counting them inflates the sum.
 */
import type { Transaction } from '@/hooks/useFinancialData';

export function signedNet(tx: Transaction): number {
  const raw = Number(tx.amount) || 0;
  if (tx.type === 'income') return raw;
  if (tx.type === 'expense') {
    return -(raw - Number(tx.refunded_amount || 0));
  }
  // Transfer between the user's own accounts: nets to zero for the user
  return 0;
}

export interface TxAggregate {
  /** Signed sum across all rows. Negative = net outflow. */
  net: number;
  /** Sum of positive contributions (income only). */
  income: number;
  /** Sum of negative contributions, as a positive number (expense net of refunds). */
  expense: number;
  /** Count of transactions that were transfers (they contribute 0 to net). */
  transferCount: number;
  /** Total count, including transfers. */
  count: number;
}

export function aggregateTransactions(txs: Transaction[]): TxAggregate {
  let income = 0;
  let expense = 0;
  let transferCount = 0;
  for (const tx of txs) {
    if (tx.type === 'income') {
      income += Number(tx.amount) || 0;
    } else if (tx.type === 'expense') {
      const raw = Number(tx.amount) || 0;
      expense += raw - Number(tx.refunded_amount || 0);
    } else {
      transferCount += 1;
    }
  }
  return {
    net: income - expense,
    income,
    expense,
    transferCount,
    count: txs.length,
  };
}
