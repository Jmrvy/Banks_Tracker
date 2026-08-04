import { describe, it, expect } from 'vitest';
import {
  filterByPeriod,
  computePeriodStats,
  statsForRange,
  computeInitialBalance,
  computeAccountDelta,
  signedGlobalAmount,
  realNetChange,
  netExpenseAmount,
  netIncomeAmount,
  computeCategoryNets,
  periodContribution,
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

describe('advance repayments', () => {
  it('nets a repaid advance out of income without counting it as spending', () => {
    // 1200 advance received in June, repaid in full the same period.
    const txs = [
      tx({ amount: 3000, type: 'income', transaction_date: '2026-06-01' }),
      tx({ amount: 1200, type: 'income', transaction_date: '2026-06-05', repaid_amount: 1200 }),
      tx({ amount: 1200, type: 'expense', transaction_date: '2026-06-20', repayment_of_transaction_id: 'adv' }),
    ];
    const stats = computePeriodStats(txs);
    // The advance is not earnings and settling it is not spending.
    expect(stats.income).toBe(3000);
    expect(stats.expenses).toBe(0);
    expect(stats.net).toBe(3000);
  });

  it('nets only what has been repaid so far', () => {
    const txs = [
      tx({ amount: 1200, type: 'income', transaction_date: '2026-06-05', repaid_amount: 500 }),
      tx({ amount: 500, type: 'expense', transaction_date: '2026-06-20', repayment_of_transaction_id: 'adv' }),
    ];
    const stats = computePeriodStats(txs);
    expect(stats.income).toBe(700);
    expect(stats.expenses).toBe(0);
  });

  it('floors an over-repaid income at zero rather than going negative', () => {
    expect(netIncomeAmount(tx({ amount: 100, type: 'income', transaction_date: '2026-06-01', repaid_amount: 150 }))).toBe(0);
  });

  it('leaves ordinary spending alone', () => {
    const txs = [
      tx({ amount: 1000, type: 'income', transaction_date: '2026-06-01' }),
      tx({ amount: 200, type: 'expense', transaction_date: '2026-06-02' }),
    ];
    const stats = computePeriodStats(txs);
    expect(stats.income).toBe(1000);
    expect(stats.expenses).toBe(200);
  });
});

describe('computeCategoryNets', () => {
  it('nets refunds and reports the parts', () => {
    const txs = [
      tx({ amount: 660, type: 'expense', transaction_date: '2026-06-01', category_id: 'loisirs' }),
      tx({ amount: 40, type: 'expense', transaction_date: '2026-06-02', category_id: 'loisirs', refunded_amount: 40 }),
      tx({ amount: 40, type: 'income', transaction_date: '2026-06-03', category_id: 'loisirs', refund_of_transaction_id: 'x' }),
    ];
    const row = computeCategoryNets(txs).get('loisirs')!;
    expect(row.gross).toBe(700);
    expect(row.refunded).toBe(40);
    expect(row.net).toBe(660);
  });

  // A category works on both sides now, so income filed on a budgeted
  // category is ordinary earnings. Only a refund link reduces the budget,
  // and it does so through the expense's refunded_amount.
  it('leaves unlinked income on a budgeted category out of the net', () => {
    const txs = [
      tx({ amount: 660, type: 'expense', transaction_date: '2026-06-01', category_id: 'loisirs' }),
      tx({ amount: 120, type: 'income', transaction_date: '2026-06-02', category_id: 'loisirs' }),
      tx({ amount: 2000, type: 'income', transaction_date: '2026-06-03', category_id: 'salaire' }),
    ];
    const nets = computeCategoryNets(txs);
    expect(nets.get('loisirs')!.net).toBe(660);
    expect(nets.has('salaire')).toBe(false);
  });

  it('skips rows that are not spending', () => {
    const txs = [
      tx({ amount: 100, type: 'expense', transaction_date: '2026-06-01', category_id: 'loisirs' }),
      tx({ amount: 50, type: 'expense', transaction_date: '2026-06-02', category_id: 'loisirs', include_in_stats: false }),
      tx({ amount: 70, type: 'expense', transaction_date: '2026-06-03', category_id: 'loisirs', special_budget_id: 'trip' }),
      tx({ amount: 90, type: 'expense', transaction_date: '2026-06-04', category_id: 'loisirs', repayment_of_transaction_id: 'adv' }),
    ];
    expect(computeCategoryNets(txs).get('loisirs')!.net).toBe(100);
  });

  it('goes negative when more came back than went out', () => {
    const txs = [
      tx({ amount: 100, type: 'expense', transaction_date: '2026-06-01', category_id: 'loisirs', refunded_amount: 160 }),
    ];
    expect(computeCategoryNets(txs).get('loisirs')!.net).toBe(-60);
  });

  // The case a refund link cannot express: a gambling payout is not a refund
  // of any one stake, so it carries the flag instead of a target expense.
  it('subtracts income that says it came back on the category', () => {
    const txs = [
      tx({ amount: 200, type: 'expense', transaction_date: '2026-06-01', category_id: 'loisirs' }),
      tx({ amount: 130, type: 'income', transaction_date: '2026-06-02', category_id: 'loisirs', offsets_category: true }),
    ];
    const row = computeCategoryNets(txs).get('loisirs')!;
    expect(row.gross).toBe(200);
    expect(row.offsetIncome).toBe(130);
    expect(row.net).toBe(70);
  });

  it('leaves income without the flag as earnings', () => {
    const txs = [
      tx({ amount: 200, type: 'expense', transaction_date: '2026-06-01', category_id: 'loisirs' }),
      tx({ amount: 130, type: 'income', transaction_date: '2026-06-02', category_id: 'loisirs' }),
    ];
    const row = computeCategoryNets(txs).get('loisirs')!;
    expect(row.offsetIncome).toBe(0);
    expect(row.net).toBe(200);
  });

  it('counts offsetting income net of what has been repaid', () => {
    const txs = [
      tx({ amount: 500, type: 'expense', transaction_date: '2026-06-01', category_id: 'loisirs' }),
      tx({ amount: 200, type: 'income', transaction_date: '2026-06-02', category_id: 'loisirs', offsets_category: true, repaid_amount: 150 }),
    ];
    const row = computeCategoryNets(txs).get('loisirs')!;
    expect(row.offsetIncome).toBe(50);
    expect(row.net).toBe(450);
  });

  // Belt and braces for the DB constraint: a linked refund already nets
  // through its expense, so honouring the flag too would double-count.
  it('ignores the flag on a linked refund', () => {
    const txs = [
      tx({ amount: 100, type: 'expense', transaction_date: '2026-06-01', category_id: 'loisirs', refunded_amount: 40 }),
      tx({ amount: 40, type: 'income', transaction_date: '2026-06-02', category_id: 'loisirs', offsets_category: true, refund_of_transaction_id: 'x' }),
    ];
    const row = computeCategoryNets(txs).get('loisirs')!;
    expect(row.offsetIncome).toBe(0);
    expect(row.net).toBe(60);
  });

  it('excludes offsetting income from stats but takes it off expenses', () => {
    const txs = [
      tx({ amount: 200, type: 'expense', transaction_date: '2026-06-01', category_id: 'loisirs' }),
      tx({ amount: 130, type: 'income', transaction_date: '2026-06-02', category_id: 'loisirs', offsets_category: true }),
      tx({ amount: 1000, type: 'income', transaction_date: '2026-06-03', category_id: 'salaire' }),
    ];
    const stats = computePeriodStats(txs);
    expect(stats.income).toBe(1000);
    expect(stats.expenses).toBe(70);
    expect(stats.net).toBe(930);
  });
});

describe('periodContribution', () => {
  const D = '2026-06-10';
  const role = (t: EngineTx) => periodContribution(t).role;

  it('routes income marked as coming back on its category to expenses, negative', () => {
    const got = periodContribution(tx({ amount: 40, type: 'income', transaction_date: D, offsets_category: true }));
    expect(got).toEqual({ role: 'expense', amount: -40 });
  });

  it('ignores rows that would double-count money already netted elsewhere', () => {
    expect(role(tx({ amount: 10, type: 'income', transaction_date: D, refund_of_transaction_id: 'x' }))).toBe('ignored');
    expect(role(tx({ amount: 10, type: 'expense', transaction_date: D, repayment_of_transaction_id: 'x' }))).toBe('ignored');
    expect(role(tx({ amount: 10, type: 'expense', transaction_date: D, include_in_stats: false }))).toBe('ignored');
    // offsets_category never beats a refund link: the expense already nets it.
    expect(role(tx({ amount: 10, type: 'income', transaction_date: D, offsets_category: true, refund_of_transaction_id: 'x' }))).toBe('ignored');
  });

  it('nets each side and takes only the fee off a transfer', () => {
    expect(periodContribution(tx({ amount: 100, type: 'expense', transaction_date: D, refunded_amount: 160 })).amount).toBe(-60);
    expect(periodContribution(tx({ amount: 100, type: 'income', transaction_date: D, repaid_amount: 100 })).amount).toBe(0);
    expect(periodContribution(tx({ amount: 500, type: 'transfer', transaction_date: D, transfer_fee: 3 }))).toEqual({ role: 'transfer_fee', amount: 3 });
  });

  it('counts a special-budget expense, unlike the category rule', () => {
    const t = tx({ amount: 25, type: 'expense', transaction_date: D, category_id: 'c1', special_budget_id: 'sb1' });
    // Money left the account, so it belongs to the period...
    expect(periodContribution(t)).toEqual({ role: 'expense', amount: 25 });
    // ...but not to the category's own envelope.
    expect(computeCategoryNets([t]).get('c1')).toBeUndefined();
  });

  it('sums to computePeriodStats over a mixed set', () => {
    const txs = [
      tx({ amount: 3000, type: 'income', transaction_date: D }),
      tx({ amount: 200, type: 'income', transaction_date: D, offsets_category: true }),
      tx({ amount: 500, type: 'expense', transaction_date: D, refunded_amount: 50 }),
      tx({ amount: 90, type: 'expense', transaction_date: D, repayment_of_transaction_id: 'x' }),
      tx({ amount: 400, type: 'transfer', transaction_date: D, transfer_fee: 2 }),
    ];
    const folded = txs.reduce(
      (acc, t) => {
        const { role, amount } = periodContribution(t);
        if (role !== 'ignored') acc[role] += amount;
        return acc;
      },
      { income: 0, expense: 0, transfer_fee: 0 } as Record<string, number>,
    );
    const stats = computePeriodStats(txs);
    expect(folded.income).toBe(stats.income);
    expect(folded.expense).toBe(stats.expenses);
    expect(folded.transfer_fee).toBe(stats.transferFees);
    expect(stats).toEqual({ income: 3000, expenses: 250, transferFees: 2, net: 2748 });
  });
});

describe('computePeriodStats', () => {
  it('applies stats rules: exclusions, refund netting, transfer fees', () => {
    const txs = [
      tx({ amount: 1000, type: 'income', transaction_date: '2026-06-01' }),
      tx({ amount: 50, type: 'income', transaction_date: '2026-06-02', refund_of_transaction_id: 'x' }), // refund → not income
      tx({ amount: 200, type: 'expense', transaction_date: '2026-06-03', refunded_amount: 50 }),          // nets to 150
      tx({ amount: 80, type: 'expense', transaction_date: '2026-06-04', refunded_amount: 100 }),          // over-refunded → -20
      tx({ amount: 30, type: 'expense', transaction_date: '2026-06-05', include_in_stats: false }),       // excluded
      tx({ amount: 500, type: 'transfer', transaction_date: '2026-06-06', transfer_fee: 2 }),             // fee only
    ];
    const r = computePeriodStats(txs);
    expect(r.income).toBe(1000);
    // 150 from the partly-refunded row, less the 20 the over-refunded row
    // gave back beyond its value.
    expect(r.expenses).toBe(130);
    expect(r.transferFees).toBe(2);
    expect(r.net).toBe(1000 - 130 - 2);
  });

  it('netExpenseAmount goes negative when more came back than went out', () => {
    // The surplus belongs to the expense's category: 100 back on 80 spent
    // leaves that category 20 cheaper, not merely free.
    expect(netExpenseAmount(tx({ amount: 80, type: 'expense', transaction_date: '2026-06-04', refunded_amount: 100 }))).toBe(-20);
    expect(netExpenseAmount(tx({ amount: 80, type: 'expense', transaction_date: '2026-06-04', refunded_amount: 80 }))).toBe(0);
    expect(netExpenseAmount(tx({ amount: 80, type: 'expense', transaction_date: '2026-06-04' }))).toBe(80);
  });

  it('a category is reduced by an over-refund rather than floored', () => {
    // The Parfum Douaa shape: 100 spent, 160 refunded, all of it linked.
    const txs = [
      tx({ amount: 672, type: 'expense', transaction_date: '2026-06-01' }),
      tx({ amount: 100, type: 'expense', transaction_date: '2026-06-02', refunded_amount: 160 }),
      tx({ amount: 160, type: 'income', transaction_date: '2026-06-03', refund_of_transaction_id: 'p', include_in_stats: false }),
    ];
    expect(computePeriodStats(txs).expenses).toBe(612);
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

describe('computeAccountDelta', () => {
  const txs = [
    tx({ amount: 100, type: 'income', transaction_date: '2026-06-05', account_id: 'A' }),
    tx({ amount: 40, type: 'expense', transaction_date: '2026-06-10', account_id: 'A' }),
    tx({ amount: 200, type: 'transfer', transaction_date: '2026-06-15', account_id: 'A', transfer_to_account_id: 'B', transfer_fee: 3 }),
    tx({ amount: 70, type: 'income', transaction_date: '2026-07-01', account_id: 'A' }), // outside window
  ];

  it('sums income/expense and the outgoing transfer leg with fee', () => {
    expect(computeAccountDelta('A', txs, PERIOD.from, PERIOD.to, 'accounting')).toBe(100 - 40 - 203);
  });

  it('credits the incoming transfer leg without the fee', () => {
    expect(computeAccountDelta('B', txs, PERIOD.from, PERIOD.to, 'accounting')).toBe(200);
  });

  it('null bounds mean unbounded', () => {
    expect(computeAccountDelta('A', txs, null, null, 'accounting')).toBe(100 - 40 - 203 + 70);
    expect(computeAccountDelta('A', txs, PERIOD.from, null, 'accounting')).toBe(100 - 40 - 203 + 70);
  });

  it('agrees with computeInitialBalance: balance − Δ(from, ∞) per account', () => {
    const accounts = [{ id: 'A', balance: 1000 }, { id: 'B', balance: 500 }];
    const viaDelta = accounts.reduce(
      (sum, a) => sum + Number(a.balance) - computeAccountDelta(a.id, txs, PERIOD.from, null, 'accounting'),
      0,
    );
    expect(viaDelta).toBeCloseTo(computeInitialBalance(accounts, txs, PERIOD.from, 'accounting'), 10);
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
