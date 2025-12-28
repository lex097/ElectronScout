-- Replace event_id (UUID) with event_key (TEXT) in matches and picklists tables
-- Drop the events table as it's no longer needed

-- Step 1: Drop dependent views/materialized views first
DROP MATERIALIZED VIEW IF EXISTS team_statistics CASCADE;
DROP VIEW IF EXISTS team_statistics CASCADE;

-- Step 2: Drop foreign key constraints on event_id columns
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_event_id_fkey;
ALTER TABLE picklists DROP CONSTRAINT IF EXISTS picklists_event_id_fkey;

-- Step 3: For matches table - drop event_id column and add event_key column (TEXT)
ALTER TABLE matches DROP COLUMN IF EXISTS event_id;
ALTER TABLE matches ADD COLUMN event_key TEXT;

-- Step 4: For picklists table - drop event_id column and add event_key column (TEXT)
ALTER TABLE picklists DROP COLUMN IF EXISTS event_id;
ALTER TABLE picklists ADD COLUMN event_key TEXT;

-- Step 5: Update indexes for picklists to use event_key instead of event_id
-- Drop old indexes
DROP INDEX IF EXISTS idx_picklists_team_event_nonnull;
DROP INDEX IF EXISTS idx_picklists_team_event_null;

-- Create new unique indexes for event_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_picklists_team_event_nonnull 
ON picklists(team_id, event_key) 
WHERE event_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_picklists_team_event_null 
ON picklists(team_id) 
WHERE event_key IS NULL;

-- Step 6: Drop the events table (only after all foreign keys are removed)
-- Note: We already dropped foreign keys from matches and picklists above
-- But there might be other tables with foreign keys to events table
-- Let's drop them too to be safe (the user said they don't need the events table)
ALTER TABLE team_events DROP CONSTRAINT IF EXISTS team_events_event_id_fkey;
ALTER TABLE pit_scouting DROP CONSTRAINT IF EXISTS pit_scouting_event_id_fkey;
ALTER TABLE shared_insights DROP CONSTRAINT IF EXISTS shared_insights_event_id_fkey;

-- Now drop the events table
DROP TABLE IF EXISTS events;

