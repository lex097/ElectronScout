-- Create league_averages table to store league-wide statistics
-- This is calculated when 50% of teams have 3+ matches

-- Create league_averages table
CREATE TABLE IF NOT EXISTS league_averages (
  event_key TEXT PRIMARY KEY,
  avg_match_score NUMERIC(10, 2),
  avg_auto_score NUMERIC(10, 2),
  avg_teleop_score NUMERIC(10, 2),
  avg_endgame_score NUMERIC(10, 2),
  qualifying_team_count INTEGER,
  total_teams INTEGER,
  coverage_ratio NUMERIC(5, 4), -- e.g., 0.5000 for 50%
  is_active BOOLEAN DEFAULT false,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_league_averages_event ON league_averages(event_key);
CREATE INDEX idx_league_averages_active ON league_averages(is_active) WHERE is_active = true;

-- Add comment
COMMENT ON TABLE league_averages IS 'League-wide averages calculated when 50% of teams have 3+ matches. Phase scores (auto/teleop/endgame) are calculated in application layer.';

-- Function to update league average for an event
-- Note: Phase-specific averages (auto/teleop/endgame) need to be calculated in the app
-- since they require game config logic. This function only updates match_count and coverage.
CREATE OR REPLACE FUNCTION update_league_average(event_key_param TEXT)
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
  -- Get total distinct teams in the event
  SELECT COUNT(DISTINCT team_number) INTO total_teams_count
  FROM matches 
  WHERE event_key = event_key_param
    AND id NOT IN (
      SELECT md.match_id 
      FROM match_deletions md
      INNER JOIN matches m ON m.id = md.match_id
      WHERE m.event_key = event_key_param
    );
  
  -- Count teams with 3+ matches
  SELECT COUNT(*) INTO qualifying_count
  FROM team_statistics
  WHERE event_key = event_key_param AND match_count >= 3;
  
  -- Calculate coverage ratio
  coverage := CASE 
    WHEN total_teams_count > 0 THEN qualifying_count::NUMERIC / total_teams_count
    ELSE 0
  END;
  
  -- Only update if threshold met (50% coverage)
  IF coverage >= 0.5 THEN
    -- Calculate average match score from qualifying teams
    SELECT AVG(avg_match_score) INTO avg_match_score_val
    FROM team_statistics
    WHERE event_key = event_key_param AND match_count >= 3;
    
    INSERT INTO league_averages (
      event_key, 
      avg_match_score,
      qualifying_team_count, 
      total_teams, 
      coverage_ratio,
      is_active,
      last_updated
    )
    VALUES (
      event_key_param,
      avg_match_score_val,
      qualifying_count,
      total_teams_count,
      coverage,
      true,
      NOW()
    )
    ON CONFLICT (event_key) DO UPDATE SET
      avg_match_score = EXCLUDED.avg_match_score,
      qualifying_team_count = EXCLUDED.qualifying_team_count,
      total_teams = EXCLUDED.total_teams,
      coverage_ratio = EXCLUDED.coverage_ratio,
      is_active = true,
      last_updated = NOW();
  ELSE
    -- If threshold not met, mark as inactive but keep record
    UPDATE league_averages
    SET is_active = false,
        last_updated = NOW()
    WHERE event_key = event_key_param;
  END IF;
END;
$$;

-- Add comment
COMMENT ON FUNCTION update_league_average(TEXT) IS 'Updates league average for an event. Only activates when 50% of teams have 3+ matches. Phase scores must be calculated in application layer.';
