import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";
import { ledgerDateColumn } from "../dateColumn";

/** An embedded account's currency; the generated types model the embed as a list. */
const currencyOf = (x: unknown): string | null => {
  const row = (Array.isArray(x) ? x[0] : x) as { currency?: string | null } | null | undefined;
  return row?.currency ?? null;
};

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
    const supabase = supabaseForUser(ctx);
    const dateColumn = await ledgerDateColumn(supabase);
    let q = supabase
      .from("transactions")
      .select(
        "id, description, amount, foreign_amount, type, transaction_date, value_date, account_id, transfer_to_account_id, category_id, refunded_amount, include_in_stats, account:accounts!transactions_account_id_fkey(currency), transfer_to:accounts!transactions_transfer_to_account_id_fkey(currency)",
      )
      .order(dateColumn, { ascending: false })
      .limit(input.limit ?? 50);

    if (input.from) q = q.gte(dateColumn, input.from);
    if (input.to) q = q.lte(dateColumn, input.to);
    if (input.type) q = q.eq("type", input.type);
    if (input.account_id) q = q.eq("account_id", input.account_id);
    if (input.category_id) q = q.eq("category_id", input.category_id);
    if (input.search) q = q.ilike("description", `%${input.search}%`);

    const { data, error } = await q;
    if (error) return fail(error.message);
    // `amount` is always euros (what every statistic uses); a row on a
    // currency subaccount also carries its own-currency figure.
    const transactions = (data ?? []).map(({ account, transfer_to, foreign_amount, ...t }) => {
      const currency = foreign_amount == null ? null : currencyOf(account) ?? currencyOf(transfer_to);
      return currency ? { ...t, foreign_amount: Number(foreign_amount), foreign_currency: currency } : t;
    });
    return ok({ count: transactions.length, transactions });
  },
});
