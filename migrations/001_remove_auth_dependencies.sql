-- Migration: Remove Supabase Auth dependencies and update schema for team code authentication

-- 1. Drop ALL RLS policies that use get_current_user_team_id() or auth.uid() FIRST
-- (These must be dropped before we can drop the function or columns they reference)

-- Matches policies
DROP POLICY IF EXISTS "Users can update own team matches" ON matches;
DROP POLICY IF EXISTS "Users can insert matches for own team" ON matches;
DROP POLICY IF EXISTS "Users can view own team matches" ON matches;
DROP POLICY IF EXISTS "Admins can delete matches" ON matches;

-- Profiles policies
DROP POLICY IF EXISTS "Users can view profiles in their team" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Picklists policies
DROP POLICY IF EXISTS "Users can view own team picklists" ON picklists;
DROP POLICY IF EXISTS "Masters/Admins can manage picklists" ON picklists;

-- Pit scouting policies
DROP POLICY IF EXISTS "Users can insert pit scouting for own team" ON pit_scouting;
DROP POLICY IF EXISTS "Users can view own team pit scouting" ON pit_scouting;

-- Shared insights policies
DROP POLICY IF EXISTS "Users can view own team insights" ON shared_insights;

-- 2. Now safe to drop the get_current_user_team_id function
DROP FUNCTION IF EXISTS get_current_user_team_id();

-- 3. Now safe to remove scouter_id column and foreign key from matches table
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_scouter_id_fkey;
ALTER TABLE matches DROP COLUMN IF EXISTS scouter_id;

-- 4. Remove scout_team_number column (redundant - team_id already links to team)
ALTER TABLE matches DROP COLUMN IF EXISTS scout_team_number;

-- 5. Create function to generate unique 6-character alphanumeric team_code
CREATE OR REPLACE FUNCTION generate_team_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  
  -- Check if code already exists, regenerate if needed
  WHILE EXISTS (SELECT 1 FROM teams WHERE team_code = result) LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 6. Add trigger to auto-generate team_code when team is created if not provided
CREATE OR REPLACE FUNCTION set_team_code_if_null()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.team_code IS NULL OR NEW.team_code = '' THEN
    NEW.team_code := generate_team_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_team_code ON teams;
CREATE TRIGGER trigger_set_team_code
  BEFORE INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION set_team_code_if_null();

-- 7. Create helper function to get team_id from team_number
CREATE OR REPLACE FUNCTION get_team_id_by_number(team_num INTEGER)
RETURNS UUID AS $$
DECLARE
  team_uuid UUID;
BEGIN
  SELECT id INTO team_uuid FROM teams WHERE team_number = team_num LIMIT 1;
  RETURN team_uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- 8. Create helper function to validate team_code and return team_id
CREATE OR REPLACE FUNCTION validate_team_code_and_get_id(code TEXT)
RETURNS UUID AS $$
DECLARE
  team_uuid UUID;
BEGIN
  SELECT id INTO team_uuid FROM teams WHERE team_code = code LIMIT 1;
  RETURN team_uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- 9. Note: The existing "Anyone can insert matches", "Anyone can read matches", "Anyone can update matches" 
-- policies remain and are sufficient since we'll use service role key for operations
-- These policies allow all operations, which is fine since team_code validation happens before sync

