import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";

export default defineTool({
  name: "list_accounts",
  title: "List accounts",
  description:
    "List the signed-in user's bank accounts with their type, bank and current balance.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("accounts")
      .select("id, name, bank, account_type, balance")
      .order("name");
    if (error) return fail(error.message);
    const total = (data ?? []).reduce((s, a) => s + Number(a.balance ?? 0), 0);
    return ok({ accounts: data ?? [], total_balance: Math.round(total * 100) / 100 });
  },
});
