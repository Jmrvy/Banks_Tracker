-- Re-apply triggers that didn't get created

-- Account balance auto-update trigger
DROP TRIGGER IF EXISTS on_transaction_change ON public.transactions;
CREATE TRIGGER on_transaction_change
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_account_balance();

-- Debt remaining amount trigger
DROP TRIGGER IF EXISTS on_debt_payment_change ON public.debt_payments;
CREATE TRIGGER on_debt_payment_change
  AFTER INSERT OR DELETE ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_debt_remaining_amount();

-- Prevent duplicate transactions
DROP TRIGGER IF EXISTS prevent_duplicate_transactions ON public.transactions;
CREATE TRIGGER prevent_duplicate_transactions
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_quick_duplicate_transactions();

-- updated_at triggers
DROP TRIGGER IF EXISTS update_accounts_updated_at ON public.accounts;
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_debts_updated_at ON public.debts;
CREATE TRIGGER update_debts_updated_at
  BEFORE UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_recurring_transactions_updated_at ON public.recurring_transactions;
CREATE TRIGGER update_recurring_transactions_updated_at
  BEFORE UPDATE ON public.recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON public.transactions;
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_installment_payments_updated_at_trigger ON public.installment_payments;
CREATE TRIGGER update_installment_payments_updated_at_trigger
  BEFORE UPDATE ON public.installment_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_installment_payments_updated_at();

DROP TRIGGER IF EXISTS update_savings_goals_updated_at ON public.savings_goals;
CREATE TRIGGER update_savings_goals_updated_at
  BEFORE UPDATE ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();