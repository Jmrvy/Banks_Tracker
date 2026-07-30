import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default defineTool({
  name: "spending_summary",
  title: "Spending summary",
  description:
    "Summarize income, expenses and net flow over a date range, broken down by category. Amounts are net of refunds.",
  inputSchema: {
    from: z.string().describe("Inclusive start date, YYYY-MM-DD."),
    to: z.string().describe("Inclusive end date, YYYY-MM-DD."),
    include_excluded: z
      .boolean()
      .optional()
      .describe("Include transactions flagged as excluded from statistics. Default false."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, include_excluded }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);

    const [{ data: tx, error }, { data: cats }] = await Promise.all([
      supabase
        .from("transactions")
        .select("amount, type, category_id, refunded_amount, include_in_stats")
        .gte("transaction_date", from)
        .lte("transaction_date", to),
      supabase.from("categories").select("id, name"),
    ]);
    if (error) return fail(error.message);

    const names = new Map((cats ?? []).map((c) => [c.id, c.name]));
    let income = 0;
    let expenses = 0;
    const byCategory = new Map<string, number>();

    for (const t of tx ?? []) {
      if (!include_excluded && t.include_in_stats === false) continue;
      const net = Math.max(0, Number(t.amount ?? 0) - Number(t.refunded_amount ?? 0));
      if (t.type === "income") income += net;
      else if (t.type === "expense") {
        expenses += net;
        const key = t.category_id ? (names.get(t.category_id) ?? "Unknown") : "Uncategorized";
        byCategory.set(key, (byCategory.get(key) ?? 0) + net);
      }
    }

    return ok({
      period: { from, to },
      income: round2(income),
      expenses: round2(expenses),
      net: round2(income - expenses),
      by_category: [...byCategory.entries()]
        .map(([category, amount]) => ({ category, amount: round2(amount) }))
        .sort((a, b) => b.amount - a.amount),
    });
  },
});
