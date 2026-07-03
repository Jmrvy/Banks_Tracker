import { startOfDay, endOfDay } from 'date-fns';

export type TxDateType = 'accounting' | 'value';

/** Parse a date-only string (YYYY-MM-DD, or an ISO datetime whose date part
 *  we want) as LOCAL midnight — never UTC, so the calendar day is stable in
 *  every timezone. */
export const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Single source of truth for "which date does this transaction live on?".
 *  Accounting → transaction_date; value → value_date with fallback to
 *  transaction_date when no value date was recorded. */
export const getTxDate = (
  t: { transaction_date: string; value_date?: string | null },
  dateType: TxDateType,
): Date =>
  parseLocalDate(
    dateType === 'value' ? t.value_date || t.transaction_date : t.transaction_date,
  );

/** Normalize a period to whole calendar days. Date pickers anchor picked
 *  days at 12:00 noon (timezone-serialization guard), while transaction
 *  dates parse to local midnight — without this, every transaction on the
 *  period's first day is silently excluded (midnight < noon). */
export const normalizePeriod = <T extends { from: Date; to: Date }>(period: T): T => ({
  ...period,
  from: startOfDay(period.from),
  to: endOfDay(period.to),
});
