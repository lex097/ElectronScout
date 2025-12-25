-- Consolidate picklists from 3 rows per team+event to 1 row with JSON object
-- Structure: team_rankings will contain {"firstPick": [], "secondPick": [], "doNotPick": []}

-- Step 1: Create a temporary table with consolidated data
CREATE TEMP TABLE temp_consolidated_picklists AS
SELECT 
  team_id,
  event_id,
  created_by,
  is_official,
  MIN(created_at) as created_at,
  MAX(updated_at) as updated_at,
  jsonb_build_object(
    'firstPick', COALESCE(
      (SELECT team_rankings FROM picklists p2 
       WHERE p2.team_id = p.team_id 
       AND (p2.event_id = p.event_id OR (p2.event_id IS NULL AND p.event_id IS NULL))
       AND p2.name = 'First Pick'
       LIMIT 1),
      '[]'::jsonb
    ),
    'secondPick', COALESCE(
      (SELECT team_rankings FROM picklists p2 
       WHERE p2.team_id = p.team_id 
       AND (p2.event_id = p.event_id OR (p2.event_id IS NULL AND p.event_id IS NULL))
       AND p2.name = 'Second Pick'
       LIMIT 1),
      '[]'::jsonb
    ),
    'doNotPick', COALESCE(
      (SELECT team_rankings FROM picklists p2 
       WHERE p2.team_id = p.team_id 
       AND (p2.event_id = p.event_id OR (p2.event_id IS NULL AND p.event_id IS NULL))
       AND p2.name = 'Do Not Pick'
       LIMIT 1),
      '[]'::jsonb
    )
  ) as team_rankings
FROM picklists p
GROUP BY team_id, event_id, created_by, is_official;

-- Step 2: Clear existing data
TRUNCATE TABLE picklists;

-- Step 3: Insert consolidated data
INSERT INTO picklists (team_id, event_id, name, team_rankings, created_by, is_official, created_at, updated_at)
SELECT 
  team_id,
  event_id,
  'Main Picklist' as name, -- Temporary name, will be removed
  team_rankings,
  created_by,
  is_official,
  created_at,
  updated_at
FROM temp_consolidated_picklists;

-- Step 4: Drop the temporary table
DROP TABLE temp_consolidated_picklists;

-- Step 5: Remove the name column (we don't need it anymore)
ALTER TABLE picklists DROP COLUMN IF EXISTS name;

-- Step 6: Add unique constraint on (team_id, event_id)
-- Note: PostgreSQL unique constraints treat NULLs as distinct, so we need a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_picklists_team_event_unique 
ON picklists(team_id, COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- For NULL event_id cases, we'll use a partial unique index instead
-- Drop the above index and create a better one
DROP INDEX IF EXISTS idx_picklists_team_event_unique;

-- Create partial unique indexes for NULL and non-NULL event_id separately
CREATE UNIQUE INDEX IF NOT EXISTS idx_picklists_team_event_nonnull 
ON picklists(team_id, event_id) 
WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_picklists_team_event_null 
ON picklists(team_id) 
WHERE event_id IS NULL;

