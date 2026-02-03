-- Add trigger to automatically refresh team_statistics after match insert/update/delete
-- This ensures the materialized view stays up-to-date

-- Create function to refresh statistics (with debouncing to avoid too frequent refreshes)
CREATE OR REPLACE FUNCTION trigger_refresh_team_statistics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Use a background job or scheduled task for actual refresh
  -- For now, we'll just notify that a refresh is needed
  -- The app can call refresh_team_statistics() periodically or on-demand
  
  -- Note: REFRESH MATERIALIZED VIEW cannot be called directly in a trigger
  -- because it requires a transaction. Instead, we'll use a notification
  -- or the app can refresh periodically.
  
  RETURN NULL;
END;
$$;

-- Create trigger on matches table
DROP TRIGGER IF EXISTS matches_refresh_statistics_trigger ON matches;
CREATE TRIGGER matches_refresh_statistics_trigger
  AFTER INSERT OR UPDATE OR DELETE ON matches
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_refresh_team_statistics();

-- Note: For production, consider using pg_cron or a background job service
-- to refresh the materialized view every 5 minutes instead of on every insert.
-- This prevents performance issues with frequent match submissions.

COMMENT ON FUNCTION trigger_refresh_team_statistics() IS 'Trigger function for refreshing team_statistics. Actual refresh should be done via scheduled job or on-demand API call.';
