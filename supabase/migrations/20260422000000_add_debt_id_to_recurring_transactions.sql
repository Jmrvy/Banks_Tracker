-- Add debt_id column to recurring_transactions if it doesn't exist
-- This links recurring debt payment transactions to the debt they belong to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recurring_transactions'
      AND column_name = 'debt_id'
  ) THEN
    ALTER TABLE public.recurring_transactions
      ADD COLUMN debt_id UUID REFERENCES public.debts(id) ON DELETE CASCADE;
  ELSE
    -- Column exists but may lack CASCADE constraint — drop and re-add the FK
    -- Find and drop any existing FK constraint on debt_id
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'recurring_transactions'
        AND kcu.column_name = 'debt_id'
        AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN
      EXECUTE (
        SELECT 'ALTER TABLE public.recurring_transactions DROP CONSTRAINT ' || tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'recurring_transactions'
          AND kcu.column_name = 'debt_id'
          AND tc.constraint_type = 'FOREIGN KEY'
        LIMIT 1
      );
    END IF;

    ALTER TABLE public.recurring_transactions
      ADD CONSTRAINT recurring_transactions_debt_id_fkey
      FOREIGN KEY (debt_id) REFERENCES public.debts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add index for faster debt lookups
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_debt_id
  ON public.recurring_transactions(debt_id)
  WHERE debt_id IS NOT NULL;
