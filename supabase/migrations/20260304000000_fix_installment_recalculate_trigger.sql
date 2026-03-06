-- Fix recalculate_single_installment:
-- 1. Remove dead installment_payment_records sum (table is never populated)
-- 2. Also recalculate installment_amount so DB trigger and JS logic stay in sync
CREATE OR REPLACE FUNCTION recalculate_single_installment(
  p_installment_payment_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_total_paid NUMERIC;
  v_total_amount NUMERIC;
  v_old_remaining NUMERIC;
  v_old_installment_amount NUMERIC;
  v_new_remaining NUMERIC;
  v_new_installment_amount NUMERIC;
  v_remaining_periods INT;
  v_is_complete BOOLEAN;
BEGIN
  -- Get the total amount, current remaining and installment amount
  SELECT total_amount, remaining_amount, installment_amount
  INTO v_total_amount, v_old_remaining, v_old_installment_amount
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

  -- Calculate new remaining
  v_new_remaining := GREATEST(0, v_total_amount - v_total_paid);
  v_is_complete := v_new_remaining <= 0;

  -- Recalculate installment_amount: remaining_periods × new_amount = remaining_amount
  v_new_installment_amount := v_old_installment_amount;
  IF v_new_remaining > 0 AND v_old_installment_amount > 0 THEN
    v_remaining_periods := GREATEST(1, ROUND(v_new_remaining / v_old_installment_amount));
    v_new_installment_amount := ROUND((v_new_remaining / v_remaining_periods)::numeric, 2);
  ELSIF v_is_complete THEN
    v_new_installment_amount := 0;
  END IF;

  -- Only update if something changed
  IF v_new_remaining IS DISTINCT FROM v_old_remaining
     OR v_new_installment_amount IS DISTINCT FROM v_old_installment_amount THEN
    -- Update the installment payment
    UPDATE installment_payments
    SET
      remaining_amount = v_new_remaining,
      installment_amount = v_new_installment_amount,
      is_active = NOT v_is_complete,
      updated_at = NOW()
    WHERE id = p_installment_payment_id
      AND user_id = p_user_id;

    -- Sync recurring transaction amount
    UPDATE recurring_transactions
    SET
      amount = v_new_installment_amount,
      is_active = CASE WHEN v_is_complete THEN false ELSE is_active END,
      updated_at = NOW()
    WHERE installment_payment_id = p_installment_payment_id
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
      jsonb_build_object('remaining_amount', v_old_remaining, 'installment_amount', v_old_installment_amount),
      jsonb_build_object('remaining_amount', v_new_remaining, 'installment_amount', v_new_installment_amount, 'total_paid', v_total_paid),
      'Recalcul automatique suite à modification de transaction'
    );
  END IF;
END;
$$ LANGUAGE plpgsql;
