import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";

export default defineTool({
  name: "list_savings_goals",
  title: "List savings goals",
  description:
    "List the signed-in user's savings goals with target amount, current amount and target date.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("savings_goals")
      .select("id, name, target_amount, current_amount, target_date, category")
      .order("target_date", { nullsFirst: false });
    if (error) return fail(error.message);
    return ok({ goals: data ?? [] });
  },
});
