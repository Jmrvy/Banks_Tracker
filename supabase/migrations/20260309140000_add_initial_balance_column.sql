-- Add initial_balance column to accounts table
-- This stores the starting balance separately so recalculations don't lose it
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS initial_balance NUMERIC NOT NULL DEFAULT 0;

-- Backfill: for existing accounts, we can't know the original initial balance,
-- so we compute it as: current balance - sum of all transactions
-- This ensures recalculate_account_balances() will produce the same current balance
DO $$
DECLARE
  acc RECORD;
  tx_sum NUMERIC;
BEGIN
  FOR acc IN SELECT id, balance FROM public.accounts
  LOOP
    SELECT COALESCE(SUM(
      CASE
        WHEN t.account_id = acc.id AND t.type = 'income' THEN t.amount
        WHEN t.account_id = acc.id AND t.type = 'expense' THEN -t.amount
        WHEN t.account_id = acc.id AND t.type = 'transfer' THEN -(t.amount + COALESCE(t.transfer_fee, 0))
        WHEN t.transfer_to_account_id = acc.id THEN t.amount
        ELSE 0
      END
    ), 0) INTO tx_sum
    FROM public.transactions t
    WHERE t.account_id = acc.id OR t.transfer_to_account_id = acc.id;

    UPDATE public.accounts SET initial_balance = acc.balance - tx_sum WHERE id = acc.id;
  END LOOP;
END;
$$;

-- Update recalculate_account_balances() to start from initial_balance
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
  FOR acc IN SELECT a.id, a.name, a.balance, a.initial_balance FROM public.accounts a
  LOOP
    old_bal := acc.balance;
    computed_balance := COALESCE(acc.initial_balance, 0);

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

    UPDATE public.accounts SET balance = computed_balance WHERE id = acc.id;

    -- Log to history (if table exists from previous migration)
    INSERT INTO public.balance_recalculation_history (run_id, account_id, account_name, old_balance, new_balance, difference)
    VALUES (current_run_id, acc.id, acc.name, old_bal, computed_balance, computed_balance - old_bal);

    account_id := acc.id;
    account_name := acc.name;
    old_balance := old_bal;
    new_balance := computed_balance;
    difference := computed_balance - old_bal;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Update get_account_balance_at_date() to start from initial_balance
CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(
  p_account_id UUID,
  p_date DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  computed_balance NUMERIC;
  tx RECORD;
BEGIN
  SELECT COALESCE(initial_balance, 0) INTO computed_balance
  FROM public.accounts WHERE id = p_account_id;

  FOR tx IN
    SELECT t.type, t.amount, t.account_id, t.transfer_to_account_id, COALESCE(t.transfer_fee, 0) AS transfer_fee
    FROM public.transactions t
    WHERE (t.account_id = p_account_id OR t.transfer_to_account_id = p_account_id)
      AND t.transaction_date <= p_date
    ORDER BY t.transaction_date ASC, t.created_at ASC
  LOOP
    IF tx.account_id = p_account_id THEN
      IF tx.type = 'income' THEN
        computed_balance := computed_balance + tx.amount;
      ELSIF tx.type = 'expense' THEN
        computed_balance := computed_balance - tx.amount;
      ELSIF tx.type = 'transfer' THEN
        computed_balance := computed_balance - tx.amount - tx.transfer_fee;
      END IF;
    ELSIF tx.transfer_to_account_id = p_account_id THEN
      computed_balance := computed_balance + tx.amount;
    END IF;
  END LOOP;

  RETURN computed_balance;
END;
$$;
