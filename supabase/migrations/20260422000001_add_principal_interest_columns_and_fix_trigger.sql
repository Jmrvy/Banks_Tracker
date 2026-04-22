-- Add principal_amount and interest_amount to debt_payments if missing
ALTER TABLE public.debt_payments
  ADD COLUMN IF NOT EXISTS principal_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_amount NUMERIC DEFAULT 0;

-- Add principal_amount and interest_amount to scheduled_debt_payments if missing
ALTER TABLE public.scheduled_debt_payments
  ADD COLUMN IF NOT EXISTS principal_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_amount NUMERIC DEFAULT 0;

-- Update trigger to use principal_amount (only principal reduces remaining capital)
CREATE OR REPLACE FUNCTION public.update_debt_remaining_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.debts
    SET remaining_amount = remaining_amount - COALESCE(NEW.principal_amount, 0),
        status = CASE
          WHEN (remaining_amount - COALESCE(NEW.principal_amount, 0)) <= 0 THEN 'completed'::debt_status
          ELSE status
        END
    WHERE id = NEW.debt_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.debts
    SET remaining_amount = remaining_amount + COALESCE(OLD.principal_amount, 0),
        status = CASE
          WHEN status = 'completed'::debt_status AND (remaining_amount + COALESCE(OLD.principal_amount, 0)) > 0 THEN 'active'::debt_status
          ELSE status
        END
    WHERE id = OLD.debt_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle principal_amount changes
    IF COALESCE(NEW.principal_amount, 0) != COALESCE(OLD.principal_amount, 0) THEN
      UPDATE public.debts
      SET remaining_amount = remaining_amount + COALESCE(OLD.principal_amount, 0) - COALESCE(NEW.principal_amount, 0),
          status = CASE
            WHEN (remaining_amount + COALESCE(OLD.principal_amount, 0) - COALESCE(NEW.principal_amount, 0)) <= 0 THEN 'completed'::debt_status
            WHEN status = 'completed'::debt_status AND (remaining_amount + COALESCE(OLD.principal_amount, 0) - COALESCE(NEW.principal_amount, 0)) > 0 THEN 'active'::debt_status
            ELSE status
          END
      WHERE id = NEW.debt_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate trigger to include UPDATE events
DROP TRIGGER IF EXISTS update_debt_amount_on_payment ON public.debt_payments;
CREATE TRIGGER update_debt_amount_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.debt_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_debt_remaining_amount();

-- Backfill existing debt_payments: if principal_amount is 0 but amount > 0,
-- assume the full amount was principal (for legacy data before the split was added)
-- Skip rows where principal_amount was already explicitly set
UPDATE public.debt_payments
SET principal_amount = amount
WHERE principal_amount = 0 AND interest_amount = 0 AND amount > 0;
