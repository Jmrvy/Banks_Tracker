import { describe, it, expect } from 'vitest';
import { sumRecurringWindow, projectMonthEndDelta } from './projectMonthEndBalance';
import type { RecurringTransaction } from '@/hooks/useFinancialData';

/**
 * These cover the walk behind the Scheduled page's summary strip. The strip
 * quotes four windows over this one function, so a regression here is a
 * regression in every figure on that page.
 */

const rt = (over: Partial<RecurringTransaction>): RecurringTransaction =>
  ({
    id: over.id ?? 'r1',
    user_id: 'u1',
    description: 'x',
    amount: 100,
    type: 'expense',
    recurrence_type: 'monthly',
    start_date: '2026-01-01',
    next_due_date: '2026-08-10',
    is_active: true,
    account_id: 'a1',
    ...over,
  }) as RecurringTransaction;

const AUG_4 = new Date(2026, 7, 4);

const sum = (rts: RecurringTransaction[], start: Date, end: Date) =>
  sumRecurringWindow(rts, [], [], [], start, end);

describe('sumRecurringWindow', () => {
  it('splits occurrences by side and nets them', () => {
    const out = sum(
      [
        rt({ id: 'a', amount: 1150, type: 'expense', next_due_date: '2026-08-10' }),
        rt({ id: 'b', amount: 3420, type: 'income', next_due_date: '2026-08-05' }),
      ],
      AUG_4,
      new Date(2026, 8, 4)
    );
    expect(out.expense).toBe(1150);
    expect(out.income).toBe(3420);
    expect(out.net).toBe(2270);
    expect(out.occurrences).toBe(2);
    expect(out.rules).toBe(2);
  });

  it('counts every occurrence a weekly rule makes inside the window', () => {
    const out = sum([rt({ amount: 10, recurrence_type: 'weekly', next_due_date: '2026-08-05' })], AUG_4, new Date(2026, 7, 31));
    // 5, 12, 19, 26 August
    expect(out.occurrences).toBe(4);
    expect(out.expense).toBe(40);
    // One rule contributed, four times over.
    expect(out.rules).toBe(1);
  });

  it('skips an overdue occurrence but still counts the next one', () => {
    // next_due_date sits before the window (the charge is overdue). The walk
    // advances past it, so the stale 20 July instance is NOT summed — but the
    // 20 August one falls inside the window and is. This is why the summary
    // strip counts overdue items separately: their own amount is nowhere in
    // these totals.
    const out = sum([rt({ next_due_date: '2026-07-20' })], AUG_4, new Date(2026, 7, 31));
    expect(out.occurrences).toBe(1);
    expect(out.expense).toBe(100);
  });

  it('stops at the rule end date', () => {
    const out = sum(
      [rt({ amount: 10, recurrence_type: 'weekly', next_due_date: '2026-08-05', end_date: '2026-08-13' })],
      AUG_4,
      new Date(2026, 7, 31)
    );
    // 5 and 12 only — the 19th is past end_date.
    expect(out.occurrences).toBe(2);
    expect(out.expense).toBe(20);
  });

  it('ignores inactive rules and rules with no due date', () => {
    const out = sum(
      [rt({ id: 'a', is_active: false }), rt({ id: 'b', next_due_date: null as unknown as string })],
      AUG_4,
      new Date(2026, 8, 4)
    );
    expect(out.occurrences).toBe(0);
    expect(out.rules).toBe(0);
  });

  it('returns zero for an inverted window rather than walking backwards', () => {
    const out = sum([rt({})], new Date(2026, 7, 31), AUG_4);
    expect(out).toEqual({ income: 0, expense: 0, net: 0, occurrences: 0, rules: 0 });
  });

  it('is the same rule the month-end projection folds', () => {
    const rules = [
      rt({ id: 'a', amount: 1150, type: 'expense', next_due_date: '2026-08-10' }),
      rt({ id: 'b', amount: 3420, type: 'income', next_due_date: '2026-08-05' }),
    ];
    const delta = projectMonthEndDelta(rules, [], [], [], AUG_4);
    const walked = sum(rules, AUG_4, new Date(2026, 7, 31, 23, 59));
    expect(delta).toBe(walked.net);
  });

  it('adds persisted future cash movements on their accounting date', () => {
    const delta = projectMonthEndDelta([], [], [], [], AUG_4, [
      {
        amount: 600,
        type: 'expense',
        transaction_date: '2026-08-05',
      },
      {
        amount: 50,
        type: 'income',
        transaction_date: '2026-08-06',
      },
    ]);

    expect(delta).toBe(-550);
  });

  it('does not use value date or double-count a materialised recurrence', () => {
    const rule = rt({ id: 'rent', amount: 600, next_due_date: '2026-08-05' });
    const delta = projectMonthEndDelta([rule], [], [], [], AUG_4, [
      {
        amount: 600,
        type: 'expense',
        transaction_date: '2026-08-05',
        recurring_transaction_id: 'rent',
      },
    ]);

    expect(delta).toBe(-600);
  });

  it('ignores persisted movements whose accounting date has already arrived', () => {
    const delta = projectMonthEndDelta([], [], [], [], AUG_4, [
      { amount: 600, type: 'expense', transaction_date: '2026-08-04' },
    ]);

    expect(delta).toBe(0);
  });
});
