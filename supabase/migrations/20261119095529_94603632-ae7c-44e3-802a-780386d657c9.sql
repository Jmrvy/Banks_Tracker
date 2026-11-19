ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS parent_account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS initial_fx_rate numeric,
  ADD COLUMN IF NOT EXISTS fx_rate numeric;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_parent_currency_uniq
  ON public.accounts(parent_account_id, currency) WHERE parent_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounts_parent_account_id_idx ON public.accounts(parent_account_id);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS foreign_amount numeric;

-- ---------------------------------------------------------------------------
-- Account validation: a subaccount hangs off a main (base-currency) account of
-- the same user, carries a 3-letter currency and an opening rate, and inherits
-- its parent's bank and type. Main accounts carry no currency (= base).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_account_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  p record;
BEGIN
  IF NEW.parent_account_id IS NULL THEN
    IF NEW.currency IS NOT NULL THEN
      RAISE EXCEPTION 'main_account_has_no_currency';
    END IF;
    NEW.initial_fx_rate := NULL;
    NEW.fx_rate := NULL;
    RETURN NEW;
  END IF;

  IF NEW.parent_account_id = NEW.id THEN
    RAISE EXCEPTION 'account_cannot_be_its_own_parent';
  END IF;

  SELECT id, user_id, parent_account_id, currency, bank, account_type INTO p
  FROM public.accounts WHERE id = NEW.parent_account_id;

  IF p.id IS NULL OR p.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'parent_account_not_found';
  END IF;
  IF p.parent_account_id IS NOT NULL OR p.currency IS NOT NULL THEN
    RAISE EXCEPTION 'parent_must_be_main_account';
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.accounts c WHERE c.parent_account_id = NEW.id) THEN
    RAISE EXCEPTION 'account_with_subaccounts_cannot_become_subaccount';
  END IF;

  IF NEW.currency IS NULL OR NEW.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_currency';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.currency IS DISTINCT FROM NEW.currency
     AND EXISTS (SELECT 1 FROM public.transactions t WHERE t.account_id = NEW.id OR t.transfer_to_account_id = NEW.id) THEN
    RAISE EXCEPTION 'currency_locked_once_used';
  END IF;
  IF NEW.initial_fx_rate IS NULL OR NEW.initial_fx_rate <= 0 THEN
    RAISE EXCEPTION 'invalid_initial_fx_rate';
  END IF;

  NEW.bank := p.bank;
  NEW.account_type := p.account_type;
  IF TG_OP = 'INSERT' OR NEW.fx_rate IS NULL THEN
    NEW.fx_rate := NEW.initial_fx_rate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_account_hierarchy ON public.accounts;
CREATE TRIGGER validate_account_hierarchy
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_account_hierarchy();

-- Parent's bank/type changes flow down to its subaccounts.
CREATE OR REPLACE FUNCTION public.sync_subaccounts_with_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.parent_account_id IS NULL
     AND (NEW.bank IS DISTINCT FROM OLD.bank OR NEW.account_type IS DISTINCT FROM OLD.account_type) THEN
    UPDATE public.accounts SET bank = NEW.bank, account_type = NEW.account_type
    WHERE parent_account_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_subaccounts_with_parent ON public.accounts;
CREATE TRIGGER sync_subaccounts_with_parent
  AFTER UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.sync_subaccounts_with_parent();

-- ---------------------------------------------------------------------------
-- Which amount moves a given account's balance: the foreign leg moves by
-- foreign_amount (its own currency), every other leg by amount (base).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tx_leg_amount(p_account_id uuid, p_amount numeric, p_foreign numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT CASE
    WHEN p_foreign IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.id = p_account_id AND a.currency IS NOT NULL
    ) THEN p_foreign
    ELSE p_amount
  END;
$$;

