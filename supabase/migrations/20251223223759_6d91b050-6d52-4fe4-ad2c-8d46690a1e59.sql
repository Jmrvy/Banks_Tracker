-- Add column to link refund transactions to original transactions
ALTER TABLE public.transactions 
ADD COLUMN refund_of_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

-- Add column to track partial refund amount on original transaction
ALTER TABLE public.transactions 
ADD COLUMN refunded_amount numeric DEFAULT 0;

-- Create index for faster lookups
CREATE INDEX idx_transactions_refund_of ON public.transactions(refund_of_transaction_id) WHERE refund_of_transaction_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.transactions.refund_of_transaction_id IS 'Links this income transaction to the original expense that was refunded';
COMMENT ON COLUMN public.transactions.refunded_amount IS 'Total amount that has been refunded for this transaction';