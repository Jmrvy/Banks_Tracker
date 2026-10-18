import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, fail, ok } from "../supabase";
import { headlineExpenseLine, periodContributions, type EngineTx } from "../../reportsEngine";
import { ledgerDateColumn } from "../dateColumn";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default defineTool({
  name: "spending_summary",
  title: "Spending summary",
  description:
    "Summarize income, expenses and net flow over a date range, broken down by category. " +
    "Expenses are net of refunds, of income the user marked as having come back on a " +
    "category, and of a transfer marked as money put back on one. A transfer's fee still " +
    "counts. Income is net of anything repaid against it. Advance settlements and refund " +
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

    const dateColumn = await ledgerDateColumn(supabase);
    const COLUMNS =
      "amount, type, category_id, special_budget_id, refunded_amount, repaid_amount, include_in_stats, " +
      "refund_of_transaction_id, repayment_of_transaction_id, offsets_category, transfer_fee";

    // Paged, and ordered so the paging is stable. This read had neither: an
    // unbounded select is capped server-side at ~1000 rows, and with no
    // ORDER BY the rows that survive are whichever the planner emitted
    // first. A range holding more than a page of transactions therefore
    // returned confident totals built from an arbitrary subset — different
    // numbers each run, while the tool description told the model to take
    // the figures as final. A summary has to see every row or say nothing.
    const PAGE = 1000;
    const page = (offset: number) =>
      supabase
        .from("transactions")
        .select(COLUMNS, offset === 0 ? { count: "exact" } : undefined)
        .gte(dateColumn, from)
        .lte(dateColumn, to)
        .order(dateColumn, { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);

    const [first, { data: cats, error: catsError }, { data: budgets, error: budgetsError }] = await Promise.all([
      page(0),
      supabase.from("categories").select("id, name"),
      supabase.from("special_budgets").select("id, name"),
    ]);
    if (first.error) return fail(first.error.message);
    if (catsError) return fail(catsError.message);
    if (budgetsError) return fail(budgetsError.message);

    const tx = [...(first.data ?? [])];
    const total = first.count ?? tx.length;
    for (let offset = tx.length; tx.length < total && offset < total; offset = tx.length) {
      const next = await page(offset);
      if (next.error) return fail(next.error.message);
      if (!next.data?.length) break;
      tx.push(...next.data);
    }

    const names = new Map((cats ?? []).map((c) => [c.id, c.name]));
    const budgetNames = new Map((budgets ?? []).map((b) => [b.id, b.name]));
    let income = 0;
    let expenses = 0;
    let transferFees = 0;
    const byCategory = new Map<string, number>();

    // Through `unknown`: PostgREST types a select's rows as a union with its
    // error shape, which shares no members with EngineTx, so a direct
    // assertion is rejected. The rows are real here — `first.error` returned
    // above, and every page's error is checked before it is pushed.
    for (const raw of tx as unknown as EngineTx[]) {
      // The one place `include_excluded` bites: the shared rule always drops
      // rows flagged out of statistics, so opting them back in means handing
      // it a row that says it counts.
      const t = include_excluded ? { ...raw, include_in_stats: true } : raw;
      for (const { role, amount } of periodContributions(t)) {
        if (role === "income") income += amount;
        else if (role === "transfer_fee") transferFees += amount;
        else {
          // `amount` is negative for money that came back on its category
          // (marked income, or a transfer marked as put back), which is what
          // makes it reduce the category rather than inflate it.
          expenses += amount;
          const categoryLabel = t.category_id ? (names.get(t.category_id) ?? "Unknown") : "Uncategorized";
          const key = headlineExpenseLine(
            t,
            categoryLabel,
            t.special_budget_id ? budgetNames.get(t.special_budget_id) : undefined,
            "Special budget",
          );
          byCategory.set(key, (byCategory.get(key) ?? 0) + amount);
        }
      }
    }

    return ok({
      period: { from, to, date_column: dateColumn },
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
