import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useUserPreferences } from "@/hooks/useUserPreferences";

/**
 * Recovers the reason from a failed `functions.invoke`. FunctionsHttpError
 * carries the raw Response in `context`; its own message says only that the
 * status was non-2xx, which tells the user nothing they can act on.
 */
async function describeInvokeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return String(body.error);
    } catch {
      // Body already consumed or not JSON — fall through to the message.
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The block vocabulary the copilot answers in. Mirrors the schema the
 * edge function constrains the model to, so a block that renders here is
 * a block the server could have produced — no defensive `any` handling
 * scattered through the renderers.
 */
export type TraceBlock =
  | { t: "text"; v: string }
  | {
      t: "figure";
      label: string;
      value: string;
      delta: { dir: "good" | "bad" | "flat"; v: string } | null;
      sub: string;
    }
  | { t: "table"; cols: string[]; rows: string[][] }
  | { t: "list"; items: { tone: "pos" | "neg" | "warn" | "info"; title: string; body: string }[] }
  | {
      t: "forecast";
      rows: { k: string; v: string; tone: "pos" | "neg" | null }[];
      foot: { k: string; v: string; tone: "pos" | "neg" | null };
    }
  | { t: "chips"; label: string; items: { name: string; amount: string; date: string }[] }
  | { t: "bars"; months: string[]; series: { name: string; values: number[] }[]; note: string }
  | { t: "method"; period: string; filters: string[]; excluded: string; rows: string }
  | {
      t: "proposal";
      kind: "categorize" | "budget";
      title: string;
      summary: string;
      impact: string;
      diff: { cols: string[]; rows: string[][] };
      note: string | null;
      primary: string;
      changes: {
        transaction_id: string | null;
        category_id: string;
        monthly_budget: number | null;
      }[];
    };

export interface TraceTurn {
  id: string;
  /** Absent on the greeting turn, which Trace opens with unprompted. */
  question?: string;
  /** True while the request is in flight; `steps` animate meanwhile. */
  working: boolean;
  steps: string[];
  blocks: TraceBlock[];
  error?: string;
}

/**
 * How much Trace is allowed to do on the user's behalf.
 *  read    — answers only; proposals render as a read-only checklist
 *  confirm — proposals render with an Apply button (default)
 *  auto    — proposals apply on arrival, logged to activity with undo
 */
export type TraceAgency = "read" | "confirm" | "auto";

/** Which surface Trace is currently occupying. Only one at a time. */
export type TraceSurface = "closed" | "dock" | "modal";

interface TraceContextValue {
  turns: TraceTurn[];
  busy: boolean;
  surface: TraceSurface;
  agency: TraceAgency;
  setAgency: (next: TraceAgency) => void;
  openDock: () => void;
  openModal: (seedQuestion?: string) => void;
  close: () => void;
  ask: (question: string) => Promise<void>;
  reset: () => void;
  /** Human-readable description of the page Trace is watching. */
  pageContext: string;
}

const TraceContext = createContext<TraceContextValue | undefined>(undefined);

const AGENCY_KEY = "traceAgency";

function readAgency(): TraceAgency {
  if (typeof window === "undefined") return "confirm";
  const raw = window.localStorage.getItem(AGENCY_KEY);
  return raw === "read" || raw === "auto" ? raw : "confirm";
}

/** Route → the phrase Trace uses when it says what it is looking at. */
const PAGE_LABELS: Record<string, string> = {
  "/": "dashboard",
  "/accounts": "accounts",
  "/transactions": "transactions",
  "/budget": "budget",
  "/analyse": "analysis",
  "/savings": "savings goals",
  "/scheduled": "scheduled payments",
  "/settings": "settings",
  "/trace": "Trace",
};

export function TraceProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const location = useLocation();
  const { preferences } = useUserPreferences();
  const [turns, setTurns] = useState<TraceTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [surface, setSurface] = useState<TraceSurface>("closed");
  const [agency, setAgencyState] = useState<TraceAgency>(readAgency);
  // Seed for the modal when it's opened from ⌘K with a query already typed.
  const seedRef = useRef<string | null>(null);

  const pageContext = PAGE_LABELS[location.pathname] ?? location.pathname;

  const setAgency = useCallback((next: TraceAgency) => {
    setAgencyState(next);
    try {
      window.localStorage.setItem(AGENCY_KEY, next);
    } catch {
      // localStorage unavailable — the in-memory value still applies for
      // this session.
    }
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setBusy(true);
      setTurns((prev) => [
        ...prev,
        { id, question: trimmed, working: true, steps: [], blocks: [] },
      ]);

      // Only prior *answered* turns are worth sending; a failed turn adds
      // no context and a working one has no content yet.
      const history = turns
        .filter((t) => !t.working && !t.error && t.question)
        .slice(-3)
        .flatMap((t) => [
          { role: "user" as const, content: t.question! },
          { role: "assistant" as const, content: JSON.stringify(t.blocks) },
        ]);

      try {
        const { data, error } = await supabase.functions.invoke("trace-copilot", {
          body: {
            question: trimmed,
            history,
            pageContext,
            lang: i18n.language?.startsWith("en") ? "en" : "fr",
            agency,
            currency: preferences.currency,
            dateType: preferences.dateType,
          },
        });
        // `invoke` reports a non-2xx as FunctionsHttpError, whose message is
        // always "Edge Function returned a non-2xx status code" — the useful
        // part sits unread in `context`, the raw Response. Dig it out so the
        // user sees the real reason rather than the wrapper.
        if (error) throw new Error(await describeInvokeError(error));
        if (data?.error) throw new Error(data.error);

        setTurns((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, working: false, steps: data.steps ?? [], blocks: data.blocks ?? [] }
              : t,
          ),
        );
      } catch (err) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, working: false, error: (err as Error).message || "unknown" }
              : t,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, turns, pageContext, i18n.language, agency, preferences.currency, preferences.dateType],
  );

  const openDock = useCallback(() => setSurface("dock"), []);
  const close = useCallback(() => setSurface("closed"), []);
  const reset = useCallback(() => setTurns([]), []);

  const openModal = useCallback(
    (seedQuestion?: string) => {
      setSurface("modal");
      if (seedQuestion) {
        seedRef.current = seedQuestion;
        void ask(seedQuestion);
      }
    },
    [ask],
  );

  const value = useMemo(
    () => ({
      turns,
      busy,
      surface,
      agency,
      setAgency,
      openDock,
      openModal,
      close,
      ask,
      reset,
      pageContext,
    }),
    [turns, busy, surface, agency, setAgency, openDock, openModal, close, ask, reset, pageContext],
  );

  return <TraceContext.Provider value={value}>{children}</TraceContext.Provider>;
}

export function useTrace(): TraceContextValue {
  const ctx = useContext(TraceContext);
  if (!ctx) throw new Error("useTrace must be used within a TraceProvider");
  return ctx;
}
