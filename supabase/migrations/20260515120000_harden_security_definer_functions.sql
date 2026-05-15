-- Security hardening for SECURITY DEFINER functions.
--
-- These functions run with definer privileges and therefore bypass RLS.
-- Previously they accepted/operated on arbitrary accounts with no
-- auth.uid() ownership check, allowing any authenticated user to read
-- another user's balances or trigger a global balance rewrite.
--
-- Fixes:
--   1. get_account_balance_at_date: enforce caller owns the account.
--   2. recalculate_account_balances: scope strictly to the caller's accounts.
--   3. Revoke EXECUTE on internal trigger/helper functions from the
--      anon/authenticated API roles (defense in depth).

-- 1. Cross-user balance disclosure (IDOR) ------------------------------------
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = p_account_id AND a.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Account not found or access denied';
  END IF;

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

-- 2. Global balance tampering ------------------------------------------------
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR acc IN
    SELECT a.id, a.name, a.balance
    FROM public.accounts a
    WHERE a.user_id = auth.uid()
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

    UPDATE public.accounts SET balance = computed_balance WHERE id = acc.id;

    account_id := acc.id;
    account_name := acc.name;
    old_balance := old_bal;
    new_balance := computed_balance;
    difference := computed_balance - old_bal;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 3. Remove internal functions from the public API surface -------------------
-- Postgres grants EXECUTE to PUBLIC by default and anon/authenticated
-- inherit that, so revoking from those roles alone is ineffective - the
-- grant must be removed from PUBLIC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_quick_duplicate_transactions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_account_balance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_debt_remaining_amount() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_account_balance_at_date(UUID, DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_account_balances() FROM PUBLIC;

-- The two reporting functions stay callable by signed-in users (the app
-- uses recalculate_account_balances from Settings); they self-scope to
-- auth.uid() internally. Trigger functions need no grant - triggers fire
-- as the table owner regardless of EXECUTE privilege.
GRANT EXECUTE ON FUNCTION public.get_account_balance_at_date(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_account_balances() TO authenticated;
