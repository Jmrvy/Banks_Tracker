/**
 * Trace — the copilot's server side.
 *
 * Reads the caller's ledger (read-only) and answers in a fixed block
 * vocabulary the client knows how to render. It never writes: a change is
 * expressed as a `proposal` block carrying machine-applicable `changes`,
 * which the *client* applies under the user's own RLS session after the
 * user confirms. That's the product's trust primitive — "reads your
 * ledger, proposes, never moves money".
 *
 * Auth: the caller's JWT identifies the user; every query below is scoped
 * to that user id. The service-role client is used only so we can run the
 * aggregate queries efficiently — never to reach another user's rows.
 *
 * Inference goes through OpenRouter, so the model is a deployment choice
 * rather than something baked into this file: set TRACE_MODEL to any
 * tool-calling slug from the OpenRouter catalogue.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { netExpenseAmount, netIncomeAmount } from "../_shared/ledgerRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Fallback model when the user hasn't picked one in Settings. Must be a
 * tool-calling model — Trace answers by *calling* the `answer` tool, and a
 * model without tool support returns prose this function can only degrade
 * into a single text block.
 */
const DEFAULT_MODEL = Deno.env.get("TRACE_MODEL") ?? "anthropic/claude-opus-4.5";

/** OpenRouter's unified reasoning control, ignored by models without it. */
const DEFAULT_REASONING_EFFORT = Deno.env.get("TRACE_REASONING_EFFORT") ?? "medium";

/**
 * Ceiling for the WHOLE invocation, not one upstream call. A question that
 * needs several tool rounds makes several calls, so bounding each one
 * individually bounds nothing: the platform's own wall clock arrives first
 * and kills the worker, and a killed worker returns a non-2xx this
 * function never gets to shape. Every call draws from this one budget.
 *
 * The platform's limit is 150s, observed rather than assumed: a 504 logged
 * at 150,087ms. This sits below it with room to write a reply. It is not a
 * target — a real multi-round answer has been seen to take 119s, so
 * trimming this to feel safer just converts slow successes into failures.
 */
const INVOCATION_BUDGET_MS = 135_000;

/** Held back from the last call so a timeout can still be reported. */
const RESPONSE_RESERVE_MS = 3_000;

/** Below this, there is no point starting another round. */
const MIN_ROUND_MS = 15_000;

// ─── block schema ──────────────────────────────────────────────────────
// The answer travels as the argument object of an `answer` tool call
// rather than through `response_format: json_schema`, because json_schema
// support on OpenRouter varies by model while tool calling is available
// on every model worth pointing Trace at. Optional fields are explicit
// nullable unions so every property can stay in `required`.
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const str = { type: "string" };
const strArr = { type: "array", items: str };

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const BLOCK_SCHEMA = {
  anyOf: [
    obj({
      t: { type: "string", enum: ["text"] },
      v: { ...str, description: "Prose. Wrap key phrases in **double asterisks** for emphasis." },
    }),
    obj({
      t: { type: "string", enum: ["figure"] },
      label: str,
      value: { ...str, description: "Pre-formatted headline figure, e.g. \"€2,714.40\"." },
      delta: nullable(obj({
        dir: { type: "string", enum: ["good", "bad", "flat"] },
        v: str,
      })),
      sub: str,
    }),
    obj({
      t: { type: "string", enum: ["table"] },
      cols: strArr,
      rows: { type: "array", items: strArr },
    }),
    obj({
      t: { type: "string", enum: ["list"] },
      items: {
        type: "array",
        items: obj({
          tone: { type: "string", enum: ["pos", "neg", "warn", "info"] },
          title: str,
          body: str,
        }),
      },
    }),
    obj({
      t: { type: "string", enum: ["forecast"] },
      rows: {
        type: "array",
        items: obj({
          k: str,
          v: str,
          tone: nullable({ type: "string", enum: ["pos", "neg"] }),
        }),
      },
      foot: obj({
        k: str,
        v: str,
        tone: nullable({ type: "string", enum: ["pos", "neg"] }),
      }),
    }),
    obj({
      t: { type: "string", enum: ["chips"] },
      label: str,
      items: {
        type: "array",
        items: obj({ name: str, amount: str, date: str }),
      },
    }),
    obj({
      t: { type: "string", enum: ["bars"] },
      months: strArr,
      series: {
        type: "array",
        items: obj({
          name: str,
          values: { type: "array", items: { type: "number" } },
        }),
      },
      note: str,
    }),
    obj({
      t: { type: "string", enum: ["method"] },
      period: str,
      filters: strArr,
      excluded: str,
      rows: { ...str, description: "How many ledger rows the answer is built on." },
    }),
    obj({
      t: { type: "string", enum: ["proposal"] },
      kind: { type: "string", enum: ["categorize", "budget"] },
      title: str,
      summary: str,
      impact: str,
      diff: obj({ cols: strArr, rows: { type: "array", items: strArr } }),
      note: nullable(str),
      primary: { ...str, description: "Label for the apply button, e.g. \"Apply 38 changes\"." },
      changes: {
        type: "array",
        description:
          "Machine-applicable edits. kind=categorize → {transaction_id, category_id}; " +
          "kind=budget → {category_id, monthly_budget}. Every id must come from a tool result.",
        items: obj({
          transaction_id: nullable(str),
          category_id: str,
          monthly_budget: nullable({ type: "number" }),
        }),
      },
    }),
  ],
};

