
-- 1) Scope recalculate_account_balances() to the caller's accounts
CREATE OR REPLACE FUNCTION public.recalculate_account_balances()
 RETURNS TABLE(account_id uuid, account_name text, old_balance numeric, new_balance numeric, difference numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  acc RECORD;
  tx RECORD;
  computed_balance NUMERIC;
  old_bal NUMERIC;
  current_run_id UUID := gen_random_uuid();
  current_uid UUID := auth.uid();
BEGIN
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  FOR acc IN
    SELECT a.id, a.name, a.balance, a.initial_balance
    FROM public.accounts a
    WHERE a.user_id = current_uid
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
$function$;

-- 2) Scope get_account_balance_at_date() to the caller's account
CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(p_account_id uuid, p_date date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  computed_balance NUMERIC;
  tx RECORD;
  current_uid UUID := auth.uid();
BEGIN
  IF current_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(initial_balance, 0) INTO computed_balance
  FROM public.accounts
  WHERE id = p_account_id AND user_id = current_uid;

  IF NOT FOUND THEN
    RETURN NULL;
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
$function$;

-- 3) Lock down EXECUTE on these SECURITY DEFINER RPCs
REVOKE EXECUTE ON FUNCTION public.recalculate_account_balances() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_account_balance_at_date(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_account_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balance_at_date(uuid, date) TO authenticated;

-- 4) Tighten balance_recalculation_history SELECT policy: drop the
--    "OR account_id IS NULL" clause so users only see their own rows.
DROP POLICY IF EXISTS "Users can view recalculation history" ON public.balance_recalculation_history;
CREATE POLICY "Users can view own recalculation history"
  ON public.balance_recalculation_history
  FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE user_id = (SELECT auth.uid())
    )
  );

-- 5) Add UPDATE policy for transaction_categories (owner-scoped)
CREATE POLICY "Users can update their own transaction categories"
  ON public.transaction_categories
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
