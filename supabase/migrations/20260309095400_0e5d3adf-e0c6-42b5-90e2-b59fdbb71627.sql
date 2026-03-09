-- Remove duplicate triggers that cause double-counting

-- Remove old duplicate balance trigger (keep on_transaction_change)
DROP TRIGGER IF EXISTS trg_update_account_balance ON public.transactions;

-- Remove old duplicate duplicate-prevention trigger (keep prevent_duplicate_transactions)
DROP TRIGGER IF EXISTS trg_prevent_duplicate_transaction ON public.transactions;

-- Remove old duplicate debt payment trigger (keep on_debt_payment_change)
DROP TRIGGER IF EXISTS update_debt_amount_on_payment ON public.debt_payments;

-- Remove duplicate installment_payments updated_at trigger (keep update_installment_payments_updated_at_trigger)
DROP TRIGGER IF EXISTS update_installment_payments_updated_at ON public.installment_payments;