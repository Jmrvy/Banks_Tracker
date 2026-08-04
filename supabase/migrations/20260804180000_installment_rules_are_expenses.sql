-- An installment-linked recurring rule only ever creates expenses.
--
-- Reimbursement plans were once written with type = 'income' on the rule,
-- and every materialiser has been overriding it ever since:
-- process-recurring-transactions sets effectiveType = 'expense' for any
-- installment-linked rule, and useFinancialData does the same client-side.
-- So the stored value has never reached the ledger — every transaction
-- these five rules have produced is an expense on its category.
--
-- Dead data is still read data. trace-copilot's scheduled_charges trusted
-- the column and reported "scheduled income of 205,68 €/mo" for a gym
-- subscription, from which the copilot correctly deduced that a refund had
-- gone unlinked and that Sport was overstated. The reasoning was sound; the
-- field was lying.
--
-- Both write paths already store 'expense' (useInstallmentPayments.ts:277
-- on create, :489 on update), so this is a one-off cleanup of legacy rows
-- rather than a rule that needs enforcing. It changes no behaviour: the
-- overrides were already producing this value.

update recurring_transactions
set    type = 'expense',
       updated_at = now()
where  installment_payment_id is not null
  and  type <> 'expense';
