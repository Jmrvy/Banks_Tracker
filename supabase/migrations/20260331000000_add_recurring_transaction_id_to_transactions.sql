-- Add recurring_transaction_id to transactions so we can track which recurring
-- transaction generated each actual transaction (same pattern as installment_payment_id)
ALTER TABLE public.transactions
ADD COLUMN recurring_transaction_id UUID REFERENCES public.recurring_transactions(id) ON DELETE SET NULL;

-- Index for efficient lookups of transactions by their source recurring transaction
CREATE INDEX idx_transactions_recurring_transaction_id
ON public.transactions(recurring_transaction_id)
WHERE recurring_transaction_id IS NOT NULL;
