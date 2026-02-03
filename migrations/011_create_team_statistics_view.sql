-- Create materialized view for team statistics
-- This aggregates match data by team_number and event_key for fast queries

-- Drop existing materialized view if it exists
DROP MATERIALIZED VIEW IF EXISTS team_statistics CASCADE;

-- Create materialized view for team statistics
CREATE MATERIALIZED VIEW team_statistics AS
SELECT 
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
GROUP BY m.team_number, m.event_key;

-- Create unique index (required for CONCURRENT refresh)
CREATE UNIQUE INDEX idx_team_statistics_unique ON team_statistics(team_number, event_key);

-- Create other indexes for fast lookups
CREATE INDEX idx_team_statistics_event ON team_statistics(event_key);
CREATE INDEX idx_team_statistics_match_count ON team_statistics(match_count);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_team_statistics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY team_statistics;
END;
$$;

-- Add comment
COMMENT ON MATERIALIZED VIEW team_statistics IS 'Aggregated team statistics by team_number and event_key. Excludes admin-deleted matches.';
COMMENT ON FUNCTION refresh_team_statistics() IS 'Refreshes the team_statistics materialized view. Call after new matches are added.';
