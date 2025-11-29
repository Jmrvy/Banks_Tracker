-- Add installment_payment_id column to recurring_transactions table
-- This column links recurring transactions to installment payments

ALTER TABLE public.recurring_transactions
ADD COLUMN installment_payment_id UUID REFERENCES public.installment_payments(id) ON DELETE CASCADE;

-- Create index for better performance when querying by installment_payment_id
CREATE INDEX idx_recurring_transactions_installment_payment_id
ON public.recurring_transactions(installment_payment_id)
WHERE installment_payment_id IS NOT NULL;

-- Add comment to document the column purpose
COMMENT ON COLUMN public.recurring_transactions.installment_payment_id IS
'Links this recurring transaction to an installment payment. When an installment payment is created, a corresponding recurring transaction is automatically created and linked via this foreign key.';
