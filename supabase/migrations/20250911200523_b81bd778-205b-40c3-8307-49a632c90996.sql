BEGIN;

-- 1) Fix double-accounting by keeping a single, correct trigger for balances
DROP TRIGGER IF EXISTS update_account_balance_trigger ON public.transactions;
DROP TRIGGER IF EXISTS trigger_update_account_balance ON public.transactions;

CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_account_balance();

-- 2) Ensure duplicate-protection trigger is present (no-op if already exists)
DROP TRIGGER IF EXISTS trg_prevent_duplicate_transaction ON public.transactions;
CREATE TRIGGER trg_prevent_duplicate_transaction
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_quick_duplicate_transactions();

-- 3) Reconcile current account balances once (remove the extra pass that happened due to duplicate triggers)
WITH net AS (
  SELECT 
    a.id AS account_id,
    -- outflow/inflow on the primary account_id
    COALESCE((
      SELECT COALESCE(SUM(
        CASE t.type
          WHEN 'income' THEN t.amount
          WHEN 'expense' THEN -t.amount
          WHEN 'transfer' THEN -t.amount - COALESCE(t.transfer_fee, 0)
          ELSE 0
        END
      ), 0)
      FROM public.transactions t
      WHERE t.account_id = a.id
    ), 0)
    +
    -- inflow from transfers where this account is the recipient
    COALESCE((
      SELECT COALESCE(SUM(t2.amount), 0)
      FROM public.transactions t2
      WHERE t2.transfer_to_account_id = a.id
    ), 0) AS net_sum
  FROM public.accounts a
)
UPDATE public.accounts acc
SET balance = acc.balance - net.net_sum,
    updated_at = now()
FROM net
WHERE acc.id = net.account_id;

COMMIT;