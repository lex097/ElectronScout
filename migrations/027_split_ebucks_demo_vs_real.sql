-- Migration 027: Split ebucks into demo vs real; add is_demo_mode to bets
-- Demo mode: balance_demo, bets.is_demo_mode = true
-- Real mode: balance (unchanged), bets.is_demo_mode = false

-- 1. Add balance_demo to user_ebucks_balance
ALTER TABLE user_ebucks_balance ADD COLUMN IF NOT EXISTS balance_demo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_ebucks_balance ADD COLUMN IF NOT EXISTS total_earned_demo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_ebucks_balance ADD COLUMN IF NOT EXISTS total_spent_demo INTEGER NOT NULL DEFAULT 0;

-- 2. Add is_demo_mode to bets (false for existing bets = real mode)
ALTER TABLE bets ADD COLUMN IF NOT EXISTS is_demo_mode BOOLEAN NOT NULL DEFAULT false;

-- 3. Update increment_earned_ebucks to accept p_is_demo
CREATE OR REPLACE FUNCTION increment_earned_ebucks(p_user_identifier text, p_amount int, p_is_demo boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_is_demo THEN
    UPDATE user_ebucks_balance
    SET
      balance_demo = balance_demo + p_amount,
      total_earned_demo = total_earned_demo + p_amount,
      updated_at = NOW()
    WHERE user_identifier = p_user_identifier
      AND team_id = public.current_team_id();
  ELSE
    UPDATE user_ebucks_balance
    SET
      balance = balance + p_amount,
      total_earned = total_earned + p_amount,
      updated_at = NOW()
    WHERE user_identifier = p_user_identifier
      AND team_id = public.current_team_id();
  END IF;
END;
$$;

-- 4. Update spend_ebucks_if_sufficient to accept p_is_demo
CREATE OR REPLACE FUNCTION spend_ebucks_if_sufficient(p_user_identifier text, p_amount int, p_is_demo boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_updated int;
BEGIN
  IF p_is_demo THEN
    UPDATE user_ebucks_balance
    SET
      balance_demo = balance_demo - p_amount,
      total_spent_demo = total_spent_demo + p_amount,
      updated_at = NOW()
    WHERE user_identifier = p_user_identifier
      AND team_id = public.current_team_id()
      AND balance_demo >= p_amount;
  ELSE
    UPDATE user_ebucks_balance
    SET
      balance = balance - p_amount,
      total_spent = total_spent + p_amount,
      updated_at = NOW()
    WHERE user_identifier = p_user_identifier
      AND team_id = public.current_team_id()
      AND balance >= p_amount;
  END IF;
  
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

-- 5. Update resolve_bets_batch to credit balance or balance_demo based on bet.is_demo_mode
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
  bet_is_demo boolean;
  payout_agg jsonb := '{}'::jsonb;
  payout_agg_demo jsonb := '{}'::jsonb;
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
    bet_is_demo := COALESCE((res->>'is_demo_mode')::boolean, false);

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
      IF bet_is_demo THEN
        payout_agg_demo := jsonb_set(
          payout_agg_demo,
          ARRAY[bet_user_id],
          to_jsonb(COALESCE((payout_agg_demo->>bet_user_id)::int, 0) + bet_payout)
        );
      ELSE
        payout_agg := jsonb_set(
          payout_agg,
          ARRAY[bet_user_id],
          to_jsonb(COALESCE((payout_agg->>bet_user_id)::int, 0) + bet_payout)
        );
      END IF;
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

  FOR user_key, total_payout IN
    SELECT key, value::int
    FROM jsonb_each_text(payout_agg_demo)
  LOOP
    UPDATE user_ebucks_balance
    SET
      balance_demo = balance_demo + total_payout,
      total_earned_demo = total_earned_demo + total_payout,
      updated_at = NOW()
    WHERE user_identifier = user_key AND team_id = v_team_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION increment_earned_ebucks(text, int, boolean) IS 'Atomically add earned ebucks to balance (real) or balance_demo.';
COMMENT ON FUNCTION spend_ebucks_if_sufficient(text, int, boolean) IS 'Atomically spend ebucks from balance or balance_demo. Returns true if successful.';

-- 6. Update reset_leaderboard to reset both real and demo balances
CREATE OR REPLACE FUNCTION reset_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
BEGIN
  v_team_id := public.current_team_id();
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or team context missing';
  END IF;

  UPDATE user_ebucks_balance
  SET
    balance = 0,
    balance_demo = 0,
    total_earned = 0,
    total_earned_demo = 0,
    total_spent = 0,
    total_spent_demo = 0,
    updated_at = NOW()
  WHERE team_id = v_team_id;
END;
$$;
