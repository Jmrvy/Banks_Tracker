-- Add installment_payment_id column to transactions table if it doesn't exist
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS installment_payment_id UUID REFERENCES public.installment_payments(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_installment_payment_id ON public.transactions(installment_payment_id);

-- Retroactively link existing transactions to their installment payments based on description
UPDATE transactions t
SET installment_payment_id = rt.installment_payment_id
FROM recurring_transactions rt
WHERE t.description LIKE rt.description || ' (Récurrence automatique)'
  AND rt.installment_payment_id IS NOT NULL
  AND t.installment_payment_id IS NULL;