-- Add include_in_stats column to transactions table
ALTER TABLE transactions 
ADD COLUMN include_in_stats boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN transactions.include_in_stats IS 'Whether this transaction should be included in statistical calculations (expenses, income, spending by category). When false, transaction still appears in history and impacts account balance.';