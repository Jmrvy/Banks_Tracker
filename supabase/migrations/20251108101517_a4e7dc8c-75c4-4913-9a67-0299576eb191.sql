-- Add value_date column to transactions table
ALTER TABLE public.transactions 
ADD COLUMN value_date date;

-- Set default value for value_date to be equal to transaction_date for all existing transactions
UPDATE public.transactions 
SET value_date = transaction_date 
WHERE value_date IS NULL;

-- Make value_date NOT NULL after setting defaults
ALTER TABLE public.transactions 
ALTER COLUMN value_date SET NOT NULL;

-- Set default for new transactions to be transaction_date
ALTER TABLE public.transactions 
ALTER COLUMN value_date SET DEFAULT CURRENT_DATE;

-- Add comment to clarify the purpose
COMMENT ON COLUMN public.transactions.transaction_date IS 'Date comptable - Date d''enregistrement de la transaction';
COMMENT ON COLUMN public.transactions.value_date IS 'Date de valeur - Date effective de la transaction, par défaut égale à la date comptable';