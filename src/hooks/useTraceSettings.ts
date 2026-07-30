import { useCallback, useEffect, useState } from "react";
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

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("trace-settings", { body: payload });
    if (error) throw error;
    return data;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await call({ action: "status" }));
    } catch {
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
      } catch {
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
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, [call]);

  return { status, models, loading, saving, refresh, loadModels, save, remove };
}
