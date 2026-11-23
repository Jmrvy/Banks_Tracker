import { describe, expect, it } from "vitest";
import { valueAccount } from "./accountValue";
import { totalBase, valueAccount as serverValue } from "../../../supabase/functions/_shared/accountValue";

describe("subaccount valuation for agents, Trace and the email", () => {
  it("values 100 GBP held at an average of 1.27 as 127 EUR", () => {
    expect(valueAccount({ balance: 100, currency: "GBP", fx_rate: 1.27 }).base_balance).toBe(127);
    expect(serverValue({ id: "s", name: "GBP", balance: 100, currency: "GBP", fx_rate: 1.27 }).base_balance).toBe(127);
  });

  it("never counts a subaccount with no usable rate as euros", () => {
    expect(valueAccount({ balance: 100, currency: "GBP", fx_rate: null, initial_fx_rate: 0 }).base_balance).toBeNull();
  });

  it("falls back to the opening rate when no average is stored yet", () => {
    expect(valueAccount({ balance: 30, currency: "GBP", fx_rate: null, initial_fx_rate: 1.2 }).base_balance).toBe(36);
  });

  it("adds a main account and its GBP subaccount in euros, not pounds", () => {
    const total = totalBase([
      { id: "m", name: "CB Ultra", balance: 500 },
      { id: "s", name: "GBP", balance: 100, currency: "GBP", parent_account_id: "m", fx_rate: 1.27 },
    ]);
    expect(total).toBe(627);
  });
});
