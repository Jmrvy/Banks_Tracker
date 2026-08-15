import { describe, expect, it } from "vitest";
import {
  forEachFutureCharge,
  paymentsLeft,
  type ScheduleContext,
} from "./scheduledCharges";
import type { RecurringTransaction } from "@/hooks/useFinancialData";
import type { Debt, ScheduledDebtPayment } from "@/hooks/useDebts";
import type {
  InstallmentPayment,
  InstallmentPaymentRecord,
} from "@/hooks/useInstallmentPayments";

const CAT = { id: "cat-1", name: "Abonnements", color: "#c66" };

const rule = (over: Partial<RecurringTransaction> = {}): RecurringTransaction =>
  ({
    id: "rt-1",
    user_id: "u",
    account_id: "a",
    category_id: CAT.id,
    description: "Salle de sport",
    amount: 40,
    type: "expense",
    recurrence_type: "monthly",
    start_date: "2026-01-10",
    end_date: null,
    next_due_date: "2026-09-10",
    is_active: true,
    account: null,
    category: CAT,
    installment_payment_id: null,
    debt_id: null,
    created_at: "",
    updated_at: "",
    ...over,
  }) as RecurringTransaction;

const plan = (over: Partial<InstallmentPayment> = {}): InstallmentPayment =>
  ({
    id: "ip-1",
    user_id: "u",
    description: "Canapé",
    total_amount: 900,
    remaining_amount: 300,
    installment_amount: 100,
    frequency: "monthly",
    start_date: "2026-03-01",
    next_payment_date: "2026-09-10",
    end_date: null,
    account_id: "a",
    category_id: CAT.id,
    is_active: true,
    payment_type: "payment",
    created_at: "",
    updated_at: "",
    ...over,
  }) as InstallmentPayment;

const debt = (over: Partial<Debt> = {}): Debt =>
  ({
    id: "d-1",
    user_id: "u",
    description: "Prêt auto",
    type: "loan_received",
    total_amount: 6000,
    remaining_amount: 600,
    interest_rate: 2,
    start_date: "2025-01-01",
    end_date: null,
    status: "active",
    contact_name: null,
    contact_info: null,
    notes: null,
    payment_frequency: "monthly",
    payment_amount: 200,
    loan_type: null,
    category_id: CAT.id,
    created_at: "",
    updated_at: "",
    ...over,
  }) as Debt;

const record = (
  over: Partial<InstallmentPaymentRecord> & { scheduled_date: string },
): InstallmentPaymentRecord =>
  ({
    id: `r-${over.scheduled_date}`,
    installment_payment_id: "ip-1",
    user_id: "u",
    scheduled_amount: 35.28,
    is_paid: false,
    paid_date: null,
    actual_amount: null,
    transaction_id: null,
    ...over,
  }) as InstallmentPaymentRecord;

const ctx = (over: Partial<ScheduleContext> = {}): ScheduleContext => ({
  recurringTransactions: [],
  installmentPayments: [],
  debts: [],
  scheduledDebtPayments: [],
  ...over,
});

/** Every charge the walker emits in the window, in order. */
function collect(c: ScheduleContext, from: Date, to: Date) {
  const out: { categoryId: string; date: string; amount: number }[] = [];
  forEachFutureCharge(c, from, to, (categoryId, date, amount) =>
    out.push({
      categoryId,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      amount,
    }),
  );
  return out;
}

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};