const ANSWER_SCHEMA = obj({
  steps: {
    ...strArr,
    description: "2–4 short present-participle phrases describing what you did, e.g. \"Scanning 1,428 transactions\".",
  },
  blocks: { type: "array", items: BLOCK_SCHEMA },
});

// ─── tools ─────────────────────────────────────────────────────────────
/** Wraps a tool in OpenRouter's (OpenAI-shaped) function envelope. */
const fn = (name: string, description: string, parameters: Record<string, unknown>) => ({
  type: "function" as const,
  function: { name, description, parameters },
});

const READ_TOOLS = [
  {
    name: "search_transactions",
    description:
      "Aggregate and sample the ledger. Returns the matched count, income and expense " +
      "separately, their net, and the biggest rows with their ids. Use this before quoting " +
      "any figure. `expense` is ALREADY net of refunds, excludes advance settlements, and " +
      "has income marked as coming back on its category taken off; `income` excludes refunds " +
      "and counts advances net of what has been repaid. Take nothing further off either. " +
      "`expense` is the period figure the app shows as headline spending and it INCLUDES " +
      "special-budget rows; `expense_excluding_special_budgets` is the same spend without " +
      "them, which is what spending_by_category adds up to. Quote `expense` for \"what did I " +
      "spend\" and the excluding figure only when reconciling against category rows. " +
      "`transfer_fees` is what transfers cost — the principal moved between the user's own " +
      "accounts and is not spending.",
    parameters: obj({
      start: { ...str, description: "Inclusive ISO date (yyyy-mm-dd)." },
      end: { ...str, description: "Inclusive ISO date (yyyy-mm-dd)." },
      category_id: nullable(str),
      account_id: nullable(str),
      type: nullable({ type: "string", enum: ["income", "expense", "transfer"] }),
      text: nullable({ ...str, description: "Case-insensitive substring of the description." }),
      limit: nullable({ type: "number", description: "How many sample rows to return (default 10, max 50)." }),
    }),
  },
  {
    name: "spending_by_category",
    description:
      "Expense per category over a period, with each category's monthly budget and id. " +
      "The basis for any budget answer or budget proposal. `spent` is FINAL: refunds are " +
      "already netted into it, settlements of advances are excluded, and income the user " +
      "marked as having come back on the category is subtracted too — `charged` and " +
      "`offsetting_income` show that split. Ordinary income filed on the same category is " +
      "NOT subtracted: a category holds both directions, so a salary sharing a category " +
      "with spending stays earnings. Nothing further comes off `spent`.",
    parameters: obj({
      start: str,
      end: str,
      by_month: nullable({
        type: "boolean",
        description:
          "Also break each category down per calendar month, with months_over/months_counted " +
          "already worked out. Ask for this ONCE instead of calling this tool per month.",
      }),
    }),
  },
  {
    name: "list_uncategorized",
    description:
      "Transactions with no category, newest first, on the user's own date basis. Returns ids so " +
      "they can be proposed for categorization. Transfers are excluded, as are rows kept out of " +
      "statistics and refunds/repayments already linked to another row. INCOME is included: " +
      "`expense_count` and `income_count` split the total, and only the expenses move a budget — " +
      "never claim a budget impact for an uncategorized income row.",
    parameters: obj({ limit: nullable({ type: "number" }) }),
  },
  {
    name: "merchant_history",
    description:
      "How the user has categorized transactions whose description resembles the given text. " +
      "Use it to justify a categorize proposal — never guess a category the user has never used for that merchant.",
    parameters: obj({ text: str }),
  },
  {
    name: "scheduled_charges",
    description:
      "Recurring transactions, installment plan instalments and scheduled debt payments falling " +
      "due between two dates. Use for cash-flow and affordability questions.",
    parameters: obj({ start: str, end: str }),
  },
];

/**
 * Trace finishes by calling this. Making the answer a tool call means the
 * block vocabulary is enforced by the same mechanism as the read tools,
 * on every provider OpenRouter fronts.
 */
const ANSWER_TOOL = fn(
  "answer",
  "Deliver the finished answer. Call this exactly once, when you have everything you need. " +
    "Do not call it in the same turn as a read tool.",
  ANSWER_SCHEMA,
);

const TOOLS = [
  ...READ_TOOLS.map((t) => fn(t.name, t.description, t.parameters)),
  ANSWER_TOOL,
];

// ─── tool implementations ──────────────────────────────────────────────
/**
 * One call to OpenRouter's chat-completions endpoint.
 *
 * Deliberately `fetch` rather than the openai npm SDK. The SDK's Node
 * transport does not survive the edge runtime: every request came back as
 * an opaque `APIConnectionError: Connection error.` about two seconds in,
 * with the real cause swallowed inside it. Trace uses exactly one
 * endpoint, so the SDK bought nothing here and cost the error detail —
 * which is the whole diagnosis when a model slug, a key, or a tool schema
 * is what OpenRouter is unhappy about.
 */
async function chatCompletion(
  apiKey: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("APP_URL") ?? "https://banks-tracker.app",
        // ASCII hyphen, not the em dash used everywhere else in this file:
        // header values are ByteString, so a non-ASCII character here makes
        // `Request` throw at construction and no call is ever made.
        "X-Title": "Banks Tracker - Trace",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach OpenRouter: ${reason}`);
  }

  let body: string;
  try {
    body = await res.text();
  } catch (err) {
    // The abort signal covers the body stream, not just the handshake, and
    // a completion streams for as long as the model generates — so a slow
    // answer times out HERE, not in the fetch above. Left uncaught it
    // reached the user as a bare "Signal timed out." with nothing naming
    // the culprit.
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`OpenRouter stopped sending mid-response: ${reason}`);
  }
  if (!res.ok) {
    // OpenRouter states the refusal in the body — unknown model slug,
    // exhausted credit, a tool schema the provider would not accept.
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 400)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`OpenRouter sent malformed JSON: ${body.slice(0, 200)}`);
  }
}

type Db = ReturnType<typeof createClient>;

/** The shared rules, so Trace cannot answer a question differently from the
 *  screen the user is looking at. `netIncome` used to omit the floor these
 *  apply, which quoted a fully-repaid advance as earnings. */
const netExpense = (t: Record<string, unknown>) => netExpenseAmount(t as any);
const netIncome = (t: Record<string, unknown>) => netIncomeAmount(t as any);

async function runTool(
  db: Db,
  userId: string,
  dateColumn: "transaction_date" | "value_date",
  name: string,
  input: Record<string, any>,
): Promise<unknown> {
  switch (name) {
    case "search_transactions": {
      let q = db
        .from("transactions")
        .select("id, description, amount, refunded_amount, repaid_amount, refund_of_transaction_id, repayment_of_transaction_id, offsets_category, transfer_fee, special_budget_id, type, transaction_date, value_date, category_id, account_id, categories(name), accounts!transactions_account_id_fkey(name)")
        .eq("user_id", userId)
        .eq("include_in_stats", true)
        // Special-budget rows STAY. This tool answers period questions, and
        // the period rule counts them: that money left the account and is in
        // the Reports headline and the dashboard tile. Filtering them out
        // here — to match spending_by_category, which files them under their
        // own envelope — made Trace quote a spend lower than the figure on
        // the screen behind it. The two rules differ deliberately; the split
        // is reported below instead of being hidden in a WHERE clause.
        .gte(dateColumn, input.start)
        .lte(dateColumn, input.end);
      if (input.category_id) q = q.eq("category_id", input.category_id);
      if (input.account_id) q = q.eq("account_id", input.account_id);
      if (input.type) q = q.eq("type", input.type);
      if (input.text) q = q.ilike("description", `%${input.text}%`);
      const ROW_CAP = 2000;
      const { data, error } = await q.limit(ROW_CAP);
      if (error) throw error;
      const rows = data ?? [];
      // `amount` is stored positive whatever the direction — the sign lives in
      // `type`. Summing the column therefore adds income to expense instead of
      // netting it, which for a merchant that both charges and pays out
      // (gambling, reimbursements, resale) returns the sum of the absolute
      // values: neither the spend nor the net, and wrong in a way that reads
      // plausible. Keep the two directions apart and let the model choose.
      let income = 0;
      let expense = 0;
      let transfers = 0;
      let specialBudgetExpense = 0;
      for (const t of rows as any[]) {
        if (t.type === "expense") {
          // An expense repaying an advance settles income rather than being
          // spending; the income it repays already counts net of it.
          if (t.repayment_of_transaction_id) continue;
          expense += netExpense(t);
          if (t.special_budget_id) specialBudgetExpense += netExpense(t);
        } else if (t.type === "income") {
          // A refund is already inside the expense it refunds, via that
          // expense's refunded_amount. Counting it here as well subtracts
          // the same money twice. include_in_stats is not a safe proxy for
          // this — a linked refund can carry it true — so test the link.
          if (t.refund_of_transaction_id) continue;
          // Income that came back on its category reduces spend rather than
          // being earnings, the same way computePeriodStats treats it.
          if (t.offsets_category) expense -= netIncome(t);
          else income += netIncome(t);
        } else {
          // Only the fee leaves: a transfer moves money between the user's
          // own accounts. Summing the principal reported a movement as
          // though it were money gone.
          transfers += Number(t.transfer_fee ?? 0);
        }
      }
      const limit = Math.min(Math.max(Number(input.limit ?? 10), 1), 50);
      const sample = [...rows]
        .sort((a: any, b: any) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
        .slice(0, limit)
        .map((t: any) => ({
          id: t.id,
          date: dateColumn === "value_date" ? (t.value_date || t.transaction_date) : t.transaction_date,
          description: t.description,
          amount: t.type === "expense" ? netExpense(t) : netIncome(t),
          type: t.type,
          category: t.categories?.name ?? null,
          account: t.accounts?.name ?? null,
        }));
      const round = (n: number) => Number(n.toFixed(2));
      return {
        count: rows.length,
        // A silent cut would have the model quote a total for "everything"
        // that is really a total for the first 2000 rows.
        truncated: rows.length === ROW_CAP,
        income: round(income),
        // The period figure, matching the Reports headline.
        expense: round(expense),
        // The same spend with special-budget envelopes taken out, which is
        // what spending_by_category totals. Equal to `expense` unless a
        // special budget falls in the window.
        expense_excluding_special_budgets: round(expense - specialBudgetExpense),
        special_budget_expense: round(specialBudgetExpense),
        net: round(income - expense),
        transfer_fees: round(transfers),
        sample,
      };
    }

    case "spending_by_category": {
      const [{ data: cats, error: catErr }, { data: txs, error: txErr }] = await Promise.all([
        db.from("categories").select("id, name, budget").eq("user_id", userId),
        db
          .from("transactions")
          .select("amount, refunded_amount, repaid_amount, category_id, type, offsets_category, repayment_of_transaction_id, refund_of_transaction_id, transaction_date, value_date")
          .eq("user_id", userId)
          .in("type", ["expense", "income"])
          .eq("include_in_stats", true)
          .is("special_budget_id", null)
          .gte(dateColumn, input.start)
          .lte(dateColumn, input.end)
          .limit(5000),
      ]);
      if (catErr) throw catErr;
      if (txErr) throw txErr;
      const spent = new Map<string, { total: number; count: number; offset: number }>();
      const blank = () => ({ total: 0, count: 0, offset: 0 });
      // category id -> month -> net. Built in the same pass as the totals, so
      // a per-month figure can never disagree with the total above it.
      const perMonth = new Map<string, Map<string, number>>();
      const monthsSeen = new Set<string>();
      const bump = (key: string, t: any, delta: number) => {
        const d = dateColumn === "value_date" ? (t.value_date || t.transaction_date) : t.transaction_date;
        if (!d) return;
        const m = String(d).slice(0, 7);
        monthsSeen.add(m);
        const row = perMonth.get(key) ?? new Map<string, number>();
        row.set(m, (row.get(m) ?? 0) + delta);
        perMonth.set(key, row);
      };
      for (const t of txs ?? []) {
        const key = (t as any).category_id;
        if (!key) continue;
        if ((t as any).type === "expense") {
          // Settling an advance is not spending against a budget.
          if ((t as any).repayment_of_transaction_id) continue;
          const cur = spent.get(key) ?? blank();
          cur.total += netExpense(t as any);
          cur.count += 1;
          spent.set(key, cur);
          bump(key, t, netExpense(t as any));
        } else {
          // Only income the user marked as having come back on this category.
          // A linked refund is already inside the expense's refunded_amount,
          // so honouring both would subtract the same money twice.
          if (!(t as any).offsets_category) continue;
          if ((t as any).refund_of_transaction_id) continue;
          const cur = spent.get(key) ?? blank();
          cur.offset += netIncome(t as any);
          spent.set(key, cur);
          bump(key, t, -netIncome(t as any));
        }
      }

      const months = [...monthsSeen].sort();
      return (cats ?? []).map((c: any) => {
        const row = spent.get(c.id) ?? blank();
        const cap = c.budget === null ? null : Number(c.budget);
        const base = {
          category_id: c.id,
          name: c.name,
          monthly_budget: cap,
          // Already net of refunds AND of income marked as coming back on
          // this category. Nothing further comes off it.
          spent: Number((row.total - row.offset).toFixed(2)),
          charged: Number(row.total.toFixed(2)),
          offsetting_income: Number(row.offset.toFixed(2)),
          transactions: row.count,
        };
        if (!input.by_month) return base;
        // The shape a budget answer actually needs: whether a category is
        // over in nearly every month (a cap set wrong) or in one (an
        // overspend). Counted here so the model reads a verdict instead of
        // reconstructing it from six separate tool calls — which is what
        // exhausted the tool-round budget before it could answer at all.
        const by = perMonth.get(c.id) ?? new Map<string, number>();
        const by_month: Record<string, number> = {};
        for (const m of months) by_month[m] = Number((by.get(m) ?? 0).toFixed(2));
        return {
          ...base,
          by_month,
          months_counted: months.length,
          months_over: cap === null ? null : months.filter((m) => (by.get(m) ?? 0) > cap).length,
        };
      });
    }

    case "list_uncategorized": {
      const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
      const { data, error } = await db
        .from("transactions")
        // value_date too: this tool used to order by and report
        // transaction_date whatever date basis the user works in, so it
        // quoted dates the app does not show for the same row.
        .select("id, description, amount, transaction_date, value_date, type, accounts!transactions_account_id_fkey(name)")
        .eq("user_id", userId)
        .is("category_id", null)
        .neq("type", "transfer")
        // Rows out of the statistics are not spending and a category would
        // not change that.
        .eq("include_in_stats", true)
        // A linked refund or repayment takes its side from the row it is
        // attached to; proposing a category for one is busywork that moves
        // no budget.
        .is("refund_of_transaction_id", null)
        .is("repayment_of_transaction_id", null)
        .order(dateColumn, { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (data ?? []).map((t: any) => ({
        id: t.id,
        date: dateColumn === "value_date" ? (t.value_date || t.transaction_date) : t.transaction_date,
        description: t.description,
        amount: Number(t.amount),
        type: t.type,
        account: t.accounts?.name ?? null,
      }));
      // Split it out. The radar card on the Trace page counts uncategorized
      // EXPENSES only, because it is a budget card; this tool returns income
      // as well, since an unfiled salary is worth catching too. Returning
      // both counts lets an answer agree with the number on the screen it
      // was launched from instead of quietly contradicting it.
      return {
        count: rows.length,
        expense_count: rows.filter((r) => r.type === "expense").length,
        income_count: rows.filter((r) => r.type === "income").length,
        truncated: rows.length === limit,
        transactions: rows,
      };
    }

    case "merchant_history": {
      // Match on the longest alphabetic run in the query — card descriptors
      // carry noise ("CB 1234 MONOPRIX PARIS 12") that defeats a whole-string
      // match but not a token match.
      const token = String(input.text ?? "")
        .split(/[^\p{L}]+/u)
        .filter((w) => w.length >= 4)
        .sort((a, b) => b.length - a.length)[0] ?? String(input.text ?? "");
      const { data, error } = await db
        .from("transactions")
        .select("description, category_id, categories(name)")
        .eq("user_id", userId)
        .not("category_id", "is", null)
        .ilike("description", `%${token}%`)
        .limit(200);
      if (error) throw error;
      const tally = new Map<string, { category_id: string; name: string; count: number }>();
      for (const t of data ?? []) {
        const id = (t as any).category_id as string;
        const cur = tally.get(id) ?? { category_id: id, name: (t as any).categories?.name ?? "", count: 0 };
        cur.count += 1;
        tally.set(id, cur);
      }
      const matches = [...tally.values()].sort((a, b) => b.count - a.count);
      const total = matches.reduce((s, m) => s + m.count, 0);
      return {
        token,
        total_matched: total,
        categories: matches.map((m) => ({
          ...m,
          share: total ? Math.round((m.count / total) * 100) : 0,
        })),
      };
    }

    case "scheduled_charges": {
      const [recurring, installments, debtPayments] = await Promise.all([
        db
          .from("recurring_transactions")
          // category_id so a budget answer can tell a charge the user does
          // not decide row by row from discretionary spending.
          .select("description, amount, type, recurrence_type, next_due_date, end_date, category_id, categories(name)")
          .eq("user_id", userId)
          .eq("is_active", true)
          // The window was never applied here, so every active rule came
          // back whatever dates were asked for — a rule next due in two
          // years counted as due this month.
          .lte("next_due_date", input.end),
        db
          .from("installment_payment_records")
          // scheduled_amount/scheduled_date, not amount/payment_date. The
          // table was rebuilt with these names and this query was never
          // updated, so PostgREST answered 42703 and — sharing one error
          // check with the other two legs — took the whole tool down with
          // it. Every affordability question got "Query failed" instead of
          // the schedule.
          .select("scheduled_amount, actual_amount, scheduled_date, is_paid, installment_payments(description)")
          .eq("user_id", userId)
          .eq("is_paid", false)
          .gte("scheduled_date", input.start)
          .lte("scheduled_date", input.end),
        db
          .from("scheduled_debt_payments")
          .select("scheduled_amount, scheduled_date, is_paid, debts(contact_name)")
          .eq("user_id", userId)
          .eq("is_paid", false)
          .gte("scheduled_date", input.start)
          .lte("scheduled_date", input.end),
      ]);
      // Each of these carries its error in the result rather than throwing, so
      // an unchecked failure degrades to `?? []` and the model reports "nothing
      // due" — a false all-clear on exactly the question people ask before
      // spending money.
      //
      // Reported per leg rather than thrown: one broken leg used to discard
      // the two that worked, which is how a single wrong column name left
      // Trace with no schedule at all. Naming the failure lets it answer on
      // what it has and say what it could not read.
      const unread: string[] = [];
      if (recurring.error) unread.push(`recurring transactions (${recurring.error.message})`);
      if (installments.error) unread.push(`installment plans (${installments.error.message})`);
      if (debtPayments.error) unread.push(`scheduled debt payments (${debtPayments.error.message})`);
      if (unread.length === 3) throw new Error(`Could not read any schedule: ${unread.join("; ")}`);

      return {
        // Present only when something failed, so the model can say which part
        // of the schedule it is missing instead of implying nothing is due.
        ...(unread.length ? { could_not_read: unread } : {}),
        recurring: (recurring.data ?? []).map((r: any) => ({
          description: r.description,
          amount: Number(r.amount),
          type: r.type,
          frequency: r.recurrence_type,
          next_due: r.next_due_date,
          ends: r.end_date,
          category: r.categories?.name ?? null,
          category_id: r.category_id ?? null,
        })),
        installments: (installments.data ?? []).map((i: any) => ({
          description: i.installment_payments?.description ?? "",
          amount: Number(i.actual_amount ?? i.scheduled_amount),
          due: i.scheduled_date,
        })),
        debt_payments: (debtPayments.data ?? []).map((d: any) => ({
          contact: d.debts?.contact_name ?? "",
          amount: Number(d.scheduled_amount),
          due: d.scheduled_date,
        })),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── system prompt ─────────────────────────────────────────────────────
function systemPrompt(ctx: Record<string, unknown>, lang: string, agency: string): string {
  return `You are Trace, the copilot inside a personal-finance app. You read the user's ledger and answer questions about it. You never move money and you never write to the ledger yourself.

Answer in ${lang === "fr" ? "French" : "English"}. Use the user's currency symbol (${ctx.currency}) and their locale's number formatting in every figure you render.

# How to answer
- Gather what you need with the read tools, then deliver everything by calling the \`answer\` tool exactly once. Never write the answer as prose — you will just be asked again.
- Money can come back on either side, and both are already netted for you. A refund reduces the expense it refunds — past zero if more came back than went out, which makes that category cheaper rather than merely free. A repayment settles an advance: the income counts net of it and the repaying expense is not spending. Never add either back in by hand.
- What a category cost is \`spending_by_category\`, and its \`spent\` is FINAL: refunds are already inside it and no income row may be subtracted from it. \`search_transactions\` \`expense\` is the same figure for the same filter, with one exception you must not try to reconcile by hand: an unfiltered \`expense\` is the period total and includes special-budget envelopes, which the category table files separately — \`expense_excluding_special_budgets\` is the figure that matches the sum of the category rows. Calling either one "gross" and taking refunds off it reports a number the app never shows, because those refunds were already taken off. A category holds both directions: income filed on one is earnings sitting beside the spending unless the user marked it as having come back on that category, in which case \`spending_by_category\` has already subtracted it and shows the split in \`offsetting_income\`. Either way it is never an adjustment for you to make by hand.
- A merchant that both charges and pays out (gambling, reimbursements, resale, cashback) must be reported NET. Its payouts are often uncategorized, so a category total counts the losses and misses the winnings; quoting the gross there states a cost the user did not bear. When a merchant drives a category's move, check it with \`search_transactions\` and use \`net\`.
- Ground every figure in a tool result. Never estimate, never carry a number from one answer to the next without re-querying. If a tool returns nothing, say so plainly rather than inventing a plausible number.
- Lead with the answer. The first block should be the verdict — a \`figure\` for a "how much" question, a \`text\` for a "why" question.
- Include a \`method\` block whenever you quote an aggregate, so the user can audit the period, filters and row count behind it.
- Be specific about what is driving a number. "Restaurants is up" is not an answer; "two thirds of the rise is weekday lunches, 61 of them against 34 last year" is.
- Keep it short. Three to six blocks. Prose blocks are one or two sentences.
- You are on a time budget AND a limited number of tool rounds. Ask for every tool call a step needs in the SAME turn — they run together — rather than one per turn. A question spanning several periods or keywords should issue those searches at once. Prefer one call that returns everything over several that each return part of it.

# Proposals
When the user asks for a change you can express as ledger edits, emit a \`proposal\` block. ${
    agency === "read"
      ? "The user has Trace in read-only mode: still emit the proposal so they can read it as a checklist, but say plainly that you cannot apply it."
      : "The user reviews and confirms it before anything is applied."
  }
- \`kind: "categorize"\` — each change is \`{transaction_id, category_id}\`. Only propose a category the user has actually used for that merchant before; call \`merchant_history\` first and leave genuinely new merchants out, listing them in a \`chips\` block instead. Set \`monthly_budget\` to null on these.
- \`kind: "budget"\` — each change is \`{category_id, monthly_budget}\`. Base the figure on observed spend, not on a round number you like. Set \`transaction_id\` to null on these. A category you leave out of \`changes\` keeps the cap it has; \`monthly_budget: null\` removes its cap altogether.
- A budget proposal is a claim about the whole envelope, not about one category. The envelope today is \`budget_envelope.monthly_total\` in the context, already totalled for you: quote that number and never re-add the individual caps to get it — adding a dozen figures inside an answer is how you end up stating a total that contradicts the one on the user's dashboard. Work out what it becomes by adding your own changes to it: for each row, proposed cap minus current cap; the envelope after is the given total plus the sum of those differences, and the difference you print must equal that sum. If your "after" minus your "before" does not equal the deltas in your own table, you have made an arithmetic error — recompute before answering. Take the period's earnings from \`search_transactions\` over the same window with no filters, and put both on the same footing: a cap is monthly, so divide that \`income\` by the whole months in the window. Never propose caps you have not compared with what actually comes in.
- Say what it costs, in \`impact\`: the envelope before, the envelope after, the difference, and a month of income beside them — "envelope 1 840 → 1 990 (+150) against 2 310 a month coming in, leaving 320 for everything uncapped". That leftover is not spare money: the categories with no cap spend out of it. If the new envelope passes a month's income, the first sentence of \`summary\` says so and says by how much.
- Hold the envelope flat where you honestly can. A category that stayed under its cap in every month of the window has real slack; propose the decrease alongside the rise, in the same proposal, and land the total where it started. Slack is what a category did not use, never what you would prefer it not to use, and no cap goes below what that category actually spends. If the total has to rise, say plainly that it is rising and what that leaves — never let a rise arrive unremarked.
- Tell a cap that is set wrong from spending that ran over, and never assume the first. Call \`spending_by_category\` ONCE with \`by_month: true\` over the whole window — six months is plenty — and it returns each category's \`by_month\`, \`months_over\` and \`months_counted\` already worked out. Never call it once per month: you have a limited number of tool rounds and spending them that way leaves none to answer in. Over in nearly every month, on charges the user does not decide row by row — rent, a subscription that went up, anything \`scheduled_charges\` reports with the same \`category_id\` — is a cap set wrong: raise it to what the ledger says. Over in one or two months, or over on a handful of discretionary rows, is overspending: leave that cap alone and say why, because raising it only makes the overspend the new normal and costs the user the one line that flagged it. Put the evidence in \`diff\` — months over out of months looked at, current cap, proposed cap.
- If every category you looked at turns out to be overspending rather than mis-set, do not emit a budget proposal at all — there are no caps to change. Say it in a \`text\` or \`list\` block instead. A proposal whose \`changes\` array is empty still renders a live apply button, which invites the user to apply nothing.
- Never silently drop a category. Every category you weighed gets a \`diff\` row, the ones you are not moving included — those show their current cap and "unchanged" and stay out of \`changes\`, so \`primary\` counts only the caps that actually move.
- \`diff\` is what the user reads before deciding: one row per change or per merchant group, with enough context to judge it.
- \`impact\` states the consequence in the app's own terms, e.g. which budgets move and by how much.
- Never put an id in \`changes\` that did not come back from a tool call.

# Ledger context
One category per name, working in both directions: the same \`Salaire\` holds the salary and any expense filed against it. A budget is a ceiling on what leaves, so a category that only ever receives money having none is correct and never worth flagging. Money coming back is netted per transaction, never per category — either by a refund link to the expense it repays, or by the user marking an income row as having come back on its category (a gambling payout against its stakes, a reimbursement filed among genuine transfers).
${JSON.stringify(ctx, null, 2)}

Today is ${new Date().toISOString().slice(0, 10)}.`;
}

