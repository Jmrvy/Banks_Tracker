import { addMonths, addQuarters, addWeeks, addYears } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { resolveDebtForRecurring } from "@/lib/recurringAmount";
import type { RecurringTransaction } from "@/hooks/useFinancialData";
import type { Debt, ScheduledDebtPayment } from "@/hooks/useDebts";
import type { InstallmentPayment } from "@/hooks/useInstallmentPayments";

/**
 * The shape a schedule row has to have to be usable here — structurally
 * satisfied by `InstallmentPaymentRecord`, and small enough that the reports
 * hook can pass its own lightweight rows without importing the whole model.
 */
export interface InstallmentScheduleRow {
  installment_payment_id: string;
  /** `yyyy-MM-dd`. */
  scheduled_date: string;
  scheduled_amount: number;
  is_paid: boolean | null;
}

export interface ScheduleContext {
  recurringTransactions: RecurringTransaction[];
  installmentPayments: InstallmentPayment[];
  /**
   * Per-instalment rows, where a plan has them. They are the schedule — a
   * date and an amount per instalment, and a paid flag — so where they exist
   * nothing needs to be inferred from the balance.
   */
  installmentRecords?: InstallmentScheduleRow[];
  debts: Debt[];
  scheduledDebtPayments: ScheduledDebtPayment[];
}

/**
 * How many payments a balance still has in it.
 *
 * `Math.ceil(remaining / perPayment)` is the obvious answer and it is wrong,
 * because a plan's instalment is its total rounded DOWN to the cent: the
 * remainder rides on the final payment. A three-instalment plan of 105,85 €
 * bills 35,28 twice and 35,29 once, so after two payments `remaining` is
 * 35,29 — one cent more than an instalment — and `ceil` reports two payments
 * left. The budget then counted a fourth charge on a plan that has three.
 *
 * Rounding is the model that matches how the plans are actually built: the
 * tail is absorbed by the last payment, never promoted into its own. It
 * reads every live plan correctly, including the 289 € / 24 € one whose last
 * instalment is 25 €.
 *
 * A balance smaller than one payment is still one payment, not zero.
 */
export function paymentsLeft(remaining: number, perPayment: number): number {
  if (!(remaining > 0) || !(perPayment > 0)) return 0;
  return Math.max(1, Math.round(remaining / perPayment));
}

/**
 * The instalments a plan has still to bill, oldest first — its unpaid rows
 * when it has a schedule, otherwise null to say "infer it from the balance".
 */
export function unpaidInstallments(
  planId: string,
  records: InstallmentScheduleRow[] | undefined,
): InstallmentScheduleRow[] | null {
  if (!records?.length) return null;
  const mine = records.filter((r) => r.installment_payment_id === planId);
  if (!mine.length) return null;
  return mine
    .filter((r) => !r.is_paid)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
}

/**
 * How far a rule is advanced by one occurrence. Anything unrecognised is
 * treated as monthly, which is what the page has always assumed.
 */
