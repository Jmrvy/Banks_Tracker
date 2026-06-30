import { useSyncExternalStore } from "react";

// Shared state between RecurringCalendar (writer) and consumers like
// RecurringMonthlySummary so KPI tiles reconcile with the calendar.
export interface RecurringBreakdownEntry {
  categoryId: string | null;
  amount: number;
  count: number;
}

export interface RecurringCalendarSnapshot {
  month: Date;
  actualOutflow: number;
  actualInflow: number;
  actualBreakdown: RecurringBreakdownEntry[];
  yearOutflow: number;
  yearInflow: number;
  yearOutflowCount: number;
  yearInflowCount: number;
  yearBreakdown: RecurringBreakdownEntry[];
  yearMonthsCount: number;
}

let snapshot: RecurringCalendarSnapshot = {
  month: new Date(),
  actualOutflow: 0,
  actualInflow: 0,
  actualBreakdown: [],
  yearOutflow: 0,
  yearInflow: 0,
  yearOutflowCount: 0,
  yearInflowCount: 0,
  yearBreakdown: [],
  yearMonthsCount: 12,
};
const listeners = new Set<() => void>();

export function setRecurringCurrentMonth(d: Date) {
  if (
    d.getFullYear() === snapshot.month.getFullYear() &&
    d.getMonth() === snapshot.month.getMonth()
  ) {
    return;
  }
  snapshot = { ...snapshot, month: new Date(d.getFullYear(), d.getMonth(), 1) };
  listeners.forEach((l) => l());
}

export function setRecurringActualTotals(outflow: number, inflow: number) {
  if (snapshot.actualOutflow === outflow && snapshot.actualInflow === inflow) return;
  snapshot = { ...snapshot, actualOutflow: outflow, actualInflow: inflow };
  listeners.forEach((l) => l());
}

function breakdownEqual(a: RecurringBreakdownEntry[], b: RecurringBreakdownEntry[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].categoryId !== b[i].categoryId ||
      a[i].amount !== b[i].amount ||
      a[i].count !== b[i].count
    ) return false;
  }
  return true;
}

export function setRecurringActualBreakdown(breakdown: RecurringBreakdownEntry[]) {
  if (breakdownEqual(snapshot.actualBreakdown, breakdown)) return;
  snapshot = { ...snapshot, actualBreakdown: breakdown };
  listeners.forEach((l) => l());
}

export function setRecurringYearAggregates(
  outflow: number,
  inflow: number,
  breakdown: RecurringBreakdownEntry[],
  monthsCount: number,
  outflowCount = 0,
  inflowCount = 0,
) {
  if (
    snapshot.yearOutflow === outflow &&
    snapshot.yearInflow === inflow &&
    snapshot.yearOutflowCount === outflowCount &&
    snapshot.yearInflowCount === inflowCount &&
    snapshot.yearMonthsCount === monthsCount &&
    breakdownEqual(snapshot.yearBreakdown, breakdown)
  ) return;
  snapshot = {
    ...snapshot,
    yearOutflow: outflow,
    yearInflow: inflow,
    yearOutflowCount: outflowCount,
    yearInflowCount: inflowCount,
    yearBreakdown: breakdown,
    yearMonthsCount: monthsCount,
  };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  return snapshot;
}

export function useRecurringCalendarSnapshot(): RecurringCalendarSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
