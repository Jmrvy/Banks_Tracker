import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Attaches an income transaction that is already recorded to the expense it
 * refunds.
 *
 * createRefund covers the other direction — recording a refund you have just
 * received — but there was no way to say "this income I imported months ago
 * was money coming back on that expense". Without it a reimbursement stays
 * income, the expense keeps its gross amount, and the budget reads a cost
 * that was returned.
 */
export interface RefundCandidate {
  id: string;
  description: string;
  amount: number;
  refunded_amount: number;
  /** What is still unrefunded on this expense. */
  remaining: number;
  transaction_date: string;
  category_id: string | null;
  category_name: string | null;
  account_id: string;
  /** 0..1, higher is a better match. Ordering only — never auto-applied. */
  score: number;
}

const WORD = /[^\p{L}\p{N}]+/u;

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(WORD)
      .filter((w) => w.length >= 3),
  );

/** Jaccard overlap of the two descriptions' words. */
function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / new Set([...ta, ...tb]).size;
}

export const useLinkRefund = () => {
  const { user } = useAuth();

  /**
   * Expenses this income could plausibly be refunding, best first.
   *
   * Ranked, never chosen: matching a reimbursement to its purchase is a
   * judgement about what actually happened, and a wrong guess silently
   * understates a real cost. The caller confirms.
   */
  const findCandidates = useCallback(
    async (refund: {
      id: string;
      amount: number;
      description: string;
      transaction_date: string;
      account_id: string;
    }): Promise<RefundCandidate[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('transactions')
        .select('id, description, amount, refunded_amount, transaction_date, category_id, account_id, categories(name)')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        // A refund cannot precede what it refunds.
        .lte('transaction_date', refund.transaction_date)
        .order('transaction_date', { ascending: false })
        .limit(400);
      if (error) throw error;

      return (data ?? [])
        .map((t: any) => {
          const amount = Number(t.amount);
          const refunded = Number(t.refunded_amount ?? 0);
          const remaining = Math.max(0, amount - refunded);
          const sameAccount = t.account_id === refund.account_id;
          const days =
            Math.abs(
              (new Date(refund.transaction_date).getTime() - new Date(t.transaction_date).getTime()) / 86_400_000,
            ) || 0;

          // Exact remaining amount is the strongest signal by far; wording
          // and proximity only break ties between equally plausible rows.
          // A surplus on an already-settled expense matches its gross
          // instead, which is how an over-refund finds its original.
          const exact =
            Math.abs(remaining - refund.amount) < 0.005 || Math.abs(amount - refund.amount) < 0.005
              ? 0.5
              : 0;
          const covers = remaining >= refund.amount - 0.005 ? 0.1 : 0;
          const wording = similarity(t.description ?? '', refund.description) * 0.25;
          const recency = Math.max(0, 1 - days / 120) * 0.1;
          const account = sameAccount ? 0.05 : 0;

          return {
            id: t.id,
            description: t.description,
            amount,
            refunded_amount: refunded,
            remaining,
            transaction_date: t.transaction_date,
            category_id: t.category_id,
            category_name: t.categories?.name ?? null,
            account_id: t.account_id,
            score: exact + covers + wording + recency + account,
          };
        })
        // Fully-refunded expenses stay in the list: a surplus attaches to
        // the expense it exceeded, and excluding them is what left the
        // excess stranded as income no budget could see.
        .sort((a, b) => b.score - a.score)
        .slice(0, 25);
    },
    [user],
  );

  /**
   * Links the refund to the chosen expense.
   *
   * Mirrors what createRefund writes, so a row linked here is
   * indistinguishable from one recorded as a refund at the time: it adopts
   * the expense's category, leaves the statistics (the original's net is
   * what counts), and raises refunded_amount by what it covers.
   */
  const linkRefund = useCallback(
    async (refundId: string, originalId: string) => {
      if (!user) return { error: { message: 'Not authenticated' } };

      const [{ data: refund }, { data: original }] = await Promise.all([
        supabase.from('transactions').select('id, amount, type').eq('id', refundId).eq('user_id', user.id).maybeSingle(),
        supabase
          .from('transactions')
          .select('id, amount, refunded_amount, category_id')
          .eq('id', originalId)
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (!refund || !original) return { error: { message: 'Transaction not found' } };
      if (refund.type !== 'income') return { error: { message: 'Only an income transaction can be a refund' } };

      const refunded = Number(original.refunded_amount ?? 0);
      // Deliberately no cap. Getting back more than you paid is a real
      // outcome, and refusing to link the surplus was what forced it into a
      // separate income row that no budget could see.

      const { error: linkError } = await supabase
        .from('transactions')
        .update({
          refund_of_transaction_id: originalId,
          category_id: original.category_id,
          include_in_stats: false,
        })
        .eq('id', refundId)
        .eq('user_id', user.id);
      if (linkError) return { error: linkError };

      const { error: bumpError } = await supabase
        .from('transactions')
        .update({ refunded_amount: refunded + Number(refund.amount) })
        .eq('id', originalId)
        .eq('user_id', user.id);
      if (bumpError) {
        // Leaving the link without the matching total would understate the
        // expense's net, so undo rather than half-apply it.
        await supabase
          .from('transactions')
          .update({ refund_of_transaction_id: null, include_in_stats: true })
          .eq('id', refundId)
          .eq('user_id', user.id);
        return { error: bumpError };
      }

      return { error: null };
    },
    [user],
  );

  return { findCandidates, linkRefund };
};
