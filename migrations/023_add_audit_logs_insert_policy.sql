-- Allow INSERT into audit_logs when team_id matches current user's team
-- Triggers (e.g. on match delete) need to write audit entries
CREATE POLICY "Users can insert own team audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (team_id = public.current_team_id());
