import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";

export default defineTool({
  name: "list_upcoming",
  title: "List upcoming commitments",
  description:
    "List the signed-in user's active recurring transactions and open debts, so an assistant can see what is scheduled ahead.",
  inputSchema: {
    before: z
      .string()
      .optional()
      .describe("Only recurring items due on or before this date, YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ before }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);

    let recurring = supabase
      .from("recurring_transactions")
      .select("id, description, amount, type, recurrence_type, next_due_date, account_id, category_id")
      .eq("is_active", true)
      .order("next_due_date");
    if (before) recurring = recurring.lte("next_due_date", before);

    const [{ data: rec, error: recErr }, { data: debts, error: debtErr }] = await Promise.all([
      recurring,
      supabase
        .from("debts")
        .select("id, description, type, total_amount, remaining_amount, end_date, contact_name")
        .eq("status", "active"),
    ]);
    if (recErr) return fail(recErr.message);
    if (debtErr) return fail(debtErr.message);

    return ok({ recurring: rec ?? [], debts: debts ?? [] });
  },
});
