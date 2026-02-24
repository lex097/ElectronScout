-- Migration 020: Enable RLS on all tables with team_id scoping
-- Policies use auth.jwt() -> 'app_metadata' ->> 'team_id' for custom JWT auth

-- Drop old permissive policies (allow anon) before creating team-scoped ones
DROP POLICY IF EXISTS "Anyone can read teams" ON teams;
DROP POLICY IF EXISTS "Anyone can insert teams" ON teams;
DROP POLICY IF EXISTS "Anyone can read matches" ON matches;
DROP POLICY IF EXISTS "Anyone can update matches" ON matches;
DROP POLICY IF EXISTS "Anyone can insert matches" ON matches;

-- Helper: get current team_id from JWT (returns UUID or null)
-- Created in public schema (auth schema is not writable)
CREATE OR REPLACE FUNCTION public.current_team_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'team_id')::uuid;
$$;

-- ========== TEAMS ==========
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own team"
  ON teams FOR SELECT
  TO authenticated
  USING (id = public.current_team_id());

-- ========== MATCHES ==========
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own team matches"
  ON matches FOR ALL
  TO authenticated
  USING (team_id = public.current_team_id())
  WITH CHECK (team_id = public.current_team_id());

-- ========== MATCH_DELETIONS ==========
ALTER TABLE match_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own match deletions"
  ON match_deletions FOR ALL
  TO authenticated
  USING (team_id = public.current_team_id())
  WITH CHECK (team_id = public.current_team_id());

-- ========== PICKLISTS ==========
ALTER TABLE picklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own picklists"
  ON picklists FOR ALL
  TO authenticated
  USING (team_id = public.current_team_id())
  WITH CHECK (team_id = public.current_team_id());

-- ========== USER_EBUCKS_BALANCE ==========
ALTER TABLE user_ebucks_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own team ebucks"
  ON user_ebucks_balance FOR ALL
  TO authenticated
  USING (team_id = public.current_team_id())
  WITH CHECK (team_id = public.current_team_id());

-- ========== BETS ==========
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own team bets"
  ON bets FOR ALL
  TO authenticated
  USING (team_id = public.current_team_id())
  WITH CHECK (team_id = public.current_team_id());

-- ========== REFRESH_TOKENS ==========
-- Only service role should access; no direct client access
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to refresh_tokens"
  ON refresh_tokens FOR ALL
  TO authenticated
  USING (false);

-- ========== TEAM_STATISTICS ==========
-- Materialized views don't support RLS. Create a secure view that filters by team_id.
CREATE OR REPLACE VIEW team_statistics_secure
WITH (security_invoker = on)
AS
SELECT * FROM team_statistics
WHERE team_id = public.current_team_id();

-- ========== LEAGUE_AVERAGES ==========
ALTER TABLE league_averages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own league averages"
  ON league_averages FOR SELECT
  TO authenticated
  USING (team_id = public.current_team_id());
