import { useSyncExternalStore } from "react";

// Shared "current month" between RecurringCalendar (writer) and
// RecurringMonthlySummary (reader) so the KPI tile in "Réel" mode
// reconciles with the calendar's footer totals.
let currentMonth: Date = new Date();
const listeners = new Set<() => void>();

export function setRecurringCurrentMonth(d: Date) {
  if (
    d.getFullYear() === currentMonth.getFullYear() &&
    d.getMonth() === currentMonth.getMonth()
  ) {
    return;
  }
  currentMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  return currentMonth;
}

export function useRecurringCurrentMonth(): Date {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
