-- Add a history table to persist recalculation results
CREATE TABLE IF NOT EXISTS public.balance_recalculation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  account_name TEXT NOT NULL,
  old_balance NUMERIC NOT NULL,
  new_balance NUMERIC NOT NULL,
  difference NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups by run
CREATE INDEX idx_recalc_history_run_id ON public.balance_recalculation_history(run_id);
CREATE INDEX idx_recalc_history_created_at ON public.balance_recalculation_history(created_at DESC);

-- Enable RLS
ALTER TABLE public.balance_recalculation_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their recalculation history
CREATE POLICY "Users can view recalculation history"
  ON public.balance_recalculation_history
  FOR SELECT
  TO authenticated
  USING (
    account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
    OR account_id IS NULL
  );

-- Update the recalculate function to log results
CREATE OR REPLACE FUNCTION public.recalculate_account_balances()
RETURNS TABLE(account_id UUID, account_name TEXT, old_balance NUMERIC, new_balance NUMERIC, difference NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acc RECORD;
  tx RECORD;
  computed_balance NUMERIC;
  old_bal NUMERIC;
  current_run_id UUID := gen_random_uuid();
BEGIN
  FOR acc IN SELECT a.id, a.name, a.balance FROM public.accounts a
  LOOP
    old_bal := acc.balance;
    computed_balance := 0;

    FOR tx IN
      SELECT t.type, t.amount, t.account_id, t.transfer_to_account_id, COALESCE(t.transfer_fee, 0) AS transfer_fee
      FROM public.transactions t
      WHERE t.account_id = acc.id OR t.transfer_to_account_id = acc.id
      ORDER BY t.transaction_date ASC, t.created_at ASC
    LOOP
      IF tx.account_id = acc.id THEN
        IF tx.type = 'income' THEN
          computed_balance := computed_balance + tx.amount;
        ELSIF tx.type = 'expense' THEN
          computed_balance := computed_balance - tx.amount;
        ELSIF tx.type = 'transfer' THEN
          computed_balance := computed_balance - tx.amount - tx.transfer_fee;
        END IF;
      ELSIF tx.transfer_to_account_id = acc.id THEN
        computed_balance := computed_balance + tx.amount;
      END IF;
    END LOOP;

    -- Update the account balance
    UPDATE public.accounts SET balance = computed_balance WHERE id = acc.id;

    -- Log to history
    INSERT INTO public.balance_recalculation_history (run_id, account_id, account_name, old_balance, new_balance, difference)
    VALUES (current_run_id, acc.id, acc.name, old_bal, computed_balance, computed_balance - old_bal);

    -- Return the result for visibility
    account_id := acc.id;
    account_name := acc.name;
    old_balance := old_bal;
    new_balance := computed_balance;
    difference := computed_balance - old_bal;
    RETURN NEXT;
  END LOOP;
END;
$$;
