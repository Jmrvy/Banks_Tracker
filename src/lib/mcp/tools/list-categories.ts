import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";

export default defineTool({
  name: "list_categories",
  title: "List categories",
  description:
    "List the signed-in user's spending categories and their optional monthly budget.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("categories")
      .select("id, name, color, budget")
      .order("name");
    if (error) return fail(error.message);
    return ok({ categories: data ?? [] });
  },
});
