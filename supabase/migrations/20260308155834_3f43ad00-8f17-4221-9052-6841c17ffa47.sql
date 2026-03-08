-- Fix all RLS policies: convert from RESTRICTIVE to PERMISSIVE
-- accounts table
DROP POLICY IF EXISTS "Enable users to view their own data only" ON public.accounts;
CREATE POLICY "Enable users to view their own data only" ON public.accounts FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own accounts" ON public.accounts;
CREATE POLICY "Users can create own accounts" ON public.accounts FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own accounts" ON public.accounts;
CREATE POLICY "Users can delete own accounts" ON public.accounts FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own accounts" ON public.accounts;
CREATE POLICY "Users can update own accounts" ON public.accounts FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- categories table
DROP POLICY IF EXISTS "Enable users to view their own data only" ON public.categories;
CREATE POLICY "Enable users to view their own data only" ON public.categories FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own categories" ON public.categories;
CREATE POLICY "Users can create own categories" ON public.categories FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own categories" ON public.categories;
CREATE POLICY "Users can delete own categories" ON public.categories FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own categories" ON public.categories;
CREATE POLICY "Users can update own categories" ON public.categories FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- transactions table
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own transactions" ON public.transactions;
CREATE POLICY "Users can create own transactions" ON public.transactions FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;
CREATE POLICY "Users can delete own transactions" ON public.transactions FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
CREATE POLICY "Users can update own transactions" ON public.transactions FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- debts table
DROP POLICY IF EXISTS "Users can view own debts" ON public.debts;
CREATE POLICY "Users can view own debts" ON public.debts FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own debts" ON public.debts;
CREATE POLICY "Users can create own debts" ON public.debts FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own debts" ON public.debts;
CREATE POLICY "Users can delete own debts" ON public.debts FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own debts" ON public.debts;
CREATE POLICY "Users can update own debts" ON public.debts FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- debt_payments table
DROP POLICY IF EXISTS "Users can view own debt payments" ON public.debt_payments;
CREATE POLICY "Users can view own debt payments" ON public.debt_payments FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own debt payments" ON public.debt_payments;
CREATE POLICY "Users can create own debt payments" ON public.debt_payments FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own debt payments" ON public.debt_payments;
CREATE POLICY "Users can delete own debt payments" ON public.debt_payments FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own debt payments" ON public.debt_payments;
CREATE POLICY "Users can update own debt payments" ON public.debt_payments FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- profiles table
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((SELECT auth.uid()) = id);

-- recurring_transactions table
DROP POLICY IF EXISTS "Users can view own recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Users can view own recurring transactions" ON public.recurring_transactions FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Users can create own recurring transactions" ON public.recurring_transactions FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Users can delete own recurring transactions" ON public.recurring_transactions FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Users can update own recurring transactions" ON public.recurring_transactions FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- savings_goals table
DROP POLICY IF EXISTS "Users can view their own savings goals" ON public.savings_goals;
CREATE POLICY "Users can view their own savings goals" ON public.savings_goals FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own savings goals" ON public.savings_goals;
CREATE POLICY "Users can create their own savings goals" ON public.savings_goals FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own savings goals" ON public.savings_goals;
CREATE POLICY "Users can delete their own savings goals" ON public.savings_goals FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own savings goals" ON public.savings_goals;
CREATE POLICY "Users can update their own savings goals" ON public.savings_goals FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- installment_payments table
DROP POLICY IF EXISTS "Users can view own installment payments" ON public.installment_payments;
CREATE POLICY "Users can view own installment payments" ON public.installment_payments FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own installment payments" ON public.installment_payments;
CREATE POLICY "Users can create own installment payments" ON public.installment_payments FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own installment payments" ON public.installment_payments;
CREATE POLICY "Users can delete own installment payments" ON public.installment_payments FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own installment payments" ON public.installment_payments;
CREATE POLICY "Users can update own installment payments" ON public.installment_payments FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- installment_payment_records table
DROP POLICY IF EXISTS "Users can view own installment payment records" ON public.installment_payment_records;
CREATE POLICY "Users can view own installment payment records" ON public.installment_payment_records FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own installment payment records" ON public.installment_payment_records;
CREATE POLICY "Users can create own installment payment records" ON public.installment_payment_records FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own installment payment records" ON public.installment_payment_records;
CREATE POLICY "Users can delete own installment payment records" ON public.installment_payment_records FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own installment payment records" ON public.installment_payment_records;
CREATE POLICY "Users can update own installment payment records" ON public.installment_payment_records FOR UPDATE USING ((SELECT auth.uid()) = user_id);

-- installment_payment_history table
DROP POLICY IF EXISTS "Users can view own history" ON public.installment_payment_history;
CREATE POLICY "Users can view own history" ON public.installment_payment_history FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own history" ON public.installment_payment_history;
CREATE POLICY "Users can insert own history" ON public.installment_payment_history FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own history" ON public.installment_payment_history;
CREATE POLICY "Users can delete own history" ON public.installment_payment_history FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- notification_preferences table
DROP POLICY IF EXISTS "Users can view their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can view their own notification preferences" ON public.notification_preferences FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert their own notification preferences" ON public.notification_preferences FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can delete their own notification preferences" ON public.notification_preferences FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can update their own notification preferences" ON public.notification_preferences FOR UPDATE USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- notification_logs table
DROP POLICY IF EXISTS "Users can view their own notification logs" ON public.notification_logs;
CREATE POLICY "Users can view their own notification logs" ON public.notification_logs FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own notification logs" ON public.notification_logs;
CREATE POLICY "Users can insert own notification logs" ON public.notification_logs FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

-- transaction_categories table
DROP POLICY IF EXISTS "Users can view their own transaction categories" ON public.transaction_categories;
CREATE POLICY "Users can view their own transaction categories" ON public.transaction_categories FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own transaction categories" ON public.transaction_categories;
CREATE POLICY "Users can create their own transaction categories" ON public.transaction_categories FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own transaction categories" ON public.transaction_categories;
CREATE POLICY "Users can delete their own transaction categories" ON public.transaction_categories FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- scheduled_debt_payments table
DROP POLICY IF EXISTS "Users can view own scheduled payments" ON public.scheduled_debt_payments;
CREATE POLICY "Users can view own scheduled payments" ON public.scheduled_debt_payments FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own scheduled payments" ON public.scheduled_debt_payments;
CREATE POLICY "Users can create own scheduled payments" ON public.scheduled_debt_payments FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own scheduled payments" ON public.scheduled_debt_payments;
CREATE POLICY "Users can delete own scheduled payments" ON public.scheduled_debt_payments FOR DELETE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own scheduled payments" ON public.scheduled_debt_payments;
CREATE POLICY "Users can update own scheduled payments" ON public.scheduled_debt_payments FOR UPDATE USING ((SELECT auth.uid()) = user_id);