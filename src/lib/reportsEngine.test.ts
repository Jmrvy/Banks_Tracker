import { describe, it, expect } from 'vitest';
import {
  filterByPeriod,
  computePeriodStats,
  statsForRange,
  computeInitialBalance,
  signedGlobalAmount,
  realNetChange,
  netExpenseAmount,
  type EngineTx,
} from './reportsEngine';
import { normalizePeriod } from './dateUtils';

const tx = (over: Partial<EngineTx> & Pick<EngineTx, 'amount' | 'type' | 'transaction_date'>): EngineTx => over;

const PERIOD = normalizePeriod({ from: new Date(2026, 5, 1, 12), to: new Date(2026, 5, 30, 12) }); // June 2026

describe('filterByPeriod', () => {
  const txs = [
    tx({ amount: 10, type: 'expense', transaction_date: '2026-06-01' }), // first day
    tx({ amount: 20, type: 'expense', transaction_date: '2026-06-30' }), // last day
    tx({ amount: 30, type: 'expense', transaction_date: '2026-05-31' }), // before
    tx({ amount: 40, type: 'expense', transaction_date: '2026-07-01' }), // after
  ];

  it('includes boundary days even for noon-anchored periods', () => {
    const got = filterByPeriod(txs, PERIOD.from, PERIOD.to, 'accounting');
    expect(got.map((t) => t.amount)).toEqual([10, 20]);
  });

  it('switches timelines between accounting and value date', () => {
    const straddler = tx({
      amount: 99,
      type: 'expense',
      transaction_date: '2026-05-30', // accounting: before period
      value_date: '2026-06-02',       // value: inside period
    });
    expect(filterByPeriod([straddler], PERIOD.from, PERIOD.to, 'accounting')).toHaveLength(0);
    expect(filterByPeriod([straddler], PERIOD.from, PERIOD.to, 'value')).toHaveLength(1);
  });

  it('falls back to transaction_date when value_date is null', () => {
    const noValue = tx({ amount: 5, type: 'income', transaction_date: '2026-06-15', value_date: null });
    expect(filterByPeriod([noValue], PERIOD.from, PERIOD.to, 'value')).toHaveLength(1);
  });
});

describe('computePeriodStats', () => {
  it('applies stats rules: exclusions, refund netting, transfer fees', () => {
    const txs = [
      tx({ amount: 1000, type: 'income', transaction_date: '2026-06-01' }),
      tx({ amount: 50, type: 'income', transaction_date: '2026-06-02', refund_of_transaction_id: 'x' }), // refund → not income
      tx({ amount: 200, type: 'expense', transaction_date: '2026-06-03', refunded_amount: 50 }),          // nets to 150
      tx({ amount: 80, type: 'expense', transaction_date: '2026-06-04', refunded_amount: 100 }),          // over-refunded → 0
      tx({ amount: 30, type: 'expense', transaction_date: '2026-06-05', include_in_stats: false }),       // excluded
      tx({ amount: 500, type: 'transfer', transaction_date: '2026-06-06', transfer_fee: 2 }),             // fee only
    ];
    const r = computePeriodStats(txs);
    expect(r.income).toBe(1000);
    expect(r.expenses).toBe(150);
    expect(r.transferFees).toBe(2);
    expect(r.net).toBe(1000 - 150 - 2);
  });

  it('netExpenseAmount floors at zero', () => {
    expect(netExpenseAmount(tx({ amount: 80, type: 'expense', transaction_date: '2026-06-04', refunded_amount: 100 }))).toBe(0);
    expect(netExpenseAmount(tx({ amount: 80, type: 'expense', transaction_date: '2026-06-04' }))).toBe(80);
  });
});

describe('signedGlobalAmount / realNetChange', () => {
  it('income positive, expense negative, transfer counts only its fee', () => {
    expect(signedGlobalAmount(tx({ amount: 10, type: 'income', transaction_date: '2026-06-01' }))).toBe(10);
    expect(signedGlobalAmount(tx({ amount: 10, type: 'expense', transaction_date: '2026-06-01' }))).toBe(-10);
    expect(signedGlobalAmount(tx({ amount: 500, type: 'transfer', transaction_date: '2026-06-01', transfer_fee: 3 }))).toBe(-3);
    expect(signedGlobalAmount(tx({ amount: 500, type: 'transfer', transaction_date: '2026-06-01' }))).toBe(-0);
  });

  it('realNetChange counts excluded and refund rows (the bank moved the money)', () => {
    const txs = [
      tx({ amount: 100, type: 'income', transaction_date: '2026-06-01', include_in_stats: false }),
      tx({ amount: 40, type: 'income', transaction_date: '2026-06-02', refund_of_transaction_id: 'x' }),
      tx({ amount: 30, type: 'expense', transaction_date: '2026-06-03', refunded_amount: 30 }),
    ];
    expect(realNetChange(txs)).toBe(100 + 40 - 30);
  });
});

