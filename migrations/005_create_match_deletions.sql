-- Track admin-deleted matches so client sync cannot re-upload them later.
-- This is a "tombstone" table keyed by match_id + team_id.

CREATE TABLE IF NOT EXISTS match_deletions (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_match_deletions_team_id ON match_deletions(team_id);
CREATE INDEX IF NOT EXISTS idx_match_deletions_match_id ON match_deletions(match_id);


