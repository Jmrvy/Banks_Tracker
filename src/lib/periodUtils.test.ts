import { describe, it, expect } from 'vitest';
import { resolvePeriodRange, priorPeriodRange } from './periodUtils';

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
