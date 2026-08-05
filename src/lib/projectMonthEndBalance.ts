import { addMonths, addQuarters, addWeeks, addYears, endOfMonth } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import {
  getRecurringDisplayAmount,
  getRecurringEffectiveType,
} from "@/lib/recurringAmount";
import type { RecurringTransaction } from "@/hooks/useFinancialData";
import type { InstallmentPayment } from "@/hooks/useInstallmentPayments";
import type { Debt } from "@/hooks/useDebts";

interface ScheduledDebtPayment {
  debt_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  is_paid: boolean | null;
}

function advanceDate(date: Date, recurrenceType: RecurringTransaction["recurrence_type"]): Date {
  switch (recurrenceType) {
    case "weekly":
      return addWeeks(date, 1);
    case "monthly":
      return addMonths(date, 1);
    case "quarterly":
      return addQuarters(date, 1);
    case "yearly":
      return addYears(date, 1);
    default:
      return addMonths(date, 1);
  }
}

export interface RecurringWindowTotals {
  /** Income-side occurrences, positive. */
  income: number;
  /** Expense-side occurrences, positive. */
  expense: number;
  /** income − expense. */
  net: number;
  /** How many occurrences fell in the window. */
  occurrences: number;
  /** How many distinct active recurrences contributed at least one. */
  rules: number;
}

/**
 * Walks every active recurrence's occurrences falling in `[start, end]` and
 * totals them by side.
 *
 * This is the single rule for "what is scheduled to happen between these two
 * dates": the month-end projection, the Scheduled page's summary strip and
 * anything else asking that question all fold the same walk, so two surfaces
 * can never quote different figures for the same window.
 *
 * Honours the effective-amount rules the rest of the app uses
 * (installment_amount / scheduled_debt_payment / rt.amount), and skips
 * recurrences whose underlying installment or debt is already settled.
 *
 * Only ever looks forward: it starts from `next_due_date`, so occurrences
 * earlier in a period that have already been paid are not counted.
 */
export function sumRecurringWindow(
  recurringTransactions: RecurringTransaction[],
  installmentPayments: InstallmentPayment[],
  debts: Debt[],
  scheduledDebtPayments: ScheduledDebtPayment[],
  start: Date,
  end: Date
): RecurringWindowTotals {
  const empty: RecurringWindowTotals = { income: 0, expense: 0, net: 0, occurrences: 0, rules: 0 };
  if (start > end) return empty;

  let income = 0;
  let expense = 0;
  let occurrences = 0;
  let rules = 0;

  for (const rt of recurringTransactions) {
    if (!rt.is_active) continue;
    if (!rt.next_due_date) continue;

    // Skip a recurrence whose underlying installment is already done.
    if (rt.installment_payment_id) {
      const ip = installmentPayments.find((p) => p.id === rt.installment_payment_id);
      if (!ip || !ip.is_active || ip.remaining_amount <= 0) continue;
    }
    // Skip a recurrence whose underlying debt is settled.
    if (rt.debt_id) {
      const debt = debts.find((d) => d.id === rt.debt_id);
      if (!debt || debt.status === "completed" || debt.remaining_amount <= 0) continue;
    }

    const endLimit = rt.end_date ? parseLocalDate(rt.end_date) : null;
    let cursor = parseLocalDate(rt.next_due_date);
    cursor.setHours(0, 0, 0, 0);

    const cap = 100; // a month's worth of weekly is ~5; cap is generous safety
    let n = 0;
    let contributed = false;
    while (cursor <= end && n < cap) {
      if (endLimit && cursor > endLimit) break;
      if (cursor >= start) {
        const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        const amt = getRecurringDisplayAmount(
          rt,
          dateStr,
          installmentPayments,
          debts,
          scheduledDebtPayments
        );
        const effectiveType = getRecurringEffectiveType(rt, installmentPayments);
        if (effectiveType === "income") income += amt;
        else expense += amt;
        occurrences++;
        contributed = true;
      }
      cursor = advanceDate(cursor, rt.recurrence_type);
      n++;
    }
    if (contributed) rules++;
  }

  return { income, expense, net: income - expense, occurrences, rules };
}

/**
 * Sum of signed *future* recurring transaction occurrences from `today`
 * (inclusive) through end-of-month. Income contributes positively, expense
 * negatively.
 *
 * Add this delta to the current balance to get a projected EOM balance.
 */
export function projectMonthEndDelta(
  recurringTransactions: RecurringTransaction[],
  installmentPayments: InstallmentPayment[],
  debts: Debt[],
  scheduledDebtPayments: ScheduledDebtPayment[],
  today: Date
): number {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return sumRecurringWindow(
    recurringTransactions,
    installmentPayments,
    debts,
    scheduledDebtPayments,
    start,
    endOfMonth(start)
  ).net;
}
