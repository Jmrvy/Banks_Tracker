import { describe, it, expect } from 'vitest';
import { isWithinInterval } from 'date-fns';
import { parseLocalDate, getTxDate, normalizePeriod } from './dateUtils';

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD as local midnight (never UTC)', () => {
    const d = parseLocalDate('2026-03-11');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(0);
  });

  it('takes the date part of ISO datetime strings', () => {
    const d = parseLocalDate('2026-03-11T10:30:00Z');
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(0);
  });
});

describe('getTxDate', () => {
  const tx = { transaction_date: '2026-01-31', value_date: '2026-02-02' };

  it('uses transaction_date in accounting mode', () => {
    expect(getTxDate(tx, 'accounting').getDate()).toBe(31);
    expect(getTxDate(tx, 'accounting').getMonth()).toBe(0);
  });

  it('uses value_date in value mode', () => {
    expect(getTxDate(tx, 'value').getDate()).toBe(2);
    expect(getTxDate(tx, 'value').getMonth()).toBe(1);
  });

  it('falls back to transaction_date when value_date is missing', () => {
    expect(getTxDate({ transaction_date: '2026-01-31' }, 'value').getDate()).toBe(31);
    expect(getTxDate({ transaction_date: '2026-01-31', value_date: null }, 'value').getDate()).toBe(31);
  });
});

describe('normalizePeriod', () => {
  it('expands noon-anchored picker dates to whole days', () => {
    const p = normalizePeriod({
      from: new Date(2026, 5, 10, 12, 0, 0, 0), // pickers anchor at noon
      to: new Date(2026, 5, 20, 12, 0, 0, 0),
    });
    expect(p.from.getHours()).toBe(0);
    expect(p.to.getHours()).toBe(23);
    expect(p.to.getMinutes()).toBe(59);
  });

  it('regression: a transaction on the first day of a custom period is included', () => {
    // BUG-1 from the audit: noon-anchored `from` excluded first-day txs.
    const rawPeriod = { from: new Date(2026, 5, 10, 12), to: new Date(2026, 5, 20, 12) };
    const txDate = getTxDate({ transaction_date: '2026-06-10' }, 'accounting');

    // Without normalization the transaction is dropped…
    expect(isWithinInterval(txDate, { start: rawPeriod.from, end: rawPeriod.to })).toBe(false);
    // …with normalization it is included.
    const p = normalizePeriod(rawPeriod);
    expect(isWithinInterval(txDate, { start: p.from, end: p.to })).toBe(true);
  });

  it('preserves extra fields (e.g. label)', () => {
    const p = normalizePeriod({ from: new Date(2026, 0, 1, 12), to: new Date(2026, 0, 5, 12), label: 'x' });
    expect(p.label).toBe('x');
  });
});