export function advanceDate(
  date: Date,
  recurrenceType: RecurringTransaction["recurrence_type"],
): Date {
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

/**
 * Every charge the active schedules will raise between two dates, category
 * by category.
 *
 * Working out what is still to come is the fiddliest reasoning the budget
 * makes: a rule's own `end_date` is only one of the things that can stop it,
 * and an instalment plan or a debt can cut it short — or, once settled, mean
 * it should never have fired again at all. That logic lived inline in the
 * period projection, which made it unavailable to anything else and
 * untestable besides; the per-category monthly chart needs the same answer
 * over calendar months instead of the selected period, and a second copy
 * would be a second set of end-date rules to keep in step.
 *
 * So it is a walker: give it a window, it emits `(categoryId, date, amount)`
 * for each occurrence inside it. Callers decide how to bucket.
 *
 * `from` is taken as given rather than clamped to today — the current month's
 * forecast starts at today, while a future month's starts at its 1st.
 */
export function forEachFutureCharge(
  ctx: ScheduleContext,
  from: Date,
  to: Date,
  emit: (categoryId: string, date: Date, amount: number) => void,
): void {
  if (to < from) return;

  const installmentMap = new Map(ctx.installmentPayments.map((ip) => [ip.id, ip]));
  const sdpByDebtMonth = new Map<string, number>();
  for (const sp of ctx.scheduledDebtPayments) {
    sdpByDebtMonth.set(`${sp.debt_id}:${sp.scheduled_date.substring(0, 7)}`, sp.scheduled_amount);
  }

  const effectiveAmount = (rt: RecurringTransaction, dateStr: string): number => {
    const debt = resolveDebtForRecurring(rt, ctx.debts);
    if (debt) {
      const monthKey = dateStr.substring(0, 7);
      const scheduled = sdpByDebtMonth.get(`${debt.id}:${monthKey}`);
      if (scheduled !== undefined) return scheduled;
      const nextUnpaid = ctx.scheduledDebtPayments.find(
        (sp) => sp.debt_id === debt.id && !sp.is_paid
      );
      if (nextUnpaid) return nextUnpaid.scheduled_amount;
      return debt.payment_amount > 0 ? debt.payment_amount : Number(rt.amount);
    }
    if (rt.installment_payment_id) {
      const ip = installmentMap.get(rt.installment_payment_id);
      if (ip && ip.installment_amount > 0) return ip.installment_amount;
    }
    return Number(rt.amount);
  };

  // An instalment-linked rule is a charge on its category whatever `type`
  // says. Reimbursement plans were once written as income and every
  // materialiser has overridden that ever since, so the stored value cannot
  // be trusted on rows old enough to predate the cleanup.
  const isExpenseForBudget = (rt: RecurringTransaction): boolean => {
    if (rt.type === "expense") return true;
    if (rt.installment_payment_id && rt.type === "income") return true;
    return false;
  };

  for (const rt of ctx.recurringTransactions) {
    if (!rt.is_active) continue;
    if (!isExpenseForBudget(rt)) continue;
    if (!rt.category?.id) continue;
    if (!rt.start_date || !rt.next_due_date) continue;

    const endDate = rt.end_date ? parseLocalDate(rt.end_date) : null;
    let effectiveEnd: Date | null = endDate;
    const nextDue = parseLocalDate(rt.next_due_date);

    if (rt.installment_payment_id) {
      const ip = installmentMap.get(rt.installment_payment_id);

      // A plan with rows needs no walking at all: the unpaid rows say what
      // is left, on what date, for how much. Walking the rule instead
      // rebuilt all three by inference and got each of them wrong on a plan
      // whose instalments are not identical — the wrong count, the nominal
      // amount rather than the scheduled one, and dates stepped from
      // `next_due_date` rather than the ones the schedule holds.
      const scheduled = ip?.is_active
        ? unpaidInstallments(rt.installment_payment_id, ctx.installmentRecords)
        : null;
      if (scheduled) {
        for (const r of scheduled) {
          const due = parseLocalDate(r.scheduled_date);
          if (due < from || due > to) continue;
          if (effectiveEnd && due > effectiveEnd) continue;
          emit(rt.category.id, due, Number(r.scheduled_amount));
        }
        continue;
      }

      if (ip) {
        if (!ip.is_active || ip.installment_amount <= 0) {
          const stop = new Date(nextDue.getTime() - 86400000);
          if (!effectiveEnd || stop < effectiveEnd) effectiveEnd = stop;
        } else {
          const maxFuture = paymentsLeft(ip.remaining_amount, ip.installment_amount);
          if (maxFuture <= 0) {
            const stop = new Date(nextDue.getTime() - 86400000);
            if (!effectiveEnd || stop < effectiveEnd) effectiveEnd = stop;
          } else {
            let last = new Date(nextDue);
            for (let i = 1; i < maxFuture; i++) {
              last = advanceDate(last, rt.recurrence_type);
            }
            if (!effectiveEnd || last < effectiveEnd) effectiveEnd = last;
          }
        }
      }
    }

    {
      const debt = resolveDebtForRecurring(rt, ctx.debts);
      if (debt) {
        if (debt.status === "completed") {
          const stop = new Date(nextDue.getTime() - 86400000);
          if (!effectiveEnd || stop < effectiveEnd) effectiveEnd = stop;
        } else {
          const unpaidCount = ctx.scheduledDebtPayments.filter(
            (sp) => sp.debt_id === debt.id && !sp.is_paid
          ).length;
          const maxFuture =
            unpaidCount > 0
              ? unpaidCount
              : paymentsLeft(debt.remaining_amount, debt.payment_amount);
          if (maxFuture <= 0) {
            const stop = new Date(nextDue.getTime() - 86400000);
            if (!effectiveEnd || stop < effectiveEnd) effectiveEnd = stop;
          } else {
            let last = new Date(nextDue);
            for (let i = 1; i < maxFuture; i++) {
              last = advanceDate(last, rt.recurrence_type);
            }
            if (!effectiveEnd || last < effectiveEnd) effectiveEnd = last;
          }
        }
      }
    }

    let cursor = new Date(nextDue);
    cursor.setHours(0, 0, 0, 0);
    const cap = 500;
    let n = 0;
    while (cursor <= to && n < cap) {
      if (effectiveEnd && cursor > effectiveEnd) break;
      if (cursor >= from) {
        const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        emit(rt.category.id, new Date(cursor), effectiveAmount(rt, dateStr));
      }
      cursor = advanceDate(cursor, rt.recurrence_type);
      n++;
    }
  }
}

/**
 * The date a plan's schedule runs out — its last unpaid row — or null when
 * it has no schedule to read.
 *
 * For callers that bound a walk by an end date rather than emitting the rows
 * themselves. Bounding on this is what stops the walk running one occurrence
 * past the end of a plan whose final instalment carries the rounding.
 */
export function lastScheduledInstallment(
  planId: string,
  records: InstallmentScheduleRow[] | undefined,
): string | null {
  const unpaid = unpaidInstallments(planId, records);
  return unpaid?.length ? unpaid[unpaid.length - 1].scheduled_date : null;
}
