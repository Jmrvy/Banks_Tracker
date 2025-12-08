-- Add UPDATE policy for debt_payments table
CREATE POLICY "Users can update own debt payments"
ON public.debt_payments
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix function search_path for security
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_account_balance() SET search_path = public;
ALTER FUNCTION public.prevent_quick_duplicate_transactions() SET search_path = public;

-- Add database constraints for input validation
-- Categories constraints
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS category_name_length;
ALTER TABLE public.categories ADD CONSTRAINT category_name_length 
CHECK (char_length(name) > 0 AND char_length(name) <= 100);

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS budget_positive;
ALTER TABLE public.categories ADD CONSTRAINT budget_positive 
CHECK (budget IS NULL OR budget >= 0);

-- Transactions constraints  
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS amount_positive;
ALTER TABLE public.transactions ADD CONSTRAINT amount_positive 
CHECK (amount > 0);

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS description_length;
ALTER TABLE public.transactions ADD CONSTRAINT description_length 
CHECK (char_length(description) > 0 AND char_length(description) <= 500);

-- Accounts constraints
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS account_name_length;
ALTER TABLE public.accounts ADD CONSTRAINT account_name_length 
CHECK (char_length(name) > 0 AND char_length(name) <= 100);

-- Debts constraints
ALTER TABLE public.debts DROP CONSTRAINT IF EXISTS debt_description_length;
ALTER TABLE public.debts ADD CONSTRAINT debt_description_length 
CHECK (char_length(description) > 0 AND char_length(description) <= 500);

ALTER TABLE public.debts DROP CONSTRAINT IF EXISTS debt_amount_positive;
ALTER TABLE public.debts ADD CONSTRAINT debt_amount_positive 
CHECK (total_amount > 0);

-- Savings goals constraints
ALTER TABLE public.savings_goals DROP CONSTRAINT IF EXISTS goal_name_length;
ALTER TABLE public.savings_goals ADD CONSTRAINT goal_name_length 
CHECK (char_length(name) > 0 AND char_length(name) <= 100);

ALTER TABLE public.savings_goals DROP CONSTRAINT IF EXISTS target_amount_positive;
ALTER TABLE public.savings_goals ADD CONSTRAINT target_amount_positive 
CHECK (target_amount > 0);

ALTER TABLE public.savings_goals DROP CONSTRAINT IF EXISTS current_amount_non_negative;
ALTER TABLE public.savings_goals ADD CONSTRAINT current_amount_non_negative 
CHECK (current_amount >= 0);