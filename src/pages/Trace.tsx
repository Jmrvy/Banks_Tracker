import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Bell, History, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { TraceMark } from "@/components/trace/TraceMark";
import { TraceBlockView } from "@/components/trace/TraceBlocks";
import { TraceComposer, TraceThread, useTraceSuggestions } from "@/components/trace/TraceThread";
import { useTrace, type TraceBlock } from "@/contexts/TraceContext";
import { useTraceApply } from "@/hooks/useTraceApply";
import { useAuth } from "@/contexts/AuthContext";
import { useDateFnsLocale } from "@/hooks/useDateFnsLocale";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";
import { parseLocalDate } from "@/lib/dateUtils";

interface ActivityRow {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  created_at: string;
  undone_at: string | null;
}

/**
 * The Radar rail. Deliberately *not* model-generated: these are
 * deterministic facts the app already knows, so the rail is trustworthy
 * even before Trace has been asked anything, and it costs no tokens to
 * render. Each card hands a question to Trace rather than answering it.
 */
function useRadar() {
  const { t } = useTranslation();
  const { transactions, categories } = useFinancialData();
  const { formatCurrency } = useUserPreferences();

  return useMemo(() => {
    const cards: { id: string; title: string; sub: string; body: string; action: string; query: string }[] = [];

    const uncategorized = transactions.filter(
      (tx) => !tx.category && tx.type !== "transfer" && tx.include_in_stats !== false,
    );
    if (uncategorized.length > 0) {
      const total = uncategorized.reduce((s, tx) => s + Math.abs(tx.amount), 0);
      cards.push({
        id: "uncategorized",
        title: t("trace.radarUncategorized", {
          defaultValue: "{{count}} transactions have no category",
          count: uncategorized.length,
        }),
        sub: formatCurrency(total),
        body: t("trace.radarUncategorizedBody", {
          defaultValue: "Uncategorized spend is invisible to your budget, which quietly makes it read low.",
        }),
        action: t("trace.radarCategorize", { defaultValue: "Categorize them" }),
        query: t("trace.sugCategorizeQ", {
          defaultValue:
            "Find my uncategorized transactions and propose categories for the ones you're confident about.",
        }),
      });
    }

    // Categories over their monthly limit this month, worst first.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const spendByCategory = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.type !== "expense" || tx.include_in_stats === false || !tx.category) continue;
      if (tx.special_budget_id) continue;
      if (parseLocalDate(tx.transaction_date) < monthStart) continue;
      const net = Math.max(0, tx.amount - (tx.refunded_amount || 0));
      spendByCategory.set(tx.category.id, (spendByCategory.get(tx.category.id) ?? 0) + net);
    }
    const over = categories
      .filter((c) => c.budget != null && c.budget > 0 && (spendByCategory.get(c.id) ?? 0) > c.budget!)
      .map((c) => ({ c, spent: spendByCategory.get(c.id) ?? 0 }))
      .sort((a, b) => b.spent / (b.c.budget || 1) - a.spent / (a.c.budget || 1));

    if (over.length > 0) {
      const worst = over[0];
      cards.push({
        id: "over-budget",
        title: t("trace.radarOverBudget", {
          defaultValue: "{{count}} categories over budget",
          count: over.length,
        }),
        sub: t("trace.radarWorst", {
          defaultValue: "{{name}} is the worst at {{pct}}%",
          name: worst.c.name,
          pct: Math.round((worst.spent / (worst.c.budget || 1)) * 100),
        }),
        body: t("trace.radarOverBudgetBody", {
          defaultValue: "When most categories run over, the limits are usually wrong rather than the spending.",
        }),
        action: t("trace.radarRebuild", { defaultValue: "Rebuild the limits" }),
        query: t("trace.sugRebuildBudgetQ", {
          defaultValue: "Rebuild my category budgets from my actual spending over the last six months.",
        }),
      });
    }

    const noBudget = categories.filter((c) => c.budget == null || c.budget === 0);
    if (noBudget.length > 0 && over.length === 0) {
      cards.push({
        id: "no-budget",
        title: t("trace.radarNoBudget", {
          defaultValue: "{{count}} categories have no budget",
          count: noBudget.length,
        }),
        sub: noBudget.slice(0, 3).map((c) => c.name).join(" · "),
        body: t("trace.radarNoBudgetBody", {
          defaultValue: "Spending in these never triggers an alert, however far it drifts.",
        }),
        action: t("trace.radarSuggest", { defaultValue: "Suggest limits" }),
        query: t("trace.radarNoBudgetQ", {
          defaultValue: "Suggest a monthly budget for each of my categories that doesn't have one yet.",
        }),
      });
    }

    return cards;
  }, [transactions, categories, t, formatCurrency]);
}

