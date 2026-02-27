-- Create installment_payment_history table for audit logging
CREATE TABLE IF NOT EXISTS installment_payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_payment_id UUID NOT NULL REFERENCES installment_payments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'amount_changed', 'completed', 'reactivated', 'recalculated', 'deleted')),
  old_values JSONB,
  new_values JSONB,
  change_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_installment_payment_history_payment_id ON installment_payment_history(installment_payment_id);
CREATE INDEX idx_installment_payment_history_user_id ON installment_payment_history(user_id);
CREATE INDEX idx_installment_payment_history_created_at ON installment_payment_history(created_at DESC);

-- Enable RLS
ALTER TABLE installment_payment_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own installment payment history"
  ON installment_payment_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own installment payment history"
  ON installment_payment_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note: No update or delete policies - history should be immutable
