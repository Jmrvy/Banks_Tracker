import { addMonths, addQuarters, addWeeks, addYears } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { resolveDebtForRecurring } from "@/lib/recurringAmount";
import type { RecurringTransaction } from "@/hooks/useFinancialData";
import type { Debt, ScheduledDebtPayment } from "@/hooks/useDebts";
import type { InstallmentPayment } from "@/hooks/useInstallmentPayments";

export interface ScheduleContext {
  recurringTransactions: RecurringTransaction[];
  installmentPayments: InstallmentPayment[];
  debts: Debt[];
  scheduledDebtPayments: ScheduledDebtPayment[];
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
      if (ip) {
        if (!ip.is_active || ip.installment_amount <= 0) {
          const stop = new Date(nextDue.getTime() - 86400000);
          if (!effectiveEnd || stop < effectiveEnd) effectiveEnd = stop;
        } else {
          const maxFuture = Math.max(
            0,
            Math.ceil(ip.remaining_amount / ip.installment_amount)
          );
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
              : debt.payment_amount > 0
              ? Math.max(0, Math.ceil(debt.remaining_amount / debt.payment_amount))
              : 0;
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
