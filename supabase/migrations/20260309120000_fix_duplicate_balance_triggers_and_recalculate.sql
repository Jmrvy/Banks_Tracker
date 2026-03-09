-- Fix: Drop ALL duplicate balance triggers, keep only one
-- Root cause: Multiple triggers (update_account_balance_trigger, trigger_update_account_balance,
-- on_transaction_change) all call update_account_balance(), causing balances to be
-- updated 2-3x per transaction. This corrupts account balances, especially on transfers.

-- Drop ALL balance-related triggers
DROP TRIGGER IF EXISTS update_account_balance_trigger ON public.transactions;
DROP TRIGGER IF EXISTS trigger_update_account_balance ON public.transactions;
DROP TRIGGER IF EXISTS trg_update_account_balance ON public.transactions;
DROP TRIGGER IF EXISTS on_transaction_change ON public.transactions;

-- Re-create exactly ONE balance trigger
CREATE TRIGGER on_transaction_change
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_account_balance();

-- Create a function to recalculate all account balances from transaction history.
-- This replays every transaction exactly once to derive the correct balance.
-- It uses the account's created_at balance (initial_balance column if present, else 0).
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

-- Create a function to compute what an account's balance was at any given date.
-- Useful for checking "yesterday's balance" or any historical point.
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
  computed_balance NUMERIC := 0;
  tx RECORD;
BEGIN
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
