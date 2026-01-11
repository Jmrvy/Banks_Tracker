-- Retroactively link existing transactions to their installment payments based on description
UPDATE transactions t
SET installment_payment_id = rt.installment_payment_id
FROM recurring_transactions rt
WHERE t.description LIKE rt.description || ' (Récurrence automatique)'
  AND rt.installment_payment_id IS NOT NULL
  AND t.installment_payment_id IS NULL;