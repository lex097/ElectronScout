-- Migration 028: Scouter schedule assignments
-- Admins assign scouters to teams per match per event

CREATE TABLE IF NOT EXISTS scouter_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  match_key TEXT NOT NULL,
  match_number INTEGER NOT NULL,
  team_number INTEGER NOT NULL,
  alliance TEXT NOT NULL CHECK (alliance IN ('red', 'blue')),
  scouter_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, event_key, match_key, team_number)
);

CREATE INDEX IF NOT EXISTS idx_scouter_assignments_team_event ON scouter_assignments(team_id, event_key);
CREATE INDEX IF NOT EXISTS idx_scouter_assignments_scouter ON scouter_assignments(team_id, event_key, scouter_name);

ALTER TABLE scouter_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own team scouter assignments"
  ON scouter_assignments FOR ALL
  TO authenticated
  USING (team_id = public.current_team_id())
  WITH CHECK (team_id = public.current_team_id());

COMMENT ON TABLE scouter_assignments IS 'Scouter-to-team assignments per match per event for schedule view';