describe("forEachFutureCharge", () => {
  it("walks a monthly rule across the window, inclusive of both ends", () => {
    const got = collect(
      ctx({ recurringTransactions: [rule()] }),
      d("2026-09-01"),
      d("2026-11-30"),
    );
    expect(got.map((g) => g.date)).toEqual(["2026-09-10", "2026-10-10", "2026-11-10"]);
    expect(got.every((g) => g.amount === 40)).toBe(true);
    expect(got.every((g) => g.categoryId === CAT.id)).toBe(true);
  });

  it("emits nothing before `from`, so a mid-month start skips what is already paid", () => {
    const got = collect(
      ctx({ recurringTransactions: [rule()] }),
      d("2026-09-15"),
      d("2026-10-31"),
    );
    expect(got.map((g) => g.date)).toEqual(["2026-10-10"]);
  });

  it("returns nothing when the window is inverted", () => {
    expect(collect(ctx({ recurringTransactions: [rule()] }), d("2026-11-01"), d("2026-09-01")))
      .toEqual([]);
  });

  it("skips inactive rules, income, and rules with no category", () => {
    const got = collect(
      ctx({
        recurringTransactions: [
          rule({ id: "a", is_active: false }),
          rule({ id: "b", type: "income" }),
          rule({ id: "c", category: null, category_id: null }),
        ],
      }),
      d("2026-09-01"),
      d("2026-12-31"),
    );
    expect(got).toEqual([]);
  });

  it("stops at the rule's own end_date", () => {
    const got = collect(
      ctx({ recurringTransactions: [rule({ end_date: "2026-10-31" })] }),
      d("2026-09-01"),
      d("2026-12-31"),
    );
    expect(got.map((g) => g.date)).toEqual(["2026-09-10", "2026-10-10"]);
  });

  describe("instalment plans", () => {
    it("charges the plan's instalment, not the rule's amount", () => {
      const got = collect(
        ctx({
          recurringTransactions: [rule({ amount: 40, installment_payment_id: "ip-1" })],
          installmentPayments: [plan()],
        }),
        d("2026-09-01"),
        d("2026-09-30"),
      );
      expect(got).toEqual([{ categoryId: CAT.id, date: "2026-09-10", amount: 100 }]);
    });

    it("stops once the remaining balance is used up", () => {
      // 300 remaining at 100 a month is three more charges, whatever the
      // window asks for.
      const got = collect(
        ctx({
          recurringTransactions: [rule({ installment_payment_id: "ip-1" })],
          installmentPayments: [plan({ remaining_amount: 300, installment_amount: 100 })],
        }),
        d("2026-09-01"),
        d("2027-06-30"),
      );
      expect(got.map((g) => g.date)).toEqual(["2026-09-10", "2026-10-10", "2026-11-10"]);
    });

    it("emits nothing for a settled or deactivated plan", () => {
      const settled = collect(
        ctx({
          recurringTransactions: [rule({ installment_payment_id: "ip-1" })],
          installmentPayments: [plan({ remaining_amount: 0 })],
        }),
        d("2026-09-01"),
        d("2027-06-30"),
      );
      expect(settled).toEqual([]);

      const off = collect(
        ctx({
          recurringTransactions: [rule({ installment_payment_id: "ip-1" })],
          installmentPayments: [plan({ is_active: false })],
        }),
        d("2026-09-01"),
        d("2027-06-30"),
      );
      expect(off).toEqual([]);
    });

    it("counts a reimbursement plan's charges even though the rule says income", () => {
      // Reimbursement rules were once stored as income and every materialiser
      // has overridden that since; a plan-linked rule is a charge whatever
      // `type` claims.
      const got = collect(
        ctx({
          recurringTransactions: [
            rule({ type: "income", installment_payment_id: "ip-1" }),
          ],
          installmentPayments: [plan({ payment_type: "reimbursement" })],
        }),
        d("2026-09-01"),
        d("2026-09-30"),
      );
      expect(got).toEqual([{ categoryId: CAT.id, date: "2026-09-10", amount: 100 }]);
    });
  });

  describe("debts", () => {
    it("prefers the scheduled amount for that month over the rule's", () => {
      const got = collect(
        ctx({
          recurringTransactions: [rule({ amount: 40, debt_id: "d-1" })],
          debts: [debt()],
          scheduledDebtPayments: [
            {
              id: "sp-1",
              debt_id: "d-1",
              scheduled_date: "2026-09-10",
              scheduled_amount: 187.5,
              principal_amount: 180,
              interest_amount: 7.5,
              insurance_amount: 0,
              is_paid: false,
              paid_date: null,
              actual_amount: null,
            } as ScheduledDebtPayment,
          ],
        }),
        d("2026-09-01"),
        d("2026-09-30"),
      );
      expect(got).toEqual([{ categoryId: CAT.id, date: "2026-09-10", amount: 187.5 }]);
    });

    it("falls back to the debt's payment amount when no schedule row covers the month", () => {
      const got = collect(
        ctx({
          recurringTransactions: [rule({ amount: 40, debt_id: "d-1" })],
          debts: [debt({ payment_amount: 200, remaining_amount: 600 })],
        }),
        d("2026-09-01"),
        d("2026-09-30"),
      );
      expect(got).toEqual([{ categoryId: CAT.id, date: "2026-09-10", amount: 200 }]);
    });

    it("stops once the debt is repaid, and emits nothing for a completed one", () => {
      const running = collect(
        ctx({
          recurringTransactions: [rule({ debt_id: "d-1" })],
          debts: [debt({ payment_amount: 200, remaining_amount: 600 })],
        }),
        d("2026-09-01"),
        d("2027-06-30"),
      );
      expect(running).toHaveLength(3);

      const done = collect(
        ctx({
          recurringTransactions: [rule({ debt_id: "d-1" })],
          debts: [debt({ status: "completed" })],
        }),
        d("2026-09-01"),
        d("2027-06-30"),
      );
      expect(done).toEqual([]);
    });

    it("counts unpaid schedule rows rather than dividing the balance", () => {
      const rows: ScheduledDebtPayment[] = [1, 2, 3, 4, 5].map((i) => ({
        id: `sp-${i}`,
        debt_id: "d-1",
        scheduled_date: `2026-${String(8 + i).padStart(2, "0")}-10`,
        scheduled_amount: 120,
        principal_amount: 120,
        interest_amount: 0,
        insurance_amount: 0,
        is_paid: false,
        paid_date: null,
        actual_amount: null,
      })) as ScheduledDebtPayment[];

      const got = collect(
        ctx({
          recurringTransactions: [rule({ debt_id: "d-1" })],
          // The balance alone would say three payments of 200; the schedule
          // says five of 120, and the schedule is the record.
          debts: [debt({ payment_amount: 200, remaining_amount: 600 })],
          scheduledDebtPayments: rows,
        }),
        d("2026-09-01"),
        d("2027-06-30"),
      );
      expect(got).toHaveLength(5);
      expect(got.every((g) => g.amount === 120)).toBe(true);
    });
  });

  it("advances weekly, quarterly and yearly rules by their own step", () => {
    const step = (recurrence: RecurringTransaction["recurrence_type"], to: string) =>
      collect(
        ctx({ recurringTransactions: [rule({ recurrence_type: recurrence })] }),
        d("2026-09-01"),
        d(to),
      ).map((g) => g.date);

    expect(step("weekly", "2026-10-01")).toEqual([
      "2026-09-10",
      "2026-09-17",
      "2026-09-24",
      "2026-10-01",
    ]);
    expect(step("quarterly", "2027-03-31")).toEqual([
      "2026-09-10",
      "2026-12-10",
      "2027-03-10",
    ]);
    expect(step("yearly", "2028-12-31")).toEqual(["2026-09-10", "2027-09-10", "2028-09-10"]);
  });

  it("keeps each category's charges separate", () => {
    const other = { id: "cat-2", name: "Transport", color: "#69c" };
    const got = collect(
      ctx({
        recurringTransactions: [
          rule({ id: "a", amount: 40 }),
          rule({ id: "b", amount: 75, category: other, category_id: other.id }),
        ],
      }),
      d("2026-09-01"),
      d("2026-09-30"),
    );
    expect(got).toEqual([
      { categoryId: CAT.id, date: "2026-09-10", amount: 40 },
      { categoryId: other.id, date: "2026-09-10", amount: 75 },
    ]);
  });

  describe("a plan that has a schedule", () => {
    // The live plan this was found on: 105,85 € over three instalments bills
    // 35,28 twice and 35,29 once. Two are paid.
    const zalando = [
      record({ scheduled_date: "2026-07-08", scheduled_amount: 35.28, is_paid: true }),
      record({ scheduled_date: "2026-08-08", scheduled_amount: 35.28, is_paid: true }),
      record({ scheduled_date: "2026-09-08", scheduled_amount: 35.29 }),
    ];
    const withSchedule = ctx({
      recurringTransactions: [
        rule({ amount: 35.28, installment_payment_id: "ip-1", next_due_date: "2026-09-08" }),
      ],
      installmentPayments: [
        plan({ total_amount: 105.85, remaining_amount: 35.28999999999999, installment_amount: 35.28 }),
      ],
      installmentRecords: zalando,
    });

    it("bills the unpaid rows and no more", () => {
      // Without the schedule this emitted two charges — `remaining` is a
      // cent above the instalment, so the balance division rounded up — and
      // the category was billed a fourth time for a three-instalment plan.
      const got = collect(withSchedule, d("2026-08-15"), d("2027-06-30"));
      expect(got).toEqual([{ categoryId: CAT.id, date: "2026-09-08", amount: 35.29 }]);
    });

    it("bills the scheduled amount, not the nominal instalment", () => {
      const got = collect(withSchedule, d("2026-08-15"), d("2027-06-30"));
      expect(got[0].amount).toBe(35.29);
    });

    it("never re-bills a paid row, whatever the window", () => {
      const got = collect(withSchedule, d("2026-01-01"), d("2027-06-30"));
      expect(got.map((g) => g.date)).toEqual(["2026-09-08"]);
    });

    it("keeps the rows on their own dates rather than stepping the rule", () => {
      // A custom schedule need not be evenly spaced; walking `next_due_date`
      // by the recurrence would invent regular dates it does not have.
      const got = collect(
        ctx({
          recurringTransactions: [
            rule({ installment_payment_id: "ip-1", next_due_date: "2026-09-08" }),
          ],
          installmentPayments: [plan({ remaining_amount: 120, installment_amount: 40 })],
          installmentRecords: [
            record({ scheduled_date: "2026-09-08", scheduled_amount: 40 }),
            record({ scheduled_date: "2026-09-30", scheduled_amount: 40 }),
            record({ scheduled_date: "2026-12-24", scheduled_amount: 40 }),
          ],
        }),
        d("2026-08-15"),
        d("2027-06-30"),
      );
      expect(got.map((g) => g.date)).toEqual(["2026-09-08", "2026-09-30", "2026-12-24"]);
    });

    it("emits nothing once every row is paid", () => {
      const got = collect(
        ctx({
          recurringTransactions: [rule({ installment_payment_id: "ip-1" })],
          installmentPayments: [plan()],
          installmentRecords: zalando.map((r) => ({ ...r, is_paid: true })),
        }),
        d("2026-08-15"),
        d("2027-06-30"),
      );
      expect(got).toEqual([]);
    });

    it("falls back to the balance when the plan has no rows of its own", () => {
      const got = collect(
        ctx({
          recurringTransactions: [rule({ installment_payment_id: "ip-1" })],
          installmentPayments: [plan({ remaining_amount: 300, installment_amount: 100 })],
          // Rows exist, but for a different plan.
          installmentRecords: [
            record({ scheduled_date: "2026-09-01", installment_payment_id: "ip-other" }),
          ],
        }),
        d("2026-09-01"),
        d("2027-06-30"),
      );
      expect(got).toHaveLength(3);
    });
  });
});