function Radar({ onAsk }: { onAsk: (query: string) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { undo, busyId } = useTraceApply();
  const dateLocale = useDateFnsLocale();
  const cards = useRadar();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from("trace_activity")
      .select("id, kind, title, detail, created_at, undone_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (!cancelled && data) setActivity(data as ActivityRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const live = cards.filter((c) => !dismissed.includes(c.id));

  return (
    <aside className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.09em] font-semibold text-muted-foreground mb-2">
          <Bell className="h-3 w-3" />
          {t("trace.radar", { defaultValue: "Radar" })}
          {live.length > 0 && (
            <span className="ml-auto font-mono tabular-nums text-foreground">{live.length}</span>
          )}
        </div>
        {live.length === 0 ? (
          <div className="rounded-xl border border-line bg-card px-3.5 py-3 text-xs text-muted-foreground">
            {t("trace.radarClear", { defaultValue: "Nothing needs you right now." })}
          </div>
        ) : (
          <div className="space-y-2">
            {live.map((card) => (
              <div key={card.id} className="rounded-xl border border-line bg-card px-3.5 py-3">
                <div className="text-xs font-semibold tracking-tight">{card.title}</div>
                <div className="text-[11px] font-mono tabular-nums text-muted-foreground mt-0.5">
                  {card.sub}
                </div>
                <div className="text-xs text-muted-foreground mt-1.5">{card.body}</div>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <Button size="sm" className="h-7 text-xs" onClick={() => onAsk(card.query)}>
                    {card.action}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => setDismissed((d) => [...d, card.id])}
                  >
                    {t("trace.dismiss", { defaultValue: "Dismiss" })}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.09em] font-semibold text-muted-foreground mb-2">
          <History className="h-3 w-3" />
          {t("trace.activity", { defaultValue: "Activity" })}
        </div>
        {activity.length === 0 ? (
          <div className="rounded-xl border border-line bg-card px-3.5 py-3 text-xs text-muted-foreground">
            {t("trace.activityEmpty", { defaultValue: "Nothing applied yet." })}
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-card divide-y divide-line">
            {activity.map((row) => (
              <div key={row.id} className="px-3.5 py-2.5 flex items-start gap-2.5">
                <span className="text-[11px] font-mono text-muted-foreground pt-0.5 whitespace-nowrap">
                  {format(new Date(row.created_at), "d MMM", { locale: dateLocale })}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{row.title}</div>
                  {row.detail && (
                    <div className="text-[11px] text-muted-foreground truncate">{row.detail}</div>
                  )}
                </div>
                {row.undone_at ? (
                  <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground pt-0.5">
                    {t("trace.undoneTag", { defaultValue: "reverted" })}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={async () => {
                      if (await undo(row.id, row.id)) {
                        setActivity((rows) =>
                          rows.map((r) =>
                            r.id === row.id ? { ...r, undone_at: new Date().toISOString() } : r,
                          ),
                        );
                      }
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 pt-0.5 disabled:opacity-50"
                  >
                    <Undo2 className="h-3 w-3" />
                    {t("trace.undo", { defaultValue: "Undo" })}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

/** The greeting turn — deterministic, so the page is useful on arrival. */
function useGreeting(): TraceBlock[] {
  const { t } = useTranslation();
  const { transactions, accounts } = useFinancialData();
  const cards = useRadar();

  return useMemo(() => {
    const blocks: TraceBlock[] = [
      {
        t: "text",
        v: t("trace.greeting", {
          defaultValue:
            "I can read **{{tx}} transactions** across your {{accounts}} accounts. Ask me anything about them — or start with what stands out below.",
          tx: transactions.length.toLocaleString(),
          accounts: accounts.length,
        }),
      },
    ];
    if (cards.length > 0) {
      blocks.push({
        t: "list",
        items: cards.map((c) => ({
          tone: c.id === "over-budget" ? ("neg" as const) : ("warn" as const),
          title: c.title,
          body: c.body,
        })),
      });
    }
    return blocks;
  }, [t, transactions.length, accounts.length, cards]);
}

const Trace = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { turns, ask, busy } = useTrace();
  const suggestions = useTraceSuggestions();
  const greeting = useGreeting();

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <div className="ft-page">
        <div className="ft-page-head">
          <div className="flex items-start gap-3">
            <TraceMark size="lg" />
            <div>
              <div className="ft-eyebrow">{t("navigation.trace", { defaultValue: "Copilot" })}</div>
              <h1 className="ft-page-title">Trace</h1>
              <div className="ft-page-sub">
                {t("trace.tagline", {
                  defaultValue: "Reads your ledger. Proposes. Never moves money.",
                })}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8" onClick={() => navigate("/settings#privacy")}>
            {t("trace.settings", { defaultValue: "Trace settings" })}
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <div className="space-y-4 min-w-0">
            {turns.length === 0 ? (
              <div className="ft-card p-5 space-y-3">
                <div className="flex gap-2.5">
                  <TraceMark />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    {greeting.map((block, i) => (
                      <TraceBlockView key={i} block={block} turnId="__greeting" index={i} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="ft-card p-5">
                <TraceThread className="max-h-[62vh]" />
              </div>
            )}

            <TraceComposer suggestions={suggestions} />

            {turns.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("trace.disclaimer", {
                  defaultValue:
                    "Trace only reads. Anything that would change your data arrives as a proposal you review first, and every applied change can be undone from Activity.",
                })}
              </p>
            )}
          </div>

          <Radar onAsk={(query) => void ask(query)} />
        </div>

        {busy && <span className="sr-only">{t("trace.working", { defaultValue: "Trace is working" })}</span>}
      </div>
    </div>
  );
};

export default Trace;
