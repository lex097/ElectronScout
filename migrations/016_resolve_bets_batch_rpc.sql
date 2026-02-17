-- Batch bet resolution RPC: resolves multiple bets and updates user balances in one transaction
-- Eliminates N+1: instead of N updates to bets + N selects + N updates to user_ebucks_balance,
-- we do 1 RPC call that handles everything server-side.

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
BEGIN
  -- Validate input
  IF resolutions IS NULL OR jsonb_array_length(resolutions) = 0 THEN
    RETURN;
  END IF;

  -- Update each bet and collect payouts by user (for won bets with payout > 0)
  FOR res IN SELECT * FROM jsonb_array_elements(resolutions)
  LOOP
    bet_id := (res->>'id')::uuid;
    bet_status := (res->>'status')::text;
    bet_payout := COALESCE((res->>'payout')::int, 0);
    bet_user_id := res->>'user_identifier';

    IF bet_id IS NULL OR bet_status IS NULL THEN
      CONTINUE;
    END IF;

    -- Update the bet
    UPDATE bets
    SET
      status = bet_status,
      payout = bet_payout,
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE id = bet_id;

    -- Aggregate payout for user balance update (only for won bets with payout)
    IF bet_status = 'won' AND bet_payout > 0 AND bet_user_id IS NOT NULL THEN
      payout_agg := jsonb_set(
        payout_agg,
        ARRAY[bet_user_id],
        to_jsonb(COALESCE((payout_agg->>bet_user_id)::int, 0) + bet_payout)
      );
    END IF;
  END LOOP;

  -- Update user balances for all winners
  FOR user_key, total_payout IN
    SELECT key, value::int
    FROM jsonb_each_text(payout_agg)
  LOOP
    UPDATE user_ebucks_balance
    SET
      balance = balance + total_payout,
      total_earned = total_earned + total_payout,
      updated_at = NOW()
    WHERE user_identifier = user_key;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION resolve_bets_batch(jsonb) IS 'Batch resolve multiple bets and update user ebucks balances. resolutions: [{id, status, payout, user_identifier}, ...]';
