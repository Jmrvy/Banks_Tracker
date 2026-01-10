-- Add payment_type column to installment_payments table
-- payment_type: 'reimbursement' (someone repaying user -> savings inflow) or 'payment' (user paying -> expense)

ALTER TABLE public.installment_payments
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'payment' CHECK (payment_type IN ('reimbursement', 'payment'));

-- Update existing records to have default payment_type
UPDATE public.installment_payments SET payment_type = 'payment' WHERE payment_type IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.installment_payments.payment_type IS 'Type of installment: reimbursement (savings inflow) or payment (expense)';