// ─── handler ───────────────────────────────────────────────────────────
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await db.auth.getUser(jwt);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authData.user.id;

    // Credentials are per user, set from the app's own Settings. A
    // project-wide OPENROUTER_API_KEY still works as a fallback, which is
    // the right shape for a self-hosted deployment configured once by its
    // operator. Reading this row is why the function runs as service role
    // — `trace_credentials` is unreachable from any client session.
    const { data: cred } = await db
      .from("trace_credentials")
      .select("api_key, model, reasoning_effort")
      .eq("user_id", userId)
      .maybeSingle();

    const apiKey = cred?.api_key ?? Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const model = cred?.model || DEFAULT_MODEL;
    const reasoningEffort = cred?.reasoning_effort || DEFAULT_REASONING_EFFORT;

    const body = await req.json();
    const question: string = String(body.question ?? "").slice(0, 2000);
    const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(body.history)
      ? body.history.slice(-6)
      : [];
    const pageContext: string = String(body.pageContext ?? "").slice(0, 500);
    const lang: string = body.lang === "en" ? "en" : "fr";
    const agency: string = ["read", "confirm", "auto"].includes(body.agency) ? body.agency : "confirm";
    const currency: string = String(body.currency ?? "EUR");
    const dateColumn: "transaction_date" | "value_date" =
      body.dateType === "value" ? "value_date" : "transaction_date";

    if (!question) {
      return new Response(JSON.stringify({ error: "Missing question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Base context — small enough to inline, enough to answer "what do I
    // have?" without a tool round trip, and it gives the model the ids it
    // needs to call the tools meaningfully.
    const [accountsRes, categoriesRes, countRes] = await Promise.all([
      db.from("accounts").select("id, name, bank, account_type, balance").eq("user_id", userId),
      db.from("categories").select("id, name, budget").eq("user_id", userId).order("name"),
      db
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    const ctx = {
      currency,
      date_convention: dateColumn === "value_date" ? "value date" : "accounting date",
      transaction_count: countRes.count ?? 0,
      accounts: (accountsRes.data ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        bank: a.bank,
        type: a.account_type,
        balance: Number(a.balance),
      })),
      // One category per name, working in both directions: the same one can
      // hold a salary and a refund. A missing budget therefore means "never
      // capped", not "income category" — categories that only ever receive
      // money are expected to have none.
      categories: (categoriesRes.data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        monthly_budget: c.budget === null ? null : Number(c.budget),
      })),
      // Totalled here rather than left for the model to add up.
      //
      // Asked for "the total budget", Trace summed the twelve caps listed
      // above by hand and answered 2 465 against a real 2 795, then quoted a
      // delta that did not match its own proposal table either. Nothing was
      // wrong with the data — the arithmetic was done in the answer. A
      // figure the user can check against the number on their dashboard has
      // to be computed, not recalled, so it is computed once here and the
      // prompt forbids re-deriving it.
      budget_envelope: (() => {
        const caps = (categoriesRes.data ?? [])
          .map((c: any) => (c.budget === null ? null : Number(c.budget)))
          .filter((b: number | null): b is number => b !== null && b > 0);
        return {
          monthly_total: Number(caps.reduce((s: number, b: number) => s + b, 0).toFixed(2)),
          categories_with_budget: caps.length,
          categories_without_budget: (categoriesRes.data ?? []).length - caps.length,
        };
      })(),
      current_page: pageContext || null,
    };

    const messages: any[] = [
      { role: "system", content: systemPrompt(ctx, lang, agency) },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ];

    // Manual loop: run the model, execute whatever it asks for, feed the
    // results back, and stop when it calls `answer`.
    let answer: { steps: string[]; blocks: unknown[] } | null = null;
    let nudged = false;
    let ranOutOfTime = false;
    const deadline = Date.now() + INVOCATION_BUDGET_MS;

    // One more round than the model normally needs, because the last one is
    // spent forcing the answer rather than gathering.
    const MAX_TURNS = 10;
    let outOfRounds = false;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const left = deadline - Date.now();
      if (left < MIN_ROUND_MS) {
        // Stop on our own terms while a response can still be written.
        ranOutOfTime = true;
        break;
      }
      // Last round, or nearly out of clock: stop letting it gather and make
      // it answer with what it has. Without this the loop simply ended after
      // its last tool call and returned nothing — every query paid for,
      // thrown away, and the user told only "could not finish". A partial
      // answer from real data beats an empty one.
      const lastRound = turn === MAX_TURNS - 1;
      const mustAnswer = lastRound || left < MIN_ROUND_MS * 2;
      // Only the round ceiling sets this; the clock has its own message.
      if (lastRound) outOfRounds = true;
      // Reasoning is what actually costs the time on a slow model: those
      // tokens are generated before any tool call, so every round pays for
      // them. A question needing several rounds cannot afford the full
      // configured effort on all of them and still land inside the
      // platform's window. Past the halfway mark, buy speed with depth —
      // a shallower answer beats the worker being killed with none.
      const pressed = left < INVOCATION_BUDGET_MS / 2;
      const completion = await chatCompletion(apiKey, {
        model,
        messages,
        tools: TOOLS,
        tool_choice: mustAnswer
          ? { type: "function", function: { name: "answer" } }
          : "auto",
        max_tokens: pressed ? 4_000 : 16_000,
        // OpenRouter's unified reasoning control. Silently ignored by
        // models that don't reason, so it needs no per-model branching.
        reasoning: { effort: pressed ? "low" : reasoningEffort },
      }, Math.max(1_000, left - RESPONSE_RESERVE_MS));

      const choice = completion.choices?.[0];
      const message = choice?.message;
      if (!message) break;

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        // No tool call at all: the model answered in prose. Degrading that
        // to one text block keeps the words but loses the shape — a model
        // writing prose writes markdown tables, and the renderer shows
        // those as literal pipes. Ask once for the same answer in the
        // block vocabulary, and only settle for the prose if it declines.
        const text = typeof message.content === "string" ? message.content.trim() : "";
        if (text && !nudged) {
          nudged = true;
          messages.push(message);
          messages.push({
            role: "user",
            content:
              "Deliver that same answer by calling the `answer` tool. Put figures in " +
              "`figure` blocks and any tabular data in a `table` block — never markdown.",
          });
          continue;
        }
        if (text) answer = { steps: [], blocks: [{ t: "text", v: text }] };
        break;
      }

      // The `answer` call ends the loop; any read calls in the same turn
      // are ignored, since the model already had what it needed.
      const answerCall = toolCalls.find((c: any) => c.function?.name === "answer");
      if (answerCall) {
        try {
          answer = JSON.parse(answerCall.function.arguments || "{}");
        } catch {
          console.error("trace-copilot: unparseable answer arguments");
        }
        break;
      }

      messages.push(message);
      // Concurrently. The prompt tells the model these "run together", and
      // it asks for several at once on that promise — but they were awaited
      // one after another, so a turn cost the sum of its queries instead of
      // the slowest. Independent reads against the same database have no
      // reason to queue.
      const results = await Promise.all(
        toolCalls.map(async (call: any) => {
          try {
            const input = JSON.parse(call.function.arguments || "{}");
            const out = await runTool(db, userId, dateColumn, call.function.name, input);
            return { role: "tool", tool_call_id: call.id, content: JSON.stringify(out) };
          } catch (err) {
            return {
              role: "tool",
              tool_call_id: call.id,
              content: `Query failed: ${(err as Error).message}`,
            };
          }
        }),
      );
      for (const r of results) messages.push(r);
    }

    if (!answer || !Array.isArray(answer.blocks) || answer.blocks.length === 0) {
      return new Response(
        JSON.stringify({
          error: ranOutOfTime
            ? `Trace ran out of time on that one. ${model} needed more than the ` +
              "two minutes a request gets. Narrow the question — one period, or one " +
              "kind of spending — or pick a faster model in Settings › Trace copilot."
            : outOfRounds
              ? `Trace kept gathering and never answered. ${model} used all ` +
                `${MAX_TURNS} tool rounds on that question. Narrow it — one period, ` +
                "or one kind of spending."
              : "Trace could not finish that one. Try narrowing the question.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ steps: Array.isArray(answer.steps) ? answer.steps : [], blocks: answer.blocks }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    // Deliberately 200. `supabase.functions.invoke` turns any non-2xx into
    // a FunctionsHttpError whose message is the generic "Edge Function
    // returned a non-2xx status code" and leaves the body in `context`,
    // so a 500 here reaches the user as noise with the actual reason —
    // the model slug, the missing credit, the rejected schema — thrown
    // away. Reporting the failure in a 200 body is the only way the
    // client can show what OpenRouter actually said.
    const detail = error instanceof Error ? error.message : String(error);
    console.error("trace-copilot failed:", detail);
    return new Response(
      JSON.stringify({ error: detail }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
};

serve(handler);
