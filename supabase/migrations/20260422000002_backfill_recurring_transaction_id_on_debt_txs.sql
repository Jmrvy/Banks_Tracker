-- Backfill recurring_transaction_id on orphan debt-linked auto-processed transactions.
-- Context: previous versions of the cron edge function (process-recurring-transactions)
-- did not set recurring_transaction_id when creating auto transactions for debt-linked
-- recurrings. This link is now required so that edits/deletes on the transaction
-- propagate to the linked debt_payment and keep debt.remaining_amount consistent.
--
-- Strategy: for each transaction whose description ends with "(Récurrence automatique)"
-- and which has recurring_transaction_id IS NULL, find the matching debt_payment by
-- (user_id, date, amount) and set recurring_transaction_id to the recurring transaction
-- linked to that debt.

UPDATE transactions t
SET recurring_transaction_id = rt.id
FROM debt_payments dp
INNER JOIN recurring_transactions rt
  ON rt.debt_id = dp.debt_id
  AND rt.user_id = dp.user_id
WHERE dp.user_id = t.user_id
  AND dp.payment_date = t.transaction_date
  AND ABS(dp.amount - t.amount) < 0.01
  AND t.recurring_transaction_id IS NULL
  AND t.description ILIKE '%(Récurrence automatique)%';
