import { RecurringTransaction } from "@/hooks/useFinancialData";
import { InstallmentPayment } from "@/hooks/useInstallmentPayments";
import { Debt } from "@/hooks/useDebts";

interface ScheduledDebtPayment {
  debt_id: string;
  scheduled_date: string;
  scheduled_amount: number;
  is_paid: boolean | null;
}

/**
 * Resolves the linked debt for a recurring transaction.
 * Matches by debt_id (preferred) or falls back to description pattern.
 */
export function resolveDebtForRecurring(
  rt: RecurringTransaction,
  debts: Debt[]
): Debt | null {
  if (rt.debt_id) return debts.find(d => d.id === rt.debt_id) || null;
  if (
    rt.description.includes('(Remboursement dette)') ||
    rt.description.includes('(Remboursement prêt)')
  ) {
    for (const d of debts) {
      const suffixReceived = `${d.description} (Remboursement dette)`;
      const suffixGiven = `${d.description} (Remboursement prêt)`;
      if (rt.description === suffixReceived || rt.description === suffixGiven) return d;
    }
  }
  return null;
}

/**
 * Computes the effective amount to display for a recurring transaction on a given date.
 * Mirrors the RecurringCalendar logic so Dashboard/QuickPreview/Reports are consistent.
 *
 * - Installment-linked: uses ip.installment_amount
 * - Debt-linked: uses scheduled_debt_payments.scheduled_amount for that month if available,
 *                else falls back to debt.payment_amount
 * - Regular: uses rt.amount
 */
export function getRecurringDisplayAmount(
  rt: RecurringTransaction,
  occurrenceDate: string, // YYYY-MM-DD
  installmentPayments: InstallmentPayment[],
  debts: Debt[],
  scheduledDebtPayments: ScheduledDebtPayment[]
): number {
  // Installment-linked
  if (rt.installment_payment_id) {
    const ip = installmentPayments.find(p => p.id === rt.installment_payment_id);
    if (ip) return ip.installment_amount;
  }

  // Debt-linked
  const debt = resolveDebtForRecurring(rt, debts);
  if (debt) {
    const monthKey = occurrenceDate.substring(0, 7);
    const scheduled = scheduledDebtPayments.find(
      sp => sp.debt_id === debt.id && sp.scheduled_date.substring(0, 7) === monthKey
    );
    if (scheduled) return scheduled.scheduled_amount;
    if (debt.payment_amount > 0) return debt.payment_amount;
  }

  return Number(rt.amount);
}

/**
 * Returns the effective type (income/expense) for a recurring transaction.
 * Installment reimbursements (type=income in DB) are treated as expenses
 * because they represent money going into savings/repayment.
 */
export function getRecurringEffectiveType(
  rt: RecurringTransaction,
  installmentPayments: InstallmentPayment[]
): 'income' | 'expense' {
  if (rt.installment_payment_id) {
    const ip = installmentPayments.find(p => p.id === rt.installment_payment_id);
    if (ip?.payment_type === 'reimbursement') return 'expense';
  }
  return rt.type;
}
