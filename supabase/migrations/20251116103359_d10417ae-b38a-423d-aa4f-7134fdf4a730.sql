-- Add new fields to debts table for payment schedule
ALTER TABLE public.debts ADD COLUMN payment_frequency TEXT;
ALTER TABLE public.debts ADD COLUMN payment_amount NUMERIC DEFAULT 0;
ALTER TABLE public.debts ADD COLUMN loan_type TEXT DEFAULT 'amortizable';

-- Add constraint for payment_frequency
ALTER TABLE public.debts ADD CONSTRAINT debt_payment_frequency_check 
  CHECK (payment_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'custom'));

-- Add constraint for loan_type
ALTER TABLE public.debts ADD CONSTRAINT debt_loan_type_check 
  CHECK (loan_type IN ('amortizable', 'bullet'));

-- Create table for scheduled payments
CREATE TABLE public.scheduled_debt_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  scheduled_date DATE NOT NULL,
  scheduled_amount NUMERIC NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  actual_amount NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on scheduled_debt_payments
ALTER TABLE public.scheduled_debt_payments ENABLE ROW LEVEL SECURITY;

-- Create policies for scheduled_debt_payments
CREATE POLICY "Users can view own scheduled payments"
  ON public.scheduled_debt_payments
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own scheduled payments"
  ON public.scheduled_debt_payments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled payments"
  ON public.scheduled_debt_payments
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled payments"
  ON public.scheduled_debt_payments
  FOR DELETE
  USING (auth.uid() = user_id);