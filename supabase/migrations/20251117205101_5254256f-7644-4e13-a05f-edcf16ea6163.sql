-- First, update any existing credit debts to loan_received
UPDATE debts SET type = 'loan_received' WHERE type = 'credit';

-- Create a new enum type without 'credit'
CREATE TYPE debt_type_new AS ENUM ('loan_given', 'loan_received');

-- Change the column to use the new type
ALTER TABLE debts 
  ALTER COLUMN type TYPE debt_type_new 
  USING type::text::debt_type_new;

-- Drop the old type
DROP TYPE debt_type;

-- Rename the new type to the original name
ALTER TYPE debt_type_new RENAME TO debt_type;