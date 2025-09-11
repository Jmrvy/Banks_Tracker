BEGIN;

-- 1) Supprimer les doublons (on garde la plus ancienne)
WITH ranked AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, description, amount, type, account_id, transfer_to_account_id, transaction_date
      ORDER BY created_at
    ) AS rn
  FROM public.transactions
)
DELETE FROM public.transactions t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 2) Supprimer l’ancienne contrainte unique inadaptée (si présente)
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS unique_transaction_details;

-- 3) Empêcher les doubles saisies rapides via un trigger (fenêtre de 30s)
CREATE OR REPLACE FUNCTION public.prevent_quick_duplicate_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exists_duplicate boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM public.transactions t
    WHERE t.user_id = NEW.user_id
      AND t.description = NEW.description
      AND t.amount = NEW.amount
      AND t.type = NEW.type
      AND t.account_id = NEW.account_id
      AND t.transaction_date = NEW.transaction_date
      AND (
        (t.transfer_to_account_id IS NULL AND NEW.transfer_to_account_id IS NULL)
        OR t.transfer_to_account_id = NEW.transfer_to_account_id
      )
      AND t.created_at > now() - interval '30 seconds'
  ) INTO exists_duplicate;

  IF exists_duplicate THEN
    RAISE EXCEPTION 'Duplicate transaction detected within 30s window';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_transaction ON public.transactions;
CREATE TRIGGER trg_prevent_duplicate_transaction
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_quick_duplicate_transactions();

COMMIT;