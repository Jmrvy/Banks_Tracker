import { useCallback, useEffect, useState } from "react";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface TraceModel {
  id: string;
  name: string;
  context_length: number;
  /** OpenRouter quotes per token; the UI renders per million. */
  prompt_price: number;
  completion_price: number;
}

export interface TraceSettingsStatus {
  configured: boolean;
  /** `env` means the deployment supplies the key and it can't be changed here. */
  source: "user" | "env" | "none";
  /** Last characters of the stored key. The key itself is never returned. */
  hint: string | null;
  model: string;
  reasoning_effort: "low" | "medium" | "high";
}

/**
 * The function isn't there at all. Worth separating from every other
 * failure: a deployment that hasn't shipped `trace-settings` yet looks
 * exactly like a working form until you press Save, and "could not
 * update" sends the user hunting for a mistake they didn't make.
 *
 * It surfaces as a fetch error rather than a 404, because the CORS
 * preflight is what gets refused — the browser never sends the POST.
 */
const isUnreachable = (e: unknown) =>
  e instanceof FunctionsFetchError ||
  (e instanceof FunctionsHttpError && e.context?.status === 404);

/**
 * Talks to the `trace-settings` edge function, which is the only path to
 * the user's OpenRouter credentials — the table behind it is unreachable
 * from any client session by design. Nothing here ever holds the key
 * beyond the moment it is submitted.
 */
export function useTraceSettings() {
  const [status, setStatus] = useState<TraceSettingsStatus | null>(null);
  const [models, setModels] = useState<TraceModel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** False once we know the backend isn't deployed on this project. */
  const [available, setAvailable] = useState(true);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("trace-settings", { body: payload });
    if (error) throw error;
    setAvailable(true);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await call({ action: "status" }));
    } catch (error) {
      if (isUnreachable(error)) setAvailable(false);
      setStatus({ configured: false, source: "none", hint: null, model: "", reasoning_effort: "medium" });
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Loaded on demand: it's a network round trip the user only needs once
   *  they're actually choosing a model. */
  const loadModels = useCallback(async () => {
    if (models) return models;
    try {
      const data = await call({ action: "models" });
      const list: TraceModel[] = data?.models ?? [];
      setModels(list);
      return list;
    } catch {
      setModels([]);
      return [];
    }
  }, [call, models]);

  const save = useCallback(
    async (input: { apiKey?: string; model?: string | null; reasoningEffort?: string }) => {
      setSaving(true);
      try {
        const data = await call({ action: "save", ...input });
        if (data?.error) return { ok: false as const, reason: String(data.error) };
        setStatus(data);
        // A new key can reach a different catalogue, so drop the cached one.
        if (input.apiKey) setModels(null);
        return { ok: true as const, label: data?.label as string | undefined };
      } catch (error) {
        if (isUnreachable(error)) {
          setAvailable(false);
          return { ok: false as const, reason: "unavailable" };
        }
        return { ok: false as const, reason: "internal" };
      } finally {
        setSaving(false);
      }
    },
    [call],
  );

  const remove = useCallback(async () => {
    setSaving(true);
    try {
      const data = await call({ action: "delete" });
      setStatus(data);
      setModels(null);
      return true;
    } catch (error) {
      if (isUnreachable(error)) setAvailable(false);
      return false;
    } finally {
      setSaving(false);
    }
  }, [call]);

  return { status, models, loading, saving, available, refresh, loadModels, save, remove };
}
