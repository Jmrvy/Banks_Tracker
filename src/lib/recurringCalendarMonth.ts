import { useSyncExternalStore } from "react";

// Shared state between RecurringCalendar (writer) and consumers like
// RecurringMonthlySummary so KPI tiles reconcile with the calendar.
export interface RecurringCalendarSnapshot {
  month: Date;
  actualOutflow: number;
  actualInflow: number;
}

let snapshot: RecurringCalendarSnapshot = {
  month: new Date(),
  actualOutflow: 0,
  actualInflow: 0,
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
