-- Supprimer les transactions en double (garder seulement la plus ancienne)
DELETE FROM transactions t1 
WHERE EXISTS (
    SELECT 1 FROM transactions t2 
    WHERE t2.description = t1.description 
    AND t2.amount = t1.amount 
    AND t2.type = t1.type 
    AND t2.account_id = t1.account_id 
    AND t2.transaction_date = t1.transaction_date
    AND t2.transfer_to_account_id IS NOT DISTINCT FROM t1.transfer_to_account_id
    AND t2.created_at < t1.created_at
);

-- Ajouter une contrainte unique pour empêcher les doublons futurs
ALTER TABLE transactions 
ADD CONSTRAINT unique_transaction_details 
UNIQUE (user_id, description, amount, type, account_id, transaction_date, transfer_to_account_id, created_at);