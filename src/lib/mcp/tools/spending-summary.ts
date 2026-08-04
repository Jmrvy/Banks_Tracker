import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";
import { periodContribution, type EngineTx } from "../../reportsEngine";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default defineTool({
  name: "spending_summary",
  title: "Spending summary",
  description:
    "Summarize income, expenses and net flow over a date range, broken down by category. " +
    "Expenses are net of refunds and of income the user marked as having come back on a " +
    "category; income is net of anything repaid against it. Advance settlements and refund " +
    "rows are excluded — they would otherwise count the same money twice. Nothing further " +
    "should be subtracted from these figures.",
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
        .select(
          "amount, type, category_id, refunded_amount, repaid_amount, include_in_stats, " +
            "refund_of_transaction_id, repayment_of_transaction_id, offsets_category, transfer_fee",
        )
        .gte("transaction_date", from)
        .lte("transaction_date", to),
      supabase.from("categories").select("id, name"),
    ]);
    if (error) return fail(error.message);

    const names = new Map((cats ?? []).map((c) => [c.id, c.name]));
    let income = 0;
    let expenses = 0;
    let transferFees = 0;
    const byCategory = new Map<string, number>();

    for (const raw of (tx ?? []) as EngineTx[]) {
      // The one place `include_excluded` bites: the shared rule always drops
      // rows flagged out of statistics, so opting them back in means handing
      // it a row that says it counts.
      const t = include_excluded ? { ...raw, include_in_stats: true } : raw;
      const { role, amount } = periodContribution(t);
      if (role === "ignored") continue;

      if (role === "income") income += amount;
      else if (role === "transfer_fee") transferFees += amount;
      else {
        // `amount` is negative for income that came back on its category,
        // which is what makes it reduce the category rather than inflate it.
        expenses += amount;
        const key = t.category_id ? (names.get(t.category_id) ?? "Unknown") : "Uncategorized";
        byCategory.set(key, (byCategory.get(key) ?? 0) + amount);
      }
    }

    return ok({
      period: { from, to },
      income: round2(income),
      expenses: round2(expenses),
      transfer_fees: round2(transferFees),
      net: round2(income - expenses - transferFees),
      by_category: [...byCategory.entries()]
        .map(([category, amount]) => ({ category, amount: round2(amount) }))
        .sort((a, b) => b.amount - a.amount),
    });
  },
});
