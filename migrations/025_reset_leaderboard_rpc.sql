-- Migration 025: reset_leaderboard RPC for admins to zero all team members' ebucks
-- Scoped to current_team_id() from JWT. Caller must be authenticated.

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
    total_earned = 0,
    total_spent = 0,
    updated_at = NOW()
  WHERE team_id = v_team_id;
END;
$$;

COMMENT ON FUNCTION reset_leaderboard() IS 'Resets all team members ebucks (balance, total_earned, total_spent) to 0 for the current team. Admin-only in UI.';