describe('computeInitialBalance', () => {
  const accounts = [
    { id: 'A', balance: 1000 },
    { id: 'B', balance: 500 },
  ];

  it('reverses period transactions out of current balances', () => {
    const txs = [
      tx({ amount: 200, type: 'income', transaction_date: '2026-06-10', account_id: 'A' }),
      tx({ amount: 50, type: 'expense', transaction_date: '2026-06-11', account_id: 'B' }),
      tx({ amount: 30, type: 'expense', transaction_date: '2026-05-01', account_id: 'A' }), // before period → untouched
    ];
    // A: 1000 - 200 = 800; B: 500 + 50 = 550 → 1350
    expect(computeInitialBalance(accounts, txs, PERIOD.from, 'accounting')).toBe(1350);
  });

  it('reverses both legs of an internal transfer plus its fee', () => {
    const txs = [
      tx({ amount: 100, type: 'transfer', transaction_date: '2026-06-10', account_id: 'A', transfer_to_account_id: 'B', transfer_fee: 2 }),
    ];
    // A gets back 100+2, B gives back 100 → 1102 + 400 = 1502... (1000+102) + (500-100) = 1502
    expect(computeInitialBalance(accounts, txs, PERIOD.from, 'accounting')).toBe(1502);
  });

  it('ignores legs pointing at accounts outside the set', () => {
    const txs = [
      tx({ amount: 100, type: 'transfer', transaction_date: '2026-06-10', account_id: 'A', transfer_to_account_id: 'EXTERNAL', transfer_fee: 0 }),
    ];
    expect(computeInitialBalance(accounts, txs, PERIOD.from, 'accounting')).toBe(1600);
  });

  it('classifies by the requested date type', () => {
    const txs = [
      tx({ amount: 200, type: 'income', transaction_date: '2026-05-30', value_date: '2026-06-02', account_id: 'A' }),
    ];
    // Accounting: before period → not reversed. Value: inside → reversed.
    expect(computeInitialBalance(accounts, txs, PERIOD.from, 'accounting')).toBe(1500);
    expect(computeInitialBalance(accounts, txs, PERIOD.from, 'value')).toBe(1300);
  });
});

describe('reconciliation invariants', () => {
  // NOTE: the ledger-closing ≡ current-total invariant assumes transfers
  // stay between tracked accounts (the app's transfer flow). A transfer
  // whose destination is outside the account set moves its full amount
  // out of the tracked total while the global ledger only sees the fee.
  const accounts = [{ id: 'A', balance: 2000 }, { id: 'B', balance: 1000 }];
  const txs = [
    tx({ amount: 1000, type: 'income', transaction_date: '2026-06-01', account_id: 'A' }),
    tx({ amount: 300, type: 'expense', transaction_date: '2026-06-10', account_id: 'A', refunded_amount: 100 }),
    tx({ amount: 100, type: 'income', transaction_date: '2026-06-11', account_id: 'A', refund_of_transaction_id: 'r' }),
    tx({ amount: 40, type: 'expense', transaction_date: '2026-06-15', account_id: 'A', include_in_stats: false }),
    tx({ amount: 500, type: 'transfer', transaction_date: '2026-06-20', account_id: 'A', transfer_to_account_id: 'B', transfer_fee: 5 }),
    tx({ amount: 120, type: 'expense', transaction_date: '2026-05-15', account_id: 'A' }), // outside period
  ];

  it('initialBalance + realNetChange(filtered) equals the ledger walk (the invariant BUG-3 broke)', () => {
    const filtered = filterByPeriod(txs, PERIOD.from, PERIOD.to, 'accounting');
    const initial = computeInitialBalance(accounts, txs, PERIOD.from, 'accounting');
    let running = initial;
    for (const t of filtered) running += signedGlobalAmount(t);
    expect(running).toBeCloseTo(initial + realNetChange(filtered), 10);
    // And when the period ends today, the ledger's closing equals the
    // actual current total (3000): everything after period.from was
    // reversed into `initial` and is now re-applied.
    expect(running).toBeCloseTo(3000, 10);
  });

  it('statsForRange equals filter + computePeriodStats', () => {
    expect(statsForRange(txs, PERIOD.from, PERIOD.to, 'accounting'))
      .toEqual(computePeriodStats(filterByPeriod(txs, PERIOD.from, PERIOD.to, 'accounting')));
  });
});
