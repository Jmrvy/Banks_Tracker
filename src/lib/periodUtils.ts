import {
  startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter,
  startOfYear, endOfYear,
  subMonths, subQuarters, subYears,
  addDays, differenceInDays,
} from 'date-fns';
import { normalizePeriod } from './dateUtils';

/* ────────────────────────────────────────────────────────────────────
 * Shared period construction
 *
 * One implementation of "which date range does this period type cover"
 * and "what is the prior comparable period", used by the Reports hook,
 * the report wizard and the PDF builder. Keeping these in one place is
 * what guarantees the on-screen comparison and the exported document
 * agree on what "previous period" means.
 * ──────────────────────────────────────────────────────────────────── */

export type PeriodType = 'month' | 'quarter' | 'year' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
}

/** Date range covered by a period type. `anchor` is any date inside the
 *  month/quarter/year; `custom` supplies explicit bounds (normalized to
 *  whole days, so noon-anchored picker dates can't drop boundary days). */
export function resolvePeriodRange(
  type: PeriodType,
  anchor: Date,
  custom?: DateRange,
): DateRange {
  switch (type) {
    case 'month':
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case 'quarter':
      return { from: startOfQuarter(anchor), to: endOfQuarter(anchor) };
    case 'year':
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
    case 'custom':
      return normalizePeriod(custom ?? { from: startOfMonth(anchor), to: endOfMonth(anchor) });
  }
}

/** Prior comparable period: calendar unit steps back one unit
 *  (month→previous calendar month, etc.); custom shifts back by its own
 *  day span. Calendar-aware on purpose — a millisecond-span shift
 *  misaligns with calendar months and is DST-fragile. */
export function priorPeriodRange(type: PeriodType, range: DateRange): DateRange {
  switch (type) {
    case 'month': {
      const ref = subMonths(range.from, 1);
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    }
    case 'quarter': {
      const ref = subQuarters(range.from, 1);
      return { from: startOfQuarter(ref), to: endOfQuarter(ref) };
    }
    case 'year': {
      const ref = subYears(range.from, 1);
      return { from: startOfYear(ref), to: endOfYear(ref) };
    }
    case 'custom': {
      const days = differenceInDays(range.to, range.from) + 1;
      const to = addDays(range.from, -1);
      return normalizePeriod({ from: addDays(to, -(days - 1)), to });
    }
  }
}
