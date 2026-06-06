-- Special budgets: discrete event/trip envelopes (e.g. "NYC Trip").
--
-- A transaction tagged to a special budget is:
--   * still kept under its original category (so the special-budget
--     detail view can show a per-category breakdown)
--   * skipped by the normal category-budget aggregation (so a trip's
--     restaurant bills don't blow up the monthly Restaurants budget)
--   * still part of the global period spend total (no money lost)
--
-- One transaction belongs to at most one special budget. The optional
-- savings_goal_id ties the budget to a savings goal so we can show
-- "saved €X / spent €Y" once the trip is over.

CREATE TABLE IF NOT EXISTS public.special_budgets (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  total_budget    NUMERIC NOT NULL CHECK (total_budget >= 0),
  /** Optional date bounds — used for "suggested transactions" prompts
   *  and for the lifetime/period badge on the Budget page. */
  start_date      DATE,
  end_date        DATE,
  /** planned | active | closed. Closed budgets are read-only and
   *  hidden from active lists. */
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planned', 'active', 'closed')),
  savings_goal_id UUID REFERENCES public.savings_goals(id) ON DELETE SET NULL,
  color           TEXT,
  icon            TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS special_budgets_user_status_idx
  ON public.special_budgets (user_id, status);

CREATE INDEX IF NOT EXISTS special_budgets_savings_goal_idx
  ON public.special_budgets (savings_goal_id)
  WHERE savings_goal_id IS NOT NULL;

ALTER TABLE public.special_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own special budgets"
  ON public.special_budgets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own special budgets"
  ON public.special_budgets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own special budgets"
  ON public.special_budgets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own special budgets"
  ON public.special_budgets FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_special_budgets_updated_at
  BEFORE UPDATE ON public.special_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Per-transaction link. Nullable: most transactions stay unlinked
-- and are counted by the normal category-budget path.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS special_budget_id UUID
    REFERENCES public.special_budgets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_special_budget_idx
  ON public.transactions (special_budget_id)
  WHERE special_budget_id IS NOT NULL;
