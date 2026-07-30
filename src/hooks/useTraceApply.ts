import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";
import type { TraceBlock } from "@/contexts/TraceContext";

type Proposal = Extract<TraceBlock, { t: "proposal" }>;

export interface AppliedProposal {
  /** Row id in `trace_activity` — the handle Undo replays against. */
  activityId: string;
  count: number;
}

/**
 * Applies a Trace proposal under the *user's* session, not the copilot's.
 *
 * Trace only ever describes a change; the write happens here, so RLS,
 * the app's own invariants and the user's confirmation all sit between a
 * suggestion and the ledger. Before writing we read the current values
 * and store their inverse, so Undo restores exactly what was there rather
 * than guessing at a default.
 */
export function useTraceApply() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    if (!user) return;
    queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
    queryClient.invalidateQueries({ queryKey: ["categories", user.id] });
  }, [queryClient, user]);

  const apply = useCallback(
    async (proposal: Proposal, key: string): Promise<AppliedProposal | null> => {
      if (!user) return null;
      setBusyId(key);
      try {
        let undo: Json = {};
        let count = 0;

        if (proposal.kind === "categorize") {
          const ids = proposal.changes
            .map((c) => c.transaction_id)
            .filter((id): id is string => !!id);
          if (ids.length === 0) throw new Error("empty");

          // Snapshot the current categories so Undo can put each row back
          // where it was — including rows that were already categorized.
          const { data: before, error: beforeErr } = await supabase
            .from("transactions")
            .select("id, category_id")
            .in("id", ids)
            .eq("user_id", user.id);
          if (beforeErr) throw beforeErr;
          undo = {
            kind: "categorize",
            changes: (before ?? []).map((row) => ({
              transaction_id: row.id,
              category_id: row.category_id,
            })),
          };

          // Supabase has no bulk "different value per row" update, so the
          // changes are grouped by target category — usually 5–10 groups
          // for a 40-row proposal rather than 40 round trips.
          const byCategory = new Map<string, string[]>();
          for (const change of proposal.changes) {
            if (!change.transaction_id) continue;
            const list = byCategory.get(change.category_id) ?? [];
            list.push(change.transaction_id);
            byCategory.set(change.category_id, list);
          }
          for (const [categoryId, txIds] of byCategory) {
            const { error } = await supabase
              .from("transactions")
              .update({ category_id: categoryId })
              .in("id", txIds)
              .eq("user_id", user.id);
            if (error) throw error;
            count += txIds.length;
          }
        } else {
          const ids = proposal.changes.map((c) => c.category_id);
          const { data: before, error: beforeErr } = await supabase
            .from("categories")
            .select("id, budget")
            .in("id", ids)
            .eq("user_id", user.id);
          if (beforeErr) throw beforeErr;
          undo = {
            kind: "budget",
            changes: (before ?? []).map((row) => ({
              category_id: row.id,
              monthly_budget: row.budget,
            })),
          };

          for (const change of proposal.changes) {
            const { error } = await supabase
              .from("categories")
              .update({ budget: change.monthly_budget })
              .eq("id", change.category_id)
              .eq("user_id", user.id);
            if (error) throw error;
            count += 1;
          }
        }

        const { data: activity, error: logErr } = await supabase
          .from("trace_activity")
          .insert({
            user_id: user.id,
            kind: proposal.kind,
            title: proposal.title,
            detail: proposal.impact,
            payload: { changes: proposal.changes } as unknown as Json,
            undo_payload: undo,
          })
          .select("id")
          .single();
        if (logErr) throw logErr;

        invalidate();
        toast({
          title: t("trace.applied", { defaultValue: "Applied" }),
          description: proposal.title,
        });
        return { activityId: activity.id, count };
      } catch (err) {
        toast({
          title: t("common.error", { defaultValue: "Error" }),
          description:
            (err as Error).message === "empty"
              ? t("trace.nothingToApply", { defaultValue: "Nothing to apply" })
              : t("errors.updateError", { defaultValue: "Could not apply the change" }),
          variant: "destructive",
        });
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [user, toast, t, invalidate],
  );

  const undo = useCallback(
    async (activityId: string, key: string): Promise<boolean> => {
      if (!user) return false;
      setBusyId(key);
      try {
        const { data: row, error: readErr } = await supabase
          .from("trace_activity")
          .select("undo_payload")
          .eq("id", activityId)
          .eq("user_id", user.id)
          .single();
        if (readErr) throw readErr;

        const payload = row.undo_payload as {
          kind: "categorize" | "budget";
          changes: { transaction_id?: string; category_id: string | null; monthly_budget?: number | null }[];
        };

        if (payload.kind === "categorize") {
          for (const change of payload.changes) {
            if (!change.transaction_id) continue;
            const { error } = await supabase
              .from("transactions")
              .update({ category_id: change.category_id })
              .eq("id", change.transaction_id)
              .eq("user_id", user.id);
            if (error) throw error;
          }
        } else {
          for (const change of payload.changes) {
            if (!change.category_id) continue;
            const { error } = await supabase
              .from("categories")
              .update({ budget: change.monthly_budget ?? null })
              .eq("id", change.category_id)
              .eq("user_id", user.id);
            if (error) throw error;
          }
        }

        await supabase
          .from("trace_activity")
          .update({ undone_at: new Date().toISOString() })
          .eq("id", activityId)
          .eq("user_id", user.id);

        invalidate();
        toast({ title: t("trace.undone", { defaultValue: "Reverted" }) });
        return true;
      } catch {
        toast({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("errors.updateError", { defaultValue: "Could not revert the change" }),
          variant: "destructive",
        });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [user, toast, t, invalidate],
  );

  return { apply, undo, busyId };
}
