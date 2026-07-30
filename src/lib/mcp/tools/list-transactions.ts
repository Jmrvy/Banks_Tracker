import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";

export default defineTool({
  name: "list_transactions",
  title: "List transactions",
  description:
    "List the signed-in user's transactions, optionally filtered by date range, type, account, category or description text.",
  inputSchema: {
    from: z.string().optional().describe("Inclusive start date, YYYY-MM-DD."),
    to: z.string().optional().describe("Inclusive end date, YYYY-MM-DD."),
    type: z.enum(["income", "expense", "transfer"]).optional(),
    account_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    search: z.string().optional().describe("Case-insensitive match on the description."),
    limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    let q = supabaseForUser(ctx)
      .from("transactions")
      .select(
        "id, description, amount, type, transaction_date, value_date, account_id, category_id, refunded_amount, include_in_stats",
      )
      .order("transaction_date", { ascending: false })
      .limit(input.limit ?? 50);

    if (input.from) q = q.gte("transaction_date", input.from);
    if (input.to) q = q.lte("transaction_date", input.to);
    if (input.type) q = q.eq("type", input.type);
    if (input.account_id) q = q.eq("account_id", input.account_id);
    if (input.category_id) q = q.eq("category_id", input.category_id);
    if (input.search) q = q.ilike("description", `%${input.search}%`);

    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ count: data?.length ?? 0, transactions: data ?? [] });
  },
});