-- ---------------------------------------------------------------------------
-- Before a transaction is written: fill foreign_amount when the writer only
-- sent one figure (edge functions, MCP, offline queue send `amount` in the
-- account's own currency), and refuse foreign-to-foreign transfers.
-- Named `aa_` so it runs before the duplicate check compares amounts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_foreign_leg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  src_cur text; src_rate numeric;
  dst_cur text; dst_rate numeric;
BEGIN
  SELECT currency, fx_rate INTO src_cur, src_rate FROM public.accounts WHERE id = NEW.account_id;
  IF NEW.type = 'transfer' AND NEW.transfer_to_account_id IS NOT NULL THEN
    SELECT currency, fx_rate INTO dst_cur, dst_rate FROM public.accounts WHERE id = NEW.transfer_to_account_id;
  END IF;

  IF src_cur IS NULL AND dst_cur IS NULL THEN
    NEW.foreign_amount := NULL;
    RETURN NEW;
  END IF;

  IF src_cur IS NOT NULL AND dst_cur IS NOT NULL THEN
    RAISE EXCEPTION 'foreign_to_foreign_transfer_not_supported';
  END IF;

  IF NEW.foreign_amount IS NULL THEN
    IF dst_cur IS NOT NULL THEN
      -- Base money into the subaccount, no rate given: convert at its average.
      NEW.foreign_amount := round(NEW.amount / COALESCE(NULLIF(dst_rate, 0), 1), 2);
    ELSE
      -- Money on/out of the subaccount, given in its own currency.
      NEW.foreign_amount := NEW.amount;
      NEW.amount := round(NEW.amount * COALESCE(src_rate, 1), 2);
    END IF;
  END IF;

  IF NEW.foreign_amount < 0 THEN
    RAISE EXCEPTION 'foreign_amount_must_be_positive';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_transactions_foreign_leg ON public.transactions;
CREATE TRIGGER aa_transactions_foreign_leg
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.prepare_foreign_leg();

-- ---------------------------------------------------------------------------
-- Weighted-average revaluation of one subaccount. Replays its history in
-- accounting order: money converted in adds units at the base amount paid;
-- spending and income are valued at the running average (their `amount` is
-- rewritten); conversions out keep the base amount the user entered and
-- leave the average unchanged. Stores the final average on the account.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revalue_foreign_account(p_account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  acc record;
  tx record;
  units numeric;
  cost numeric;
  rate numeric;
  f numeric;
  new_amt numeric;
BEGIN
  SELECT id, currency, initial_balance, initial_fx_rate, fx_rate INTO acc
  FROM public.accounts WHERE id = p_account_id;
  IF acc.id IS NULL OR acc.currency IS NULL THEN
    RETURN;
  END IF;

  rate := COALESCE(acc.initial_fx_rate, acc.fx_rate, 1);
  units := COALESCE(acc.initial_balance, 0);
  cost := units * rate;

  FOR tx IN
    SELECT t.id, t.type, t.amount, t.foreign_amount, t.account_id, t.transfer_to_account_id,
           COALESCE(t.transfer_fee, 0) AS fee
    FROM public.transactions t
    WHERE t.account_id = p_account_id
       OR (t.type = 'transfer' AND t.transfer_to_account_id = p_account_id)
    ORDER BY t.transaction_date ASC, t.created_at ASC NULLS FIRST, t.id ASC
  LOOP
    f := COALESCE(tx.foreign_amount, tx.amount);

    IF tx.type = 'transfer' AND tx.transfer_to_account_id = p_account_id AND tx.account_id <> p_account_id THEN
      units := units + f;
      cost := cost + tx.amount;
      IF units > 0.000001 THEN
        rate := cost / units;
      END IF;
    ELSIF tx.type = 'transfer' THEN
      units := units - f - tx.fee;
    ELSE
      new_amt := round(f * rate, 2);
      IF new_amt IS DISTINCT FROM tx.amount THEN
        UPDATE public.transactions SET amount = new_amt WHERE id = tx.id;
      END IF;
      IF tx.type = 'income' THEN
        units := units + f;
      ELSE
        units := units - f;
      END IF;
    END IF;

    -- Outflows and income at the average leave the rate where it is; keep
    -- the cost basis consistent with it (negative when overdrawn).
    cost := units * rate;
  END LOOP;

  UPDATE public.accounts SET fx_rate = round(rate, 8)
  WHERE id = p_account_id AND fx_rate IS DISTINCT FROM round(rate, 8);
END;
$$;

REVOKE ALL ON FUNCTION public.revalue_foreign_account(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.revalue_foreign_accounts_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  acc_id uuid;
BEGIN
  -- The revaluation's own writes re-enter this trigger; skip them.
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR acc_id IN
    SELECT DISTINCT a.id
    FROM public.accounts a
    WHERE a.currency IS NOT NULL
      AND a.id IN (
        CASE WHEN TG_OP <> 'INSERT' THEN OLD.account_id END,
        CASE WHEN TG_OP <> 'INSERT' THEN OLD.transfer_to_account_id END,
        CASE WHEN TG_OP <> 'DELETE' THEN NEW.account_id END,
        CASE WHEN TG_OP <> 'DELETE' THEN NEW.transfer_to_account_id END
      )
  LOOP
    PERFORM public.revalue_foreign_account(acc_id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS zz_transactions_revalue_foreign ON public.transactions;
CREATE TRIGGER zz_transactions_revalue_foreign
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.revalue_foreign_accounts_on_change();

CREATE OR REPLACE FUNCTION public.revalue_foreign_account_on_opening_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  IF NEW.currency IS NOT NULL AND (
       NEW.initial_balance IS DISTINCT FROM OLD.initial_balance
    OR NEW.initial_fx_rate IS DISTINCT FROM OLD.initial_fx_rate) THEN
    PERFORM public.revalue_foreign_account(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS zz_accounts_revalue_foreign ON public.accounts;
CREATE TRIGGER zz_accounts_revalue_foreign
  AFTER UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.revalue_foreign_account_on_opening_change();

-- ---------------------------------------------------------------------------
-- Balance trigger: each leg moves by its own currency's figure.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  src_amt numeric;
  dst_amt numeric;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    src_amt := public.tx_leg_amount(OLD.account_id, OLD.amount, OLD.foreign_amount);
    IF OLD.type = 'income' THEN
      UPDATE public.accounts SET balance = balance - src_amt WHERE id = OLD.account_id;
    ELSIF OLD.type = 'expense' THEN
      UPDATE public.accounts SET balance = balance + src_amt WHERE id = OLD.account_id;
    ELSIF OLD.type = 'transfer' THEN
      UPDATE public.accounts SET balance = balance + src_amt + COALESCE(OLD.transfer_fee, 0) WHERE id = OLD.account_id;
      IF OLD.transfer_to_account_id IS NOT NULL THEN
        dst_amt := public.tx_leg_amount(OLD.transfer_to_account_id, OLD.amount, OLD.foreign_amount);
        UPDATE public.accounts SET balance = balance - dst_amt WHERE id = OLD.transfer_to_account_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    src_amt := public.tx_leg_amount(NEW.account_id, NEW.amount, NEW.foreign_amount);
    IF NEW.type = 'income' THEN
      UPDATE public.accounts SET balance = balance + src_amt WHERE id = NEW.account_id;
    ELSIF NEW.type = 'expense' THEN
      UPDATE public.accounts SET balance = balance - src_amt WHERE id = NEW.account_id;
    ELSIF NEW.type = 'transfer' THEN
      UPDATE public.accounts SET balance = balance - src_amt - COALESCE(NEW.transfer_fee, 0) WHERE id = NEW.account_id;
      IF NEW.transfer_to_account_id IS NOT NULL THEN
        dst_amt := public.tx_leg_amount(NEW.transfer_to_account_id, NEW.amount, NEW.foreign_amount);
        UPDATE public.accounts SET balance = balance + dst_amt WHERE id = NEW.transfer_to_account_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Balance rebuilds use the same per-leg rule.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_account_balances()
RETURNS TABLE(account_id uuid, account_name text, old_balance numeric, new_balance numeric, difference numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
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
    SELECT a.id, a.name, a.balance, a.currency, COALESCE(a.initial_balance, 0) AS initial_balance
    FROM public.accounts a
    WHERE a.user_id = auth.uid()
  LOOP
    old_bal := acc.balance;
    computed_balance := CASE WHEN acc.currency IS NOT NULL THEN acc.initial_balance ELSE 0 END;

    FOR tx IN
      SELECT t.type, t.amount, t.foreign_amount, t.account_id, t.transfer_to_account_id, COALESCE(t.transfer_fee, 0) AS transfer_fee
      FROM public.transactions t
      WHERE t.account_id = acc.id OR t.transfer_to_account_id = acc.id
      ORDER BY t.transaction_date ASC, t.created_at ASC
    LOOP
      IF tx.account_id = acc.id THEN
        IF tx.type = 'income' THEN
          computed_balance := computed_balance + CASE WHEN acc.currency IS NOT NULL THEN COALESCE(tx.foreign_amount, tx.amount) ELSE tx.amount END;
        ELSIF tx.type = 'expense' THEN
          computed_balance := computed_balance - CASE WHEN acc.currency IS NOT NULL THEN COALESCE(tx.foreign_amount, tx.amount) ELSE tx.amount END;
        ELSIF tx.type = 'transfer' THEN
          computed_balance := computed_balance - CASE WHEN acc.currency IS NOT NULL THEN COALESCE(tx.foreign_amount, tx.amount) ELSE tx.amount END - tx.transfer_fee;
        END IF;
      ELSIF tx.transfer_to_account_id = acc.id THEN
        computed_balance := computed_balance + CASE WHEN acc.currency IS NOT NULL THEN COALESCE(tx.foreign_amount, tx.amount) ELSE tx.amount END;
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

CREATE OR REPLACE FUNCTION public.get_account_balance_at_date(p_account_id uuid, p_date date)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  computed_balance NUMERIC := 0;
  is_foreign boolean;
  tx RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT a.currency IS NOT NULL,
         CASE WHEN a.currency IS NOT NULL THEN COALESCE(a.initial_balance, 0) ELSE 0 END
    INTO is_foreign, computed_balance
  FROM public.accounts a
  WHERE a.id = p_account_id AND a.user_id = auth.uid();

  IF is_foreign IS NULL THEN
    RAISE EXCEPTION 'Account not found or access denied';
  END IF;

  FOR tx IN
    SELECT t.type, t.amount, t.foreign_amount, t.account_id, t.transfer_to_account_id, COALESCE(t.transfer_fee, 0) AS transfer_fee
    FROM public.transactions t
    WHERE (t.account_id = p_account_id OR t.transfer_to_account_id = p_account_id)
      AND t.transaction_date <= p_date
    ORDER BY t.transaction_date ASC, t.created_at ASC
  LOOP
    IF tx.account_id = p_account_id THEN
      IF tx.type = 'income' THEN
        computed_balance := computed_balance + CASE WHEN is_foreign THEN COALESCE(tx.foreign_amount, tx.amount) ELSE tx.amount END;
      ELSIF tx.type = 'expense' THEN
        computed_balance := computed_balance - CASE WHEN is_foreign THEN COALESCE(tx.foreign_amount, tx.amount) ELSE tx.amount END;
      ELSIF tx.type = 'transfer' THEN
        computed_balance := computed_balance - CASE WHEN is_foreign THEN COALESCE(tx.foreign_amount, tx.amount) ELSE tx.amount END - tx.transfer_fee;
      END IF;
    ELSIF tx.transfer_to_account_id = p_account_id THEN
      computed_balance := computed_balance + CASE WHEN is_foreign THEN COALESCE(tx.foreign_amount, tx.amount) ELSE tx.amount END;
    END IF;
  END LOOP;

  RETURN computed_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- Deleting an account takes its subaccounts with it, including transfers
-- other accounts made into them. "Last account" counts main accounts only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_account_cascade(p_account_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = 'public' AS $$
DECLARE
  v_owner uuid;
  v_parent uuid;
  v_remaining_count integer;
BEGIN
  SELECT user_id, parent_account_id INTO v_owner, v_parent
  FROM public.accounts
  WHERE id = p_account_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'account_not_found_or_unauthorized';
  END IF;

  IF v_parent IS NULL THEN
    SELECT COUNT(*) INTO v_remaining_count
    FROM public.accounts
    WHERE user_id = auth.uid()
      AND parent_account_id IS NULL
      AND id <> p_account_id;

    IF v_remaining_count = 0 THEN
      RAISE EXCEPTION 'cannot_delete_last_account';
    END IF;
  END IF;

  DELETE FROM public.transactions
  WHERE user_id = auth.uid()
    AND transfer_to_account_id IN (
      SELECT id FROM public.accounts
      WHERE user_id = auth.uid() AND (id = p_account_id OR parent_account_id = p_account_id)
    );

  DELETE FROM public.accounts
  WHERE user_id = auth.uid() AND parent_account_id = p_account_id;

  DELETE FROM public.accounts
  WHERE id = p_account_id AND user_id = auth.uid();
END;
$$;