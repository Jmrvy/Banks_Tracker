import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";
import { valueAccount } from "../accountValue";

export default defineTool({
  name: "list_accounts",
  title: "List accounts",
  description:
    "List the signed-in user's bank accounts and currency subaccounts with type, bank and balance; `balance` is always in euros, a subaccount also gives its own-currency balance and average rate.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("accounts")
      .select("id, name, bank, account_type, balance, currency, parent_account_id, fx_rate, initial_fx_rate")
      .order("name");
    if (error) return fail(error.message);
    const accounts = (data ?? []).map((a) => {
      const v = valueAccount(a);
      return {
        id: a.id,
        name: a.name,
        bank: a.bank,
        account_type: a.account_type,
        // Base currency (EUR). A parent's balance excludes its subaccounts.
        balance: v.base_balance,
        ...(a.currency
          ? {
              subaccount_of: a.parent_account_id,
              currency: a.currency,
              native_balance: v.native_balance,
              average_rate: v.avg_rate,
            }
          : {}),
      };
    });
    const total = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
    return ok({ accounts, total_balance: Math.round(total * 100) / 100 });
  },
});
