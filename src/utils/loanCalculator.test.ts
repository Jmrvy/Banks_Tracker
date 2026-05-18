import { describe, it, expect } from "vitest";
import { calculateLoanWithFrequency } from "./loanCalculator";

describe("calculateLoanWithFrequency", () => {
  it("returns zeros for non-positive duration or principal", () => {
    expect(calculateLoanWithFrequency(0, 5, 12, "monthly", "amortizable")).toEqual({
      monthlyPayment: 0,
      totalInterest: 0,
      totalAmount: 0,
      schedule: [],
    });
    const zeroDuration = calculateLoanWithFrequency(10000, 5, 0, "monthly", "amortizable");
    expect(zeroDuration.schedule).toHaveLength(0);
    expect(zeroDuration.totalAmount).toBe(10000);
  });

  it("amortizes a 0% loan into equal principal-only payments", () => {
    const r = calculateLoanWithFrequency(12000, 0, 12, "monthly", "amortizable");
    expect(r.schedule).toHaveLength(12);
    expect(r.monthlyPayment).toBe(1000);
    expect(r.totalInterest).toBe(0);
    expect(r.totalAmount).toBe(12000);
    expect(r.schedule[11].remainingBalance).toBe(0);
  });

  it("fully amortizes an interest-bearing loan to a zero balance", () => {
    const r = calculateLoanWithFrequency(10000, 6, 12, "monthly", "amortizable");
    expect(r.schedule).toHaveLength(12);
    expect(r.monthlyPayment).toBeGreaterThan(0);
    expect(r.totalInterest).toBeGreaterThan(0);
    // Last installment must clear the balance exactly.
    expect(r.schedule[11].remainingBalance).toBe(0);
    // Principal repaid across the schedule equals the borrowed amount.
    const principalRepaid = r.schedule.reduce((s, p) => s + p.principal, 0);
    expect(principalRepaid).toBeCloseTo(10000, 2);
    // totalAmount = principal + totalInterest
    expect(r.totalAmount).toBeCloseTo(10000 + r.totalInterest, 2);
  });

  it("handles a bullet loan: interest-only until a final balloon payment", () => {
    const r = calculateLoanWithFrequency(10000, 6, 12, "monthly", "bullet");
    expect(r.schedule).toHaveLength(12);
    expect(r.monthlyPayment).toBe(50); // 10000 * (6/100/12)
    expect(r.totalInterest).toBe(600); // 50 * 12
    // Only the final period repays principal.
    expect(r.schedule.slice(0, 11).every((p) => p.principal === 0)).toBe(true);
    expect(r.schedule[11].principal).toBe(10000);
    expect(r.schedule[11].payment).toBe(10050);
    expect(r.schedule[11].remainingBalance).toBe(0);
  });

  it("collapses payment count for non-monthly frequencies", () => {
    const r = calculateLoanWithFrequency(12000, 6, 12, "quarterly", "amortizable");
    expect(r.schedule).toHaveLength(4); // ceil(12 / 3)
    expect(r.schedule[3].remainingBalance).toBe(0);
  });

  it("clamps month-end start dates instead of overflowing", () => {
    const start = new Date(2024, 0, 31); // 31 Jan 2024 (leap year)
    const r = calculateLoanWithFrequency(12000, 0, 2, "monthly", "amortizable", start);
    // 31 Jan + 1 month must clamp to 29 Feb 2024, not roll into March.
    expect(r.schedule[0].date.getMonth()).toBe(1); // February
    expect(r.schedule[0].date.getDate()).toBe(29);
  });
});
