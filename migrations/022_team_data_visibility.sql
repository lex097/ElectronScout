-- Migration 022: Team-wide data visibility setting
-- Adds data_visibility column to teams and a SECURITY DEFINER RPC for updates.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS data_visibility text NOT NULL DEFAULT 'my_team'
  CHECK (data_visibility IN ('my_team', 'teams_at_event', 'all_teams'));

CREATE OR REPLACE FUNCTION set_team_data_visibility(p_visibility text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_visibility NOT IN ('my_team', 'teams_at_event', 'all_teams') THEN
    RAISE EXCEPTION 'Invalid visibility value: %', p_visibility;
  END IF;
  UPDATE teams SET data_visibility = p_visibility WHERE id = current_team_id();
END;
$$;

GRANT EXECUTE ON FUNCTION set_team_data_visibility(text) TO authenticated;
