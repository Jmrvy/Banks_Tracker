import { describe, it, expect } from 'vitest';
import { endOfMonth } from 'date-fns';
import { effectiveMonthsBetween, resolvePeriodRange, priorPeriodRange } from './periodUtils';

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h);

describe('resolvePeriodRange', () => {
  it('month covers the full calendar month of the anchor', () => {
    const r = resolvePeriodRange('month', d(2026, 6, 15));
    expect(r.from).toEqual(d(2026, 6, 1));
    expect(r.to.getDate()).toBe(30);
    expect(r.to.getHours()).toBe(23);
  });

  it('quarter and year cover their calendar units', () => {
    const q = resolvePeriodRange('quarter', d(2026, 5, 15));
    expect(q.from).toEqual(d(2026, 4, 1));
    expect(q.to.getMonth()).toBe(5); // June
    const y = resolvePeriodRange('year', d(2026, 5, 15));
    expect(y.from).toEqual(d(2026, 1, 1));
    expect(y.to.getMonth()).toBe(11);
  });

  it('custom normalizes noon-anchored picker dates to whole days', () => {
    const r = resolvePeriodRange('custom', d(2026, 1, 1), { from: d(2026, 6, 10, 12), to: d(2026, 6, 20, 12) });
    expect(r.from).toEqual(d(2026, 6, 10));
    expect(r.to.getDate()).toBe(20);
    expect(r.to.getHours()).toBe(23);
  });
});

describe('priorPeriodRange', () => {
  it('month steps back one calendar month (not a fixed day span)', () => {
    const cur = resolvePeriodRange('month', d(2026, 7, 15)); // July (31 days)
    const prev = priorPeriodRange('month', cur);
    expect(prev.from).toEqual(d(2026, 6, 1)); // June (30 days) — calendar-aware
    expect(prev.to.getDate()).toBe(30);
  });

  it('year steps back one calendar year', () => {
    const cur = resolvePeriodRange('year', d(2026, 6, 15));
    const prev = priorPeriodRange('year', cur);
    expect(prev.from).toEqual(d(2025, 1, 1));
    expect(prev.to.getFullYear()).toBe(2025);
  });

  it('custom shifts back by its own day span, ending the day before', () => {
    const cur = resolvePeriodRange('custom', d(2026, 1, 1), { from: d(2026, 6, 10), to: d(2026, 6, 19) }); // 10 days
    const prev = priorPeriodRange('custom', cur);
    expect(prev.to.getDate()).toBe(9);   // June 9, end of day
    expect(prev.to.getHours()).toBe(23);
    expect(prev.from).toEqual(d(2026, 5, 31)); // 10-day span: May 31 → June 9
  });
});

describe('effectiveMonthsBetween', () => {
  it('counts a full calendar year as 12, including a leap year', () => {
    expect(effectiveMonthsBetween(d(2026, 1, 1), endOfMonth(d(2026, 12, 1)))).toBe(12);
    expect(effectiveMonthsBetween(d(2024, 1, 1), endOfMonth(d(2024, 12, 1)))).toBe(12);
  });

  it('counts a full month as 1', () => {
    expect(effectiveMonthsBetween(d(2026, 1, 1), endOfMonth(d(2026, 1, 1)))).toBe(1);
    expect(effectiveMonthsBetween(d(2024, 2, 1), endOfMonth(d(2024, 2, 1)))).toBe(1);
  });

  it('weights a stub by the share of the month it covers', () => {
    // 15 January through 31 January 2026 is 17 of 31 days.
    expect(effectiveMonthsBetween(d(2026, 1, 15), endOfMonth(d(2026, 1, 1)))).toBeCloseTo(17 / 31);
  });

  it('adds each month’s share across a boundary', () => {
    // 15 January through 14 February 2026: 17/31 + 14/28.
    expect(effectiveMonthsBetween(d(2026, 1, 15), d(2026, 2, 14, 23))).toBeCloseTo(17 / 31 + 14 / 28);
  });

  it('is zero when the range is empty or reversed', () => {
    expect(effectiveMonthsBetween(d(2026, 2, 1), d(2026, 1, 1))).toBe(0);
    expect(effectiveMonthsBetween(d(2026, 1, 15), d(2026, 1, 15))).toBe(0);
  });
});
