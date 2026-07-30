import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Check, Info, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TraceMark } from "@/components/trace/TraceMark";
import { isNumericCell } from "@/lib/traceFormat";
import { useTraceApply } from "@/hooks/useTraceApply";
import { useTrace, type TraceBlock } from "@/contexts/TraceContext";
import { cn } from "@/lib/utils";

type Proposal = Extract<TraceBlock, { t: "proposal" }>;

const KIND_LABEL: Record<Proposal["kind"], string> = {
  categorize: "trace.kindCategorize",
  budget: "trace.kindBudget",
};

/**
 * The trust primitive: a change described in full — what, how much, and
 * the exact rows — with a single button that applies it and another that
 * puts it back. Nothing here writes until the user says so, except under
 * the `auto` agency setting, where it writes on arrival and says so.
 */
export function TraceProposal({ block, turnId, index }: { block: Proposal; turnId: string; index: number }) {
  const { t } = useTranslation();
  const { agency } = useTrace();
  const { apply, undo, busyId } = useTraceApply();
  const key = `${turnId}-${index}`;

  const [state, setState] = useState<"idle" | "applied" | "dismissed">("idle");
  const [activityId, setActivityId] = useState<string | null>(null);
  // Guards the standing-rule auto-apply so it fires at most once per
  // proposal — including after an explicit undo, which must not be
  // immediately re-applied.
  const autoTried = useRef(false);
  const readonly = agency === "read";
  const busy = busyId === key;

  // Standing-rule mode: apply on arrival, once, then behave exactly like a
  // confirmed proposal (including Undo) so the user is never left without
  // a way back.
  useEffect(() => {
    if (agency !== "auto" || autoTried.current || block.changes.length === 0) return;
    autoTried.current = true;
    void apply(block, key).then((res) => {
      if (res) {
        setActivityId(res.activityId);
        setState("applied");
      }
    });
  }, [agency, apply, block, key]);

  const onApply = async () => {
    const res = await apply(block, key);
    if (res) {
      setActivityId(res.activityId);
      setState("applied");
    }
  };

  const onUndo = async () => {
    if (!activityId) return;
    if (await undo(activityId, key)) {
      setState("idle");
      setActivityId(null);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        state === "applied"
          ? "border-primary/40 bg-primary/[0.04]"
          : state === "dismissed"
            ? "border-line bg-bg-subtle/40 opacity-70"
            : "border-line bg-card",
      )}
    >
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
          <TraceMark size="sm" />
          {state === "applied"
            ? t("trace.proposalApplied", { defaultValue: "Trace applied" })
            : readonly
              ? t("trace.proposalReadOnly", { defaultValue: "Trace suggests · read-only" })
              : t(KIND_LABEL[block.kind], { defaultValue: "Trace proposes" })}
        </div>
        <div className="mt-2 text-sm font-semibold tracking-tight">{block.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{block.summary}</div>
      </div>

      <div className="px-4 py-2.5 flex items-start gap-2 border-y border-line bg-bg-subtle/50 text-xs">
        <BarChart3 className="h-3.5 w-3.5 mt-px flex-shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          <b className="text-foreground font-medium">
            {t("trace.impact", { defaultValue: "Impact" })}
          </b>{" "}
          — {block.impact}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {block.diff.cols.map((c, i) => (
                <th
                  key={c}
                  className={cn(
                    "px-4 py-2 font-medium text-muted-foreground text-[10.5px] uppercase tracking-[0.06em] whitespace-nowrap",
                    i === 0 ? "text-left" : "text-right",
                  )}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.diff.rows.map((row, ri) => (
              <tr key={ri} className="border-t border-line">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "px-4 py-2 whitespace-nowrap",
                      ci === 0
                        ? "text-left font-medium"
                        : isNumericCell(cell)
                          ? "text-right font-mono tabular-nums"
                          : "text-right text-muted-foreground",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {block.note && (
        <div className="px-4 py-2.5 flex items-start gap-2 border-t border-line text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-px flex-shrink-0" />
          <span>{block.note}</span>
        </div>
      )}

      <div className="px-4 py-3 border-t border-line flex flex-wrap items-center gap-2">
        {state === "idle" && !readonly && (
          <>
            <Button size="sm" className="h-8 gap-1.5" onClick={onApply} disabled={busy}>
              <Check className="h-3.5 w-3.5" />
              {block.primary}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground"
              onClick={() => setState("dismissed")}
              disabled={busy}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              {t("trace.dismiss", { defaultValue: "Dismiss" })}
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {t("trace.reversible", { defaultValue: "Reversible from Trace activity" })}
            </span>
          </>
        )}

        {state === "idle" && readonly && (
          <span className="text-[11px] text-muted-foreground">
            {t("trace.noWriteAccess", {
              defaultValue: "Trace has no write access — change this in Settings to apply proposals.",
            })}
          </span>
        )}

        {state === "applied" && (
          <>
            <Check className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs">
              <b className="font-medium">{t("trace.appliedLabel", { defaultValue: "Applied." })}</b>{" "}
              <span className="text-muted-foreground">
                {agency === "auto"
                  ? t("trace.appliedAuto", { defaultValue: "Ran automatically under your standing rule." })
                  : t("trace.appliedLogged", { defaultValue: "Logged to activity." })}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 ml-auto gap-1.5"
              onClick={onUndo}
              disabled={busy}
            >
              <Undo2 className="h-3 w-3" />
              {t("trace.undo", { defaultValue: "Undo" })}
            </Button>
          </>
        )}

        {state === "dismissed" && (
          <>
            <span className="text-[11px] text-muted-foreground">
              {t("trace.dismissed", { defaultValue: "Dismissed." })}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 ml-auto text-muted-foreground"
              onClick={() => setState("idle")}
            >
              {t("trace.restore", { defaultValue: "Restore" })}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
