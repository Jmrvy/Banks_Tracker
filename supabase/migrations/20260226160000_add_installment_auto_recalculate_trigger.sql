-- Create a function to recalculate installment payment when linked transactions change
CREATE OR REPLACE FUNCTION recalculate_installment_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_installment_payment_id UUID;
  v_total_paid NUMERIC;
  v_total_amount NUMERIC;
  v_new_remaining NUMERIC;
  v_user_id UUID;
BEGIN
  -- Determine which installment_payment_id to recalculate
  IF TG_OP = 'DELETE' THEN
    v_installment_payment_id := OLD.installment_payment_id;
    v_user_id := OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle both old and new installment_payment_id if it changed
    IF OLD.installment_payment_id IS DISTINCT FROM NEW.installment_payment_id THEN
      -- Recalculate the old one first if it existed
      IF OLD.installment_payment_id IS NOT NULL THEN
        PERFORM recalculate_single_installment(OLD.installment_payment_id, OLD.user_id);
      END IF;
    END IF;
    v_installment_payment_id := NEW.installment_payment_id;
    v_user_id := NEW.user_id;
  ELSE
    -- INSERT
    v_installment_payment_id := NEW.installment_payment_id;
    v_user_id := NEW.user_id;
  END IF;

  -- If no installment_payment_id, nothing to do
  IF v_installment_payment_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Recalculate the installment payment
  PERFORM recalculate_single_installment(v_installment_payment_id, v_user_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Helper function to recalculate a single installment payment
CREATE OR REPLACE FUNCTION recalculate_single_installment(
  p_installment_payment_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_total_paid NUMERIC;
  v_total_amount NUMERIC;
  v_old_remaining NUMERIC;
  v_new_remaining NUMERIC;
  v_is_complete BOOLEAN;
BEGIN
  -- Get the total amount and current remaining
  SELECT total_amount, remaining_amount
  INTO v_total_amount, v_old_remaining
  FROM installment_payments
  WHERE id = p_installment_payment_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate total paid from linked transactions
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM transactions
  WHERE installment_payment_id = p_installment_payment_id
    AND user_id = p_user_id;

  -- Add amounts from payment records (excluding those already counted in transactions)
  SELECT v_total_paid + COALESCE(SUM(ipr.amount), 0)
  INTO v_total_paid
  FROM installment_payment_records ipr
  WHERE ipr.installment_payment_id = p_installment_payment_id
    AND ipr.user_id = p_user_id
    AND (ipr.transaction_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = ipr.transaction_id
        AND t.installment_payment_id = p_installment_payment_id
    ));

  -- Calculate new remaining
  v_new_remaining := GREATEST(0, v_total_amount - v_total_paid);
  v_is_complete := v_new_remaining <= 0;

  -- Only update if remaining changed
  IF v_new_remaining IS DISTINCT FROM v_old_remaining THEN
    -- Update the installment payment
    UPDATE installment_payments
    SET
      remaining_amount = v_new_remaining,
      is_active = NOT v_is_complete,
      updated_at = NOW()
    WHERE id = p_installment_payment_id
      AND user_id = p_user_id;

    -- Log the automatic recalculation in history
    INSERT INTO installment_payment_history (
      installment_payment_id,
      user_id,
      change_type,
      old_values,
      new_values,
      change_description
    ) VALUES (
      p_installment_payment_id,
      p_user_id,
      'recalculated',
      jsonb_build_object('remaining_amount', v_old_remaining),
      jsonb_build_object('remaining_amount', v_new_remaining, 'total_paid', v_total_paid),
      'Recalcul automatique suite à modification de transaction'
    );

    -- If complete, also disable the linked recurring transaction
    IF v_is_complete THEN
      UPDATE recurring_transactions
      SET is_active = false
      WHERE installment_payment_id = p_installment_payment_id
        AND user_id = p_user_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on transactions table
DROP TRIGGER IF EXISTS trigger_recalculate_installment_on_transaction ON transactions;
CREATE TRIGGER trigger_recalculate_installment_on_transaction
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_installment_payment();

-- Also create trigger for installment_payment_records changes
CREATE OR REPLACE FUNCTION recalculate_installment_on_record_change()
RETURNS TRIGGER AS $$
DECLARE
  v_installment_payment_id UUID;
  v_user_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_installment_payment_id := OLD.installment_payment_id;
    v_user_id := OLD.user_id;
  ELSE
    v_installment_payment_id := NEW.installment_payment_id;
    v_user_id := NEW.user_id;
  END IF;

  IF v_installment_payment_id IS NOT NULL THEN
    PERFORM recalculate_single_installment(v_installment_payment_id, v_user_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_installment_on_record ON installment_payment_records;
CREATE TRIGGER trigger_recalculate_installment_on_record
  AFTER INSERT OR UPDATE OR DELETE ON installment_payment_records
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_installment_on_record_change();
