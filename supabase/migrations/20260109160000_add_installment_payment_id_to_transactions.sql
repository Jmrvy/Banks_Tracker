-- Add installment_payment_id to transactions table to link transactions to their source installment payment
-- This allows tracking reimbursement transactions in the Savings page

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS installment_payment_id UUID REFERENCES public.installment_payments(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transactions_installment_payment_id ON public.transactions(installment_payment_id);

-- Add comment for documentation
COMMENT ON COLUMN public.transactions.installment_payment_id IS 'Links transaction to source installment payment for tracking reimbursements in savings';
