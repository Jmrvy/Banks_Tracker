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
        .select("id, description, amount, refunded_amount, type, transaction_date, value_date, category_id, account_id, categories(name), accounts!transactions_account_id_fkey(name)")
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
        .select("id, description, amount, transaction_date, type, accounts!transactions_account_id_fkey(name)")
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
- Gather what you need with the read tools, then deliver everything by calling the \`answer\` tool exactly once. Never write the answer as prose — you will just be asked again.
- Ground every figure in a tool result. Never estimate, never carry a number from one answer to the next without re-querying. If a tool returns nothing, say so plainly rather than inventing a plausible number.
- Lead with the answer. The first block should be the verdict — a \`figure\` for a "how much" question, a \`text\` for a "why" question.
- Include a \`method\` block whenever you quote an aggregate, so the user can audit the period, filters and row count behind it.
- Be specific about what is driving a number. "Restaurants is up" is not an answer; "two thirds of the rise is weekday lunches, 61 of them against 34 last year" is.
- Keep it short. Three to six blocks. Prose blocks are one or two sentences.
- You are on a time budget. Ask for every tool call a step needs in the SAME turn — they run together — rather than one per turn. A question spanning several periods or keywords should issue those searches at once.

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
      categories: (categoriesRes.data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        monthly_budget: c.budget === null ? null : Number(c.budget),
      })),
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

    for (let turn = 0; turn < 8; turn++) {
      const left = deadline - Date.now();
      if (left < MIN_ROUND_MS) {
        // Stop on our own terms while a response can still be written.
        ranOutOfTime = true;
        break;
      }
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
        tool_choice: "auto",
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
        JSON.stringify({
          error: ranOutOfTime
            ? `Trace ran out of time on that one. ${model} needed more than the ` +
              "two minutes a request gets. Narrow the question — one period, or one " +
              "kind of spending — or pick a faster model in Settings › Trace copilot."
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
