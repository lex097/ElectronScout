-- Atomic ebucks operations: 1 round trip instead of 2 (SELECT + UPDATE)
-- Used by earnEbucks and spendEbucks to eliminate extra reads

CREATE OR REPLACE FUNCTION increment_earned_ebucks(p_user_identifier text, p_amount int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_ebucks_balance
  SET
    balance = balance + p_amount,
    total_earned = total_earned + p_amount,
    updated_at = NOW()
  WHERE user_identifier = p_user_identifier;
END;
$$;

-- Returns true if spend succeeded (had sufficient balance), false otherwise
CREATE OR REPLACE FUNCTION spend_ebucks_if_sufficient(p_user_identifier text, p_amount int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_updated int;
BEGIN
  UPDATE user_ebucks_balance
  SET
    balance = balance - p_amount,
    total_spent = total_spent + p_amount,
    updated_at = NOW()
  WHERE user_identifier = p_user_identifier
    AND balance >= p_amount;
  
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

COMMENT ON FUNCTION increment_earned_ebucks(text, int) IS 'Atomically add earned ebucks. Single round trip.';
COMMENT ON FUNCTION spend_ebucks_if_sufficient(text, int) IS 'Atomically spend ebucks if balance sufficient. Returns true if successful. Single round trip.';
