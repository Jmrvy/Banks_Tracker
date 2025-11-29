-- Quick fix: Add missing column to recurring_transactions
-- Run this SQL in your Supabase SQL Editor NOW to fix the error

-- Step 1: Add the column
ALTER TABLE public.recurring_transactions
ADD COLUMN IF NOT EXISTS installment_payment_id UUID;

-- Step 2: Add foreign key constraint
ALTER TABLE public.recurring_transactions
ADD CONSTRAINT fk_recurring_transactions_installment_payment
FOREIGN KEY (installment_payment_id)
REFERENCES public.installment_payments(id)
ON DELETE CASCADE;

-- Step 3: Add index for performance
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_installment_payment_id
ON public.recurring_transactions(installment_payment_id)
WHERE installment_payment_id IS NOT NULL;

-- Done! You can now create paiements échelonnés
