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
import OpenAI from "npm:openai@4.104.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Overridable so the model can be changed without a redeploy of the
 * client. Must be a tool-calling model — Trace answers by *calling* the
 * `answer` tool, and a model without tool support returns prose this
 * function can only degrade into a single text block.
 */
const MODEL = Deno.env.get("TRACE_MODEL") ?? "anthropic/claude-opus-4.5";

/** OpenRouter's unified reasoning control, ignored by models without it. */
const REASONING_EFFORT = Deno.env.get("TRACE_REASONING_EFFORT") ?? "medium";

/** Upstream ceiling, below the platform's own wall clock, so a wedged
 *  request surfaces as a clean error instead of a killed invocation. */
const REQUEST_TIMEOUT_MS = 110_000;

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
      "Aggregate and sample the ledger. Returns the matched count, the net total, and the " +
      "biggest rows with their ids. Use this before quoting any figure.",
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
      "Net expense per category over a period, with each category's monthly budget and id. " +
      "The basis for any budget answer or budget proposal.",
    parameters: obj({ start: str, end: str }),
  },
  {
    name: "list_uncategorized",
    description: "Transactions with no category, newest first. Returns ids so they can be proposed for categorization.",
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
type Db = ReturnType<typeof createClient>;

/** Net of any refund, floored at zero — the same basis the app uses. */
const netExpense = (t: Record<string, unknown>) =>
  Math.max(0, Number(t.amount) - Number(t.refunded_amount ?? 0));

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
        .select("id, description, amount, refunded_amount, type, transaction_date, value_date, category_id, account_id, categories(name), accounts(name)")
        .eq("user_id", userId)
        .eq("include_in_stats", true)
        .gte(dateColumn, input.start)
        .lte(dateColumn, input.end);
      if (input.category_id) q = q.eq("category_id", input.category_id);
      if (input.account_id) q = q.eq("account_id", input.account_id);
      if (input.type) q = q.eq("type", input.type);
      if (input.text) q = q.ilike("description", `%${input.text}%`);
      const { data, error } = await q.limit(2000);
      if (error) throw error;
      const rows = data ?? [];
      const total = rows.reduce(
        (s: number, t: any) => s + (t.type === "expense" ? netExpense(t) : Number(t.amount)),
        0,
      );
      const limit = Math.min(Math.max(Number(input.limit ?? 10), 1), 50);
      const sample = [...rows]
        .sort((a: any, b: any) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
        .slice(0, limit)
        .map((t: any) => ({
          id: t.id,
          date: dateColumn === "value_date" ? (t.value_date || t.transaction_date) : t.transaction_date,
          description: t.description,
          amount: t.type === "expense" ? netExpense(t) : Number(t.amount),
          type: t.type,
          category: t.categories?.name ?? null,
          account: t.accounts?.name ?? null,
        }));
      return { count: rows.length, total: Number(total.toFixed(2)), sample };
    }

    case "spending_by_category": {
      const [{ data: cats, error: catErr }, { data: txs, error: txErr }] = await Promise.all([
        db.from("categories").select("id, name, budget").eq("user_id", userId),
        db
          .from("transactions")
          .select("amount, refunded_amount, category_id")
          .eq("user_id", userId)
          .eq("type", "expense")
          .eq("include_in_stats", true)
          .is("special_budget_id", null)
          .gte(dateColumn, input.start)
          .lte(dateColumn, input.end)
          .limit(5000),
      ]);
      if (catErr) throw catErr;
      if (txErr) throw txErr;
      const spent = new Map<string, { total: number; count: number }>();
      for (const t of txs ?? []) {
        const key = (t as any).category_id ?? "__none__";
        const cur = spent.get(key) ?? { total: 0, count: 0 };
        cur.total += netExpense(t as any);
        cur.count += 1;
        spent.set(key, cur);
      }
      return (cats ?? []).map((c: any) => ({
        category_id: c.id,
        name: c.name,
        monthly_budget: c.budget === null ? null : Number(c.budget),
        spent: Number((spent.get(c.id)?.total ?? 0).toFixed(2)),
        transactions: spent.get(c.id)?.count ?? 0,
      }));
    }

    case "list_uncategorized": {
      const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
      const { data, error } = await db
        .from("transactions")
        .select("id, description, amount, transaction_date, type, accounts(name)")
        .eq("user_id", userId)
        .is("category_id", null)
        .neq("type", "transfer")
        .order("transaction_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        id: t.id,
        date: t.transaction_date,
        description: t.description,
        amount: Number(t.amount),
        type: t.type,
        account: t.accounts?.name ?? null,
      }));
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
          .select("description, amount, type, recurrence_type, next_due_date, end_date")
          .eq("user_id", userId)
          .eq("is_active", true),
        db
          .from("installment_payment_records")
          .select("amount, payment_date, is_paid, installment_payments(description)")
          .eq("user_id", userId)
          .eq("is_paid", false)
          .gte("payment_date", input.start)
          .lte("payment_date", input.end),
        db
          .from("scheduled_debt_payments")
          .select("scheduled_amount, scheduled_date, is_paid, debts(contact_name)")
          .eq("user_id", userId)
          .eq("is_paid", false)
          .gte("scheduled_date", input.start)
          .lte("scheduled_date", input.end),
      ]);
      return {
        recurring: (recurring.data ?? []).map((r: any) => ({
          description: r.description,
          amount: Number(r.amount),
          type: r.type,
          frequency: r.recurrence_type,
          next_due: r.next_due_date,
          ends: r.end_date,
        })),
        installments: (installments.data ?? []).map((i: any) => ({
          description: i.installment_payments?.description ?? "",
          amount: Number(i.amount),
          due: i.payment_date,
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
- Gather what you need with the read tools, then deliver everything by calling the \`answer\` tool exactly once. Never write the answer as prose — prose is dropped.
- Ground every figure in a tool result. Never estimate, never carry a number from one answer to the next without re-querying. If a tool returns nothing, say so plainly rather than inventing a plausible number.
- Lead with the answer. The first block should be the verdict — a \`figure\` for a "how much" question, a \`text\` for a "why" question.
- Include a \`method\` block whenever you quote an aggregate, so the user can audit the period, filters and row count behind it.
- Be specific about what is driving a number. "Restaurants is up" is not an answer; "two thirds of the rise is weekday lunches, 61 of them against 34 last year" is.
- Keep it short. Three to six blocks. Prose blocks are one or two sentences.

# Proposals
When the user asks for a change you can express as ledger edits, emit a \`proposal\` block. ${
    agency === "read"
      ? "The user has Trace in read-only mode: still emit the proposal so they can read it as a checklist, but say plainly that you cannot apply it."
      : "The user reviews and confirms it before anything is applied."
  }
- \`kind: "categorize"\` — each change is \`{transaction_id, category_id}\`. Only propose a category the user has actually used for that merchant before; call \`merchant_history\` first and leave genuinely new merchants out, listing them in a \`chips\` block instead. Set \`monthly_budget\` to null on these.
- \`kind: "budget"\` — each change is \`{category_id, monthly_budget}\`. Base the figure on observed spend, not on a round number you like. Set \`transaction_id\` to null on these.
- \`diff\` is what the user reads before deciding: one row per change or per merchant group, with enough context to judge it.
- \`impact\` states the consequence in the app's own terms, e.g. which budgets move and by how much.
- Never put an id in \`changes\` that did not come back from a tool call.

# Ledger context
${JSON.stringify(ctx, null, 2)}

Today is ${new Date().toISOString().slice(0, 10)}.`;
}

// ─── handler ───────────────────────────────────────────────────────────
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Trace is not configured: OPENROUTER_API_KEY is unset." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
      categories: (categoriesRes.data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        monthly_budget: c.budget === null ? null : Number(c.budget),
      })),
      current_page: pageContext || null,
    };

    const openai = new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      // OpenRouter attribution — shows the app on its dashboards and lets
      // per-app rate limits apply to the right thing.
      defaultHeaders: {
        "HTTP-Referer": Deno.env.get("APP_URL") ?? "https://banks-tracker.app",
        "X-Title": "Banks Tracker — Trace",
      },
    });

    const messages: any[] = [
      { role: "system", content: systemPrompt(ctx, lang, agency) },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ];

    // Manual loop: run the model, execute whatever it asks for, feed the
    // results back, and stop when it calls `answer`.
    let answer: { steps: string[]; blocks: unknown[] } | null = null;
    for (let turn = 0; turn < 8; turn++) {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 16000,
        // OpenRouter's unified reasoning control. Silently ignored by
        // models that don't reason, so it needs no per-model branching.
        reasoning: { effort: REASONING_EFFORT },
      } as any);

      const choice = completion.choices?.[0];
      const message = choice?.message;
      if (!message) break;

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        // No tool call at all: the model answered in prose. Degrade to a
        // single text block rather than dropping the answer on the floor.
        const text = typeof message.content === "string" ? message.content.trim() : "";
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
      for (const call of toolCalls) {
        let content: string;
        try {
          const input = JSON.parse(call.function.arguments || "{}");
          content = JSON.stringify(await runTool(db, userId, dateColumn, call.function.name, input));
        } catch (err) {
          content = `Query failed: ${(err as Error).message}`;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }
    }

    if (!answer || !Array.isArray(answer.blocks) || answer.blocks.length === 0) {
      return new Response(
        JSON.stringify({ error: "Trace could not finish that one. Try narrowing the question." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ steps: Array.isArray(answer.steps) ? answer.steps : [], blocks: answer.blocks }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("trace-copilot failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
