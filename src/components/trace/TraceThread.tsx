import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertTriangle, SendHorizonal } from "lucide-react";
import { TraceBlockView, TraceWorking } from "@/components/trace/TraceBlocks";
import { TraceMark } from "@/components/trace/TraceMark";
import { useTrace, type TraceTurn } from "@/contexts/TraceContext";
import { cn } from "@/lib/utils";

/** Server error codes the user can actually act on. */
const ERROR_COPY: Record<string, { title: string; body: string }> = {
  not_configured: {
    title: "trace.errNotConfiguredTitle",
    body: "trace.errNotConfiguredBody",
  },
};

export function TraceTurnView({ turn }: { turn: TraceTurn }) {
  const { t } = useTranslation();
  const known = turn.error ? ERROR_COPY[turn.error] : undefined;
  return (
    <div className="space-y-3">
      {turn.question && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-2 text-sm">
            {turn.question}
          </div>
        </div>
      )}
      <div className="flex gap-2.5">
        <TraceMark />
        <div className="min-w-0 flex-1 space-y-2.5">
          {turn.working ? (
            <TraceWorking steps={turn.steps} />
          ) : turn.error ? (
            <div className="flex gap-2 rounded-xl border border-neg/30 bg-neg/5 px-3 py-2.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0 text-neg" />
              <div>
                <div className="font-medium">
                  {known
                    ? t(known.title, { defaultValue: "Trace isn't set up yet" })
                    : t("trace.failed", { defaultValue: "Trace could not answer that" })}
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {known
                    ? t(known.body, {
                        defaultValue:
                          "Add an OpenRouter API key in Settings → Trace copilot and Trace can start reading your ledger.",
                      })
                    : turn.error}
                </div>
                {known && (
                  <Link
                    to="/settings#trace"
                    className="inline-block mt-1.5 underline underline-offset-2 hover:text-foreground"
                  >
                    {t("trace.openSettings", { defaultValue: "Open Trace settings" })}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              {turn.blocks.map((block, i) => (
                <TraceBlockView key={i} block={block} turnId={turn.id} index={i} />
              ))}
              <div className="text-[11px] text-fg-dim pt-0.5">
                {t("trace.byline", {
                  defaultValue: "Trace · read-only on your ledger · figures come from your own transactions",
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Scrollable turn list that pins to the bottom as answers arrive. */
export function TraceThread({ className }: { className?: string }) {
  const { turns } = useTrace();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [turns]);
  return (
    <div ref={ref} className={cn("overflow-y-auto space-y-5", className)}>
      {turns.map((turn) => (
        <TraceTurnView key={turn.id} turn={turn} />
      ))}
    </div>
  );
}

export function TraceComposer({
  suggestions,
  placeholder,
  compact = false,
  autoFocus = false,
}: {
  suggestions?: { label: string; group: string; query: string }[];
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const { ask, busy } = useTrace();
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim() || busy) return;
    void ask(value);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-card px-2.5 py-1.5 focus-within:border-line-strong transition-colors">
        <TraceMark size="sm" plain />
        <input
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            placeholder ??
            t("trace.placeholder", { defaultValue: "Ask about your money, or describe a cleanup…" })
          }
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-1"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !value.trim()}
          aria-label={t("trace.send", { defaultValue: "Ask Trace" })}
          className="h-7 w-7 grid place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <SendHorizonal className="h-3.5 w-3.5" />
        </button>
      </div>

      {!compact && suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.query}
              type="button"
              disabled={busy}
              onClick={() => void ask(s.query)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs hover:bg-bg-hover hover:border-line-strong transition-colors disabled:opacity-50"
            >
              <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                {s.group}
              </span>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The starter prompts, localized. Shared by every surface. */
export function useTraceSuggestions() {
  const { t } = useTranslation();
  return [
    {
      group: t("trace.groupAsk", { defaultValue: "Ask" }),
      label: t("trace.sugSpendVsLastYear", { defaultValue: "Restaurants vs last year?" }),
      query: t("trace.sugSpendVsLastYearQ", {
        defaultValue: "How much did I spend on restaurants this year versus last year?",
      }),
    },
    {
      group: t("trace.groupAsk", { defaultValue: "Ask" }),
      label: t("trace.sugWhereGoing", { defaultValue: "Where is my money going?" }),
      query: t("trace.sugWhereGoingQ", {
        defaultValue: "Where did my money go this month, and what changed versus last month?",
      }),
    },
    {
      group: t("trace.groupCleanUp", { defaultValue: "Clean up" }),
      label: t("trace.sugCategorize", { defaultValue: "Categorize my unknowns" }),
      query: t("trace.sugCategorizeQ", {
        defaultValue: "Find my uncategorized transactions and propose categories for the ones you're confident about.",
      }),
    },
    {
      group: t("trace.groupPlan", { defaultValue: "Plan" }),
      label: t("trace.sugRebuildBudget", { defaultValue: "Rebuild my budget from history" }),
      query: t("trace.sugRebuildBudgetQ", {
        defaultValue: "Rebuild my category budgets from my actual spending over the last six months.",
      }),
    },
  ];
}
