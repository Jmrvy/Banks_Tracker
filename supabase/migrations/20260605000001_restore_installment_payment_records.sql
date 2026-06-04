-- Restore installment_payment_records to support custom (personalized)
-- schedules.
--
-- The table was dropped earlier when installment plans were uniform
-- (fixed amount × fixed frequency) and the recurring transaction system
-- was enough. With personalized schedules a plan needs one row per
-- installment, each with its own date and amount — so we bring the
-- table back with the same shape used by scheduled_debt_payments so
-- the recurring processor can reuse that pattern.
--
-- Uniform installment plans (no records) keep working through the
-- legacy installment_amount + frequency path; only plans with records
-- are routed through the new per-record path in the processor.

CREATE TABLE IF NOT EXISTS public.installment_payment_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_payment_id UUID NOT NULL
    REFERENCES public.installment_payments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  /** Planned installment date — what the user chose in the modal. */
  scheduled_date DATE NOT NULL,
  /** Planned installment amount for this row. */
  scheduled_amount NUMERIC NOT NULL CHECK (scheduled_amount > 0),
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  /** Set by the processor when this record is materialized. */
  paid_date DATE,
  actual_amount NUMERIC,
  /** Link back to the transaction the processor created for this row. */
  transaction_id UUID
    REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS installment_payment_records_plan_idx
  ON public.installment_payment_records (installment_payment_id);

CREATE INDEX IF NOT EXISTS installment_payment_records_user_due_idx
  ON public.installment_payment_records (user_id, scheduled_date)
  WHERE is_paid = FALSE;

CREATE INDEX IF NOT EXISTS installment_payment_records_transaction_idx
  ON public.installment_payment_records (transaction_id)
  WHERE transaction_id IS NOT NULL;

ALTER TABLE public.installment_payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own installment payment records"
  ON public.installment_payment_records
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own installment payment records"
  ON public.installment_payment_records
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own installment payment records"
  ON public.installment_payment_records
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own installment payment records"
  ON public.installment_payment_records
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_installment_payment_records_updated_at
  BEFORE UPDATE ON public.installment_payment_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
