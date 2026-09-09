ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS recurring_occurrence_date date;

COMMENT ON COLUMN public.transactions.recurring_occurrence_date IS
  'Which scheduled occurrence of recurring_transaction_id this row settles. Set at creation and never moved when the user edits transaction_date / value_date, so re-dating a payment can never make the generator believe a later occurrence already exists.';

-- Backfill: for rows generated or linked so far the accounting date WAS the
-- occurrence date.
UPDATE public.transactions
SET recurring_occurrence_date = transaction_date
WHERE recurring_transaction_id IS NOT NULL
  AND recurring_occurrence_date IS NULL;

-- One known exception: the August rent occurrence the user re-dated to
-- 2 September. Its value date still carries the true occurrence day.
UPDATE public.transactions
SET recurring_occurrence_date = DATE '2026-08-02'
WHERE recurring_transaction_id = '4f610d1e-0c38-4935-af4c-398c2cfed1f6'
  AND transaction_date = DATE '2026-09-02'
  AND value_date = DATE '2026-08-02';

CREATE INDEX IF NOT EXISTS idx_transactions_recurring_occurrence
  ON public.transactions (recurring_transaction_id, recurring_occurrence_date)
  WHERE recurring_transaction_id IS NOT NULL;