describe("paymentsLeft", () => {
  it("does not promote a rounding tail into another payment", () => {
    // Both live plans that produced the phantom charge.
    expect(paymentsLeft(35.28999999999999, 35.28)).toBe(1);
    expect(paymentsLeft(102.19999999999999, 102.19)).toBe(1);
  });

  it("absorbs a large final remainder into the last payment", () => {
    // 289 € at 24 €: twelve payments, the last of 25. With nine full ones
    // billed the remaining 217 is nine payments, not ten.
    expect(paymentsLeft(217, 24)).toBe(9);
    expect(paymentsLeft(476, 40)).toBe(12);
  });

  it("counts exact multiples exactly", () => {
    expect(paymentsLeft(135, 45)).toBe(3);
    expect(paymentsLeft(813.15, 62.55)).toBe(13);
    expect(paymentsLeft(822.7099999999998, 205.68)).toBe(4);
  });

  it("still owes one payment for a balance smaller than one", () => {
    expect(paymentsLeft(12, 40)).toBe(1);
  });

  it("owes nothing on a settled or nonsensical plan", () => {
    expect(paymentsLeft(0, 40)).toBe(0);
    expect(paymentsLeft(-5, 40)).toBe(0);
    expect(paymentsLeft(100, 0)).toBe(0);
  });

  it("rounds up once the tail is more than half a payment", () => {
    expect(paymentsLeft(60, 40)).toBe(2);
    expect(paymentsLeft(59, 40)).toBe(1);
  });
});
