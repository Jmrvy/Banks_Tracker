-- Create table for installment payments (paiements en plusieurs fois)
CREATE TABLE IF NOT EXISTS public.installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  remaining_amount NUMERIC NOT NULL,
  installment_amount NUMERIC NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly')),
  start_date DATE NOT NULL,
  next_payment_date DATE NOT NULL,
  end_date DATE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS policies
ALTER TABLE public.installment_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own installment payments"
  ON public.installment_payments
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own installment payments"
  ON public.installment_payments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own installment payments"
  ON public.installment_payments
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own installment payments"
  ON public.installment_payments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create table for tracking individual installment payment records
CREATE TABLE IF NOT EXISTS public.installment_payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  installment_payment_id UUID NOT NULL REFERENCES public.installment_payments(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  is_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS policies for records
ALTER TABLE public.installment_payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own installment payment records"
  ON public.installment_payment_records
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own installment payment records"
  ON public.installment_payment_records
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own installment payment records"
  ON public.installment_payment_records
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own installment payment records"
  ON public.installment_payment_records
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_installment_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_installment_payments_updated_at
  BEFORE UPDATE ON public.installment_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_installment_payments_updated_at();