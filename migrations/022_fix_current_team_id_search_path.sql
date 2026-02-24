-- Fix current_team_id search_path for security advisor
CREATE OR REPLACE FUNCTION public.current_team_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'team_id')::uuid;
$$;
