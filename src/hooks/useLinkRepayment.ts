import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Attaches an expense that repays earlier income to the income it settles.
 *
 * The mirror of useLinkRefund. A refund is income giving back an expense; an
 * advance is income you owe back, settled by an expense. Without the link an
 * advance inflates one month's income and its repayment reads as spending in
 * another — and excluding both from statistics is not the answer either,
 * because then neither month reflects money that genuinely moved.
 */
export interface RepaymentCandidate {
  id: string;
  description: string;
  amount: number;
  repaid_amount: number;
  /** What is still outstanding on this income. */
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

function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / new Set([...ta, ...tb]).size;
}

export const useLinkRepayment = () => {
  const { user } = useAuth();

  /** Income this expense could plausibly be repaying, best first. */
  const findCandidates = useCallback(
    async (repayment: {
      id: string;
      amount: number;
      description: string;
      transaction_date: string;
      account_id: string;
    }): Promise<RepaymentCandidate[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('transactions')
        .select('id, description, amount, repaid_amount, transaction_date, category_id, account_id, categories(name)')
        .eq('user_id', user.id)
        .eq('type', 'income')
        // Money cannot be paid back before it was received.
        .lte('transaction_date', repayment.transaction_date)
        .is('refund_of_transaction_id', null)
        .order('transaction_date', { ascending: false })
        .limit(400);
      if (error) throw error;

      return (data ?? [])
        .map((t: any) => {
          const amount = Number(t.amount);
          const repaid = Number(t.repaid_amount ?? 0);
          const remaining = Math.max(0, amount - repaid);
          const days =
            Math.abs(
              (new Date(repayment.transaction_date).getTime() - new Date(t.transaction_date).getTime()) /
                86_400_000,
            ) || 0;

          const exact = Math.abs(remaining - repayment.amount) < 0.005 ? 0.5 : 0;
          const covers = remaining >= repayment.amount - 0.005 ? 0.1 : 0;
          const wording = similarity(t.description ?? '', repayment.description) * 0.25;
          const recency = Math.max(0, 1 - days / 180) * 0.1;
          const account = t.account_id === repayment.account_id ? 0.05 : 0;

          return {
            id: t.id,
            description: t.description,
            amount,
            repaid_amount: repaid,
            remaining,
            transaction_date: t.transaction_date,
            category_id: t.category_id,
            category_name: t.categories?.name ?? null,
            account_id: t.account_id,
            score: exact + covers + wording + recency + account,
          };
        })
        .filter((c) => c.remaining > 0.005)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25);
    },
    [user],
  );

  /**
   * Links the repayment to the income it settles.
   *
   * The expense adopts the income's category and stops counting as
   * spending; the income counts net of what has been repaid. Both sides
   * keep their amounts, so the account balance is untouched — the money
   * really did move, twice.
   */
  const linkRepayment = useCallback(
    async (repaymentId: string, incomeId: string) => {
      if (!user) return { error: { message: 'Not authenticated' } };

      const [{ data: repayment }, { data: income }] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, amount, type')
          .eq('id', repaymentId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('transactions')
          .select('id, amount, repaid_amount, category_id, type')
          .eq('id', incomeId)
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (!repayment || !income) return { error: { message: 'Transaction not found' } };
      if (repayment.type !== 'expense') {
        return { error: { message: 'Only an expense can repay an advance' } };
      }
      if (income.type !== 'income') {
        return { error: { message: 'A repayment must point at income' } };
      }

      const repaid = Number(income.repaid_amount ?? 0);
      const remaining = Number(income.amount) - repaid;
      if (Number(repayment.amount) > remaining + 0.005) {
        return { error: { message: `That income only has ${remaining.toFixed(2)} left outstanding.` } };
      }

      const { error: linkError } = await supabase
        .from('transactions')
        .update({
          repayment_of_transaction_id: incomeId,
          category_id: income.category_id,
        })
        .eq('id', repaymentId)
        .eq('user_id', user.id);
      if (linkError) return { error: linkError };

      const { error: bumpError } = await supabase
        .from('transactions')
        .update({ repaid_amount: repaid + Number(repayment.amount) })
        .eq('id', incomeId)
        .eq('user_id', user.id);
      if (bumpError) {
        // A link without the matching total would drop the repayment from
        // spending without removing it from income — the money vanishing
        // from both sides. Undo rather than half-apply.
        await supabase
          .from('transactions')
          .update({ repayment_of_transaction_id: null })
          .eq('id', repaymentId)
          .eq('user_id', user.id);
        return { error: bumpError };
      }

      return { error: null };
    },
    [user],
  );

  /**
   * Detaches a repayment from the advance it settled.
   *
   * The mirror of unlinkRefund: the income's repaid_amount comes back down
   * and the borrowed category goes with the link, since an expense may only
   * hold an income category while it is a linked repayment.
   */
  const unlinkRepayment = useCallback(
    async (repaymentId: string) => {
      if (!user) return { error: { message: 'Not authenticated' } };

      const { data: repayment } = await supabase
        .from('transactions')
        .select('id, amount, repayment_of_transaction_id')
        .eq('id', repaymentId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!repayment) return { error: { message: 'Transaction not found' } };
      if (!repayment.repayment_of_transaction_id) return { error: null };

      const { data: income } = await supabase
        .from('transactions')
        .select('id, repaid_amount')
        .eq('id', repayment.repayment_of_transaction_id)
        .eq('user_id', user.id)
        .maybeSingle();

      const { error: clearError } = await supabase
        .from('transactions')
        .update({ repayment_of_transaction_id: null, category_id: null })
        .eq('id', repaymentId)
        .eq('user_id', user.id);
      if (clearError) return { error: clearError };

      if (income) {
        const next = Math.max(0, Number(income.repaid_amount ?? 0) - Number(repayment.amount));
        const { error: bumpError } = await supabase
          .from('transactions')
          .update({ repaid_amount: next })
          .eq('id', income.id)
          .eq('user_id', user.id);
        if (bumpError) {
          await supabase
            .from('transactions')
            .update({ repayment_of_transaction_id: repayment.repayment_of_transaction_id })
            .eq('id', repaymentId)
            .eq('user_id', user.id);
          return { error: bumpError };
        }
      }

      return { error: null };
    },
    [user],
  );

  return { findCandidates, linkRepayment, unlinkRepayment };
};
