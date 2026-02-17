-- Add team_id to team_statistics so each scouting team only sees their own data
-- Team statistics must be scoped to the team that did the scouting (team_id)

-- Step 1: Drop existing materialized view
DROP MATERIALIZED VIEW IF EXISTS team_statistics CASCADE;

-- Step 2: Create materialized view with team_id in GROUP BY
CREATE MATERIALIZED VIEW team_statistics AS
SELECT 
  m.team_id,
  m.team_number,
  m.event_key,
  COUNT(*) as match_count,
  AVG(m.calculated_points) as avg_match_score,
  STDDEV(m.calculated_points) as std_dev_score,
  MIN(m.calculated_points) as min_score,
  MAX(m.calculated_points) as max_score,
  SUM(m.calculated_points) as total_points,
  MAX(m.timestamp) as last_match_timestamp,
  MIN(m.timestamp) as first_match_timestamp
FROM matches m
WHERE m.id NOT IN (
  SELECT md.match_id 
  FROM match_deletions md
  WHERE md.team_id = m.team_id
)
GROUP BY m.team_id, m.team_number, m.event_key;

-- Create unique index (required for CONCURRENT refresh)
CREATE UNIQUE INDEX idx_team_statistics_unique ON team_statistics(team_id, team_number, event_key);

-- Create indexes for fast lookups
CREATE INDEX idx_team_statistics_team_id ON team_statistics(team_id);
CREATE INDEX idx_team_statistics_event ON team_statistics(event_key);
CREATE INDEX idx_team_statistics_match_count ON team_statistics(match_count);

-- Add comment
COMMENT ON MATERIALIZED VIEW team_statistics IS 'Aggregated team statistics by team_id (scouting org), team_number and event_key. Each team only sees their own scouted data.';

-- Step 3: Update league_averages to be team-scoped
DROP TABLE IF EXISTS league_averages CASCADE;

CREATE TABLE league_averages (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  avg_match_score NUMERIC(10, 2),
  avg_auto_score NUMERIC(10, 2),
  avg_teleop_score NUMERIC(10, 2),
  avg_endgame_score NUMERIC(10, 2),
  qualifying_team_count INTEGER,
  total_teams INTEGER,
  coverage_ratio NUMERIC(5, 4),
  is_active BOOLEAN DEFAULT false,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (team_id, event_key)
);

CREATE INDEX idx_league_averages_team_event ON league_averages(team_id, event_key);
CREATE INDEX idx_league_averages_event ON league_averages(event_key);
CREATE INDEX idx_league_averages_active ON league_averages(is_active) WHERE is_active = true;

COMMENT ON TABLE league_averages IS 'League averages per scouting team per event. Only uses data scouted by that team.';

-- Step 4: Update update_league_average to accept team_id and filter by it
CREATE OR REPLACE FUNCTION update_league_average(team_id_param UUID, event_key_param TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_teams_count INTEGER;
  qualifying_count INTEGER;
  coverage NUMERIC;
  avg_match_score_val NUMERIC;
BEGIN
  -- Get total distinct teams scouted by this team in the event (excluding admin-deleted)
  SELECT COUNT(DISTINCT m.team_number) INTO total_teams_count
  FROM matches m
  WHERE m.event_key = event_key_param
    AND m.team_id = team_id_param
    AND NOT EXISTS (
      SELECT 1 FROM match_deletions md 
      WHERE md.team_id = m.team_id AND md.match_id = m.id
    );
  
  -- Count teams with 3+ matches (from this scouting team's data)
  SELECT COUNT(*) INTO qualifying_count
  FROM team_statistics
  WHERE event_key = event_key_param AND team_id = team_id_param AND match_count >= 3;
  
  -- Calculate coverage ratio
  coverage := CASE 
    WHEN total_teams_count > 0 THEN qualifying_count::NUMERIC / total_teams_count
    ELSE 0
  END;
  
  -- Only update if threshold met (50% coverage)
  IF coverage >= 0.5 THEN
    SELECT AVG(avg_match_score) INTO avg_match_score_val
    FROM team_statistics
    WHERE event_key = event_key_param AND team_id = team_id_param AND match_count >= 3;
    
    INSERT INTO league_averages (
      team_id,
      event_key, 
      avg_match_score,
      qualifying_team_count, 
      total_teams, 
      coverage_ratio,
      is_active,
      last_updated
    )
    VALUES (
      team_id_param,
      event_key_param,
      avg_match_score_val,
      qualifying_count,
      total_teams_count,
      coverage,
      true,
      NOW()
    )
    ON CONFLICT (team_id, event_key) DO UPDATE SET
      avg_match_score = EXCLUDED.avg_match_score,
      qualifying_team_count = EXCLUDED.qualifying_team_count,
      total_teams = EXCLUDED.total_teams,
      coverage_ratio = EXCLUDED.coverage_ratio,
      is_active = true,
      last_updated = NOW();
  ELSE
    UPDATE league_averages
    SET is_active = false,
        last_updated = NOW()
    WHERE team_id = team_id_param AND event_key = event_key_param;
  END IF;
END;
$$;

COMMENT ON FUNCTION update_league_average(UUID, TEXT) IS 'Updates league average for a team and event. Only uses data scouted by that team.';
