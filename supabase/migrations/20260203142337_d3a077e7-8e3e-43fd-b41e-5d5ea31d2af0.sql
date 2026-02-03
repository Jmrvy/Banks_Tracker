-- Mettre à jour les transactions de remboursement existantes pour qu'elles n'impactent pas les stats
-- Les remboursements liés (avec refund_of_transaction_id) ne doivent pas être comptés dans les revenus
UPDATE public.transactions
SET include_in_stats = false
WHERE refund_of_transaction_id IS NOT NULL
  AND include_in_stats = true;