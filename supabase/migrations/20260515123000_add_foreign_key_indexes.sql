-- Add covering indexes for foreign keys flagged by the Supabase
-- performance advisor. Without these, FK lookups and ON DELETE cascades
-- (e.g. deleting a debt/account) fall back to sequential scans, which
-- degrades as per-user transaction/payment volume grows.
--
-- The advisor also reports a few "unused" indexes (idx_categories_user_id,
-- idx_transaction_categories_user, etc.). They are intentionally NOT
-- dropped: they back RLS user_id predicates and read as unused only
-- because current row counts are tiny enough for the planner to pick a
-- seq scan. They become essential at scale.

CREATE INDEX IF NOT EXISTS idx_balance_recalculation_history_account_id
  ON public.balance_recalculation_history(account_id);

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id
  ON public.debt_payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_user_id
  ON public.debt_payments(user_id);

CREATE INDEX IF NOT EXISTS idx_debts_category_id
  ON public.debts(category_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_id
  ON public.debts(user_id);

CREATE INDEX IF NOT EXISTS idx_installment_payments_account_id
  ON public.installment_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_installment_payments_category_id
  ON public.installment_payments(category_id);
CREATE INDEX IF NOT EXISTS idx_installment_payments_user_id
  ON public.installment_payments(user_id);

CREATE INDEX IF NOT EXISTS idx_notification_logs_category_id
  ON public.notification_logs(category_id);

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_account_id
  ON public.recurring_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_category_id
  ON public.recurring_transactions(category_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_debt_payments_debt_id
  ON public.scheduled_debt_payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_debt_payments_user_id
  ON public.scheduled_debt_payments(user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_transfer_to_account_id
  ON public.transactions(transfer_to_account_id);
