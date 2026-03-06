
-- Create installment_payment_history table for tracking changes
CREATE TABLE public.installment_payment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_payment_id UUID NOT NULL REFERENCES public.installment_payments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  change_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.installment_payment_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own history" ON public.installment_payment_history
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own history" ON public.installment_payment_history
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own history" ON public.installment_payment_history
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Index for performance
CREATE INDEX idx_installment_payment_history_payment_id ON public.installment_payment_history(installment_payment_id);
CREATE INDEX idx_installment_payment_history_user_id ON public.installment_payment_history(user_id);
