-- Add transfer type to transaction_type enum
ALTER TYPE transaction_type ADD VALUE 'transfer';

-- Add transfer-related columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN transfer_to_account_id UUID REFERENCES public.accounts(id),
ADD COLUMN transfer_fee NUMERIC DEFAULT 0;