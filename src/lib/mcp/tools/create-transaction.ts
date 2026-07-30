import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";

export default defineTool({
  name: "create_transaction",
  title: "Create transaction",
  description:
    "Record a new income or expense transaction on one of the signed-in user's accounts.",
  inputSchema: {
    account_id: z.string().uuid().describe("Target account, from list_accounts."),
    amount: z.number().positive().describe("Positive amount in the account currency."),
    type: z.enum(["income", "expense"]),
    description: z.string().trim().min(1).max(255),
    transaction_date: z
      .string()
      .describe("Accounting date, YYYY-MM-DD."),
    value_date: z
      .string()
      .optional()
      .describe("Value date, YYYY-MM-DD. Defaults to the accounting date."),
    category_id: z.string().uuid().optional().describe("Category, from list_categories."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("transactions")
      .insert({
        user_id: ctx.getUserId(),
        account_id: input.account_id,
        amount: input.amount,
        type: input.type,
        description: input.description,
        transaction_date: input.transaction_date,
        value_date: input.value_date ?? input.transaction_date,
        category_id: input.category_id ?? null,
      })
      .select("id, description, amount, type, transaction_date, category_id")
      .single();
    if (error) return fail(error.message);
    return ok({ transaction: data });
  },
});
