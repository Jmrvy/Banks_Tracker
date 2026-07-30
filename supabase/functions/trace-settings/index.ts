/**
 * Trace — settings side. Owns the user's OpenRouter credentials.
 *
 * This exists so the key never passes through PostgREST: `trace_credentials`
 * has RLS on with no policies, so only the service role can touch it, and
 * the only door is this function. It authenticates the caller's JWT and
 * acts strictly on that user's row.
 *
 * The key is write-only from the client's point of view. `status` returns
 * whether one is installed and a hint of its last characters — never the
 * key itself — so a compromised browser session cannot exfiltrate it.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = Deno.env.get("TRACE_MODEL") ?? "anthropic/claude-opus-4.5";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Last four characters, enough to recognise a key without revealing it. */
const hintOf = (key: string) => `…${key.slice(-4)}`;

/**
 * Confirms the key works before we store it, so a typo surfaces in the
 * settings form rather than as a broken copilot later. Returns the key's
 * label and whether it's a free-tier key, both of which are useful to show.
 */
async function verifyKey(apiKey: string): Promise<{ ok: true; label: string } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "rejected" };
  if (!res.ok) return { ok: false, reason: "unreachable" };
  const body = await res.json().catch(() => null);
  return { ok: true, label: String(body?.data?.label ?? "") };
}

/** The slice of OpenRouter's /models entry the picker actually reads. */
type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
};

/**
 * Tool-capable models only. Trace answers by *calling* an `answer` tool, so
 * a model without tool support can't produce a renderable answer — offering
 * it in the picker would just be a trap.
 */
async function listModels(apiKey: string) {
  const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
  const body = (await res.json()) as { data?: OpenRouterModel[] };
  return (body?.data ?? [])
    .filter((m) => Array.isArray(m.supported_parameters) && m.supported_parameters.includes("tools"))
    .map((m) => ({
      id: String(m.id),
      name: String(m.name ?? m.id),
      context_length: Number(m.context_length ?? 0),
      // Per-token strings from OpenRouter; the client renders them per
      // million, which is how everyone actually reasons about cost.
      prompt_price: Number(m.pricing?.prompt ?? 0),
      completion_price: Number(m.pricing?.completion ?? 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await db.auth.getUser(jwt);
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = authData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "status");

    const { data: row } = await db
      .from("trace_credentials")
      .select("key_hint, model, reasoning_effort")
      .eq("user_id", userId)
      .maybeSingle();

    // A project-wide key still works: it's the right shape for a
    // self-hosted deployment where one operator configures Trace once.
    const envKey = Deno.env.get("OPENROUTER_API_KEY");

    const status = () => ({
      configured: !!row || !!envKey,
      // `env` means the deployment supplies the key and the user cannot
      // change or remove it from here — the UI says so rather than
      // showing an empty field that looks unconfigured.
      source: row ? "user" : envKey ? "env" : "none",
      hint: row?.key_hint ?? null,
      model: row?.model ?? DEFAULT_MODEL,
      reasoning_effort: row?.reasoning_effort ?? "medium",
    });

    switch (action) {
      case "status":
        return json(status());

      case "models": {
        // The user's own key when they have one, so the catalogue reflects
        // what that key can actually reach.
        const { data: keyRow } = await db
          .from("trace_credentials")
          .select("api_key")
          .eq("user_id", userId)
          .maybeSingle();
        const apiKey = keyRow?.api_key ?? envKey;
        if (!apiKey) return json({ error: "not_configured" }, 200);
        try {
          return json({ models: await listModels(apiKey) });
        } catch (err) {
          return json({ error: (err as Error).message }, 200);
        }
      }

      case "save": {
        const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
        const model = typeof body.model === "string" && body.model ? body.model : null;
        const effort = ["low", "medium", "high"].includes(body.reasoningEffort)
          ? body.reasoningEffort
          : "medium";

        // No key in the payload means the user is only changing the model
        // or effort, so keep the stored key rather than making them
        // re-enter something the UI can't show them.
        if (!apiKey) {
          if (!row) return json({ error: "no_key" }, 200);
          await db
            .from("trace_credentials")
            .update({ model, reasoning_effort: effort, updated_at: new Date().toISOString() })
            .eq("user_id", userId);
          const { data: updated } = await db
            .from("trace_credentials")
            .select("key_hint, model, reasoning_effort")
            .eq("user_id", userId)
            .maybeSingle();
          return json({
            configured: true,
            source: "user",
            hint: updated?.key_hint ?? null,
            model: updated?.model ?? DEFAULT_MODEL,
            reasoning_effort: updated?.reasoning_effort ?? "medium",
          });
        }

        const verified = await verifyKey(apiKey);
        if (!verified.ok) return json({ error: verified.reason }, 200);

        await db.from("trace_credentials").upsert(
          {
            user_id: userId,
            api_key: apiKey,
            key_hint: hintOf(apiKey),
            model,
            reasoning_effort: effort,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

        return json({
          configured: true,
          source: "user",
          hint: hintOf(apiKey),
          model: model ?? DEFAULT_MODEL,
          reasoning_effort: effort,
          label: verified.label,
        });
      }

      case "delete": {
        await db.from("trace_credentials").delete().eq("user_id", userId);
        return json({
          configured: !!envKey,
          source: envKey ? "env" : "none",
          hint: null,
          model: DEFAULT_MODEL,
          reasoning_effort: "medium",
        });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (error) {
    console.error("trace-settings failed:", error instanceof Error ? error.message : error);
    return json({ error: "internal" }, 500);
  }
};

serve(handler);
