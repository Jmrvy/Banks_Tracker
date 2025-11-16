-- Create debt_type enum
CREATE TYPE public.debt_type AS ENUM ('loan_given', 'loan_received', 'credit');

-- Create debt_status enum
CREATE TYPE public.debt_status AS ENUM ('active', 'completed', 'defaulted');

-- Create debts table
CREATE TABLE public.debts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  description TEXT NOT NULL,
  type public.debt_type NOT NULL,
  total_amount NUMERIC NOT NULL,
  remaining_amount NUMERIC NOT NULL,
  interest_rate NUMERIC DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE,
  status public.debt_status NOT NULL DEFAULT 'active',
  contact_name TEXT,
  contact_info TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create debt_payments table for tracking payments
CREATE TABLE public.debt_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on debts
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

-- Create policies for debts
CREATE POLICY "Users can view own debts"
  ON public.debts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own debts"
  ON public.debts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own debts"
  ON public.debts
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own debts"
  ON public.debts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable RLS on debt_payments
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

-- Create policies for debt_payments
CREATE POLICY "Users can view own debt payments"
  ON public.debt_payments
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own debt payments"
  ON public.debt_payments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own debt payments"
  ON public.debt_payments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updating debts updated_at
CREATE TRIGGER update_debts_updated_at
  BEFORE UPDATE ON public.debts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update remaining amount when payment is added
CREATE OR REPLACE FUNCTION public.update_debt_remaining_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.debts
    SET remaining_amount = remaining_amount - NEW.amount,
        status = CASE 
          WHEN (remaining_amount - NEW.amount) <= 0 THEN 'completed'::debt_status
          ELSE status
        END
    WHERE id = NEW.debt_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.debts
    SET remaining_amount = remaining_amount + OLD.amount,
        status = CASE 
          WHEN status = 'completed'::debt_status THEN 'active'::debt_status
          ELSE status
        END
    WHERE id = OLD.debt_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for automatic remaining amount update
CREATE TRIGGER update_debt_amount_on_payment
  AFTER INSERT OR DELETE ON public.debt_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_debt_remaining_amount();