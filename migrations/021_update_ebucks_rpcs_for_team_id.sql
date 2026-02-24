-- Migration 021: Update ebucks/betting RPCs to use team_id (required after 019)
-- Uses public.current_team_id() so RPCs respect JWT team scope

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
  WHERE user_identifier = p_user_identifier
    AND team_id = public.current_team_id();
END;
$$;

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
    AND team_id = public.current_team_id()
    AND balance >= p_amount;
  
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_bets_batch(resolutions jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  res jsonb;
  bet_id uuid;
  bet_status text;
  bet_payout int;
  bet_user_id text;
  payout_agg jsonb := '{}'::jsonb;
  user_key text;
  total_payout int;
  v_team_id uuid;
BEGIN
  v_team_id := public.current_team_id();
  IF v_team_id IS NULL THEN
    RETURN;
  END IF;

  IF resolutions IS NULL OR jsonb_array_length(resolutions) = 0 THEN
    RETURN;
  END IF;

  FOR res IN SELECT * FROM jsonb_array_elements(resolutions)
  LOOP
    bet_id := (res->>'id')::uuid;
    bet_status := (res->>'status')::text;
    bet_payout := COALESCE((res->>'payout')::int, 0);
    bet_user_id := res->>'user_identifier';

    IF bet_id IS NULL OR bet_status IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE bets
    SET
      status = bet_status,
      payout = bet_payout,
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE id = bet_id AND team_id = v_team_id;

    IF bet_status = 'won' AND bet_payout > 0 AND bet_user_id IS NOT NULL THEN
      payout_agg := jsonb_set(
        payout_agg,
        ARRAY[bet_user_id],
        to_jsonb(COALESCE((payout_agg->>bet_user_id)::int, 0) + bet_payout)
      );
    END IF;
  END LOOP;

  FOR user_key, total_payout IN
    SELECT key, value::int
    FROM jsonb_each_text(payout_agg)
  LOOP
    UPDATE user_ebucks_balance
    SET
      balance = balance + total_payout,
      total_earned = total_earned + total_payout,
      updated_at = NOW()
    WHERE user_identifier = user_key AND team_id = v_team_id;
  END LOOP;
END;
$$;
