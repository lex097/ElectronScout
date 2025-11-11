-- Add admin_code column to teams table
ALTER TABLE teams 
ADD COLUMN admin_code TEXT;

-- Add index for fast admin code lookups
CREATE INDEX idx_teams_admin_code ON teams(admin_code) WHERE admin_code IS NOT NULL;

-- Add comment
COMMENT ON COLUMN teams.admin_code IS '4-digit admin code for team administrators';

-- Optional: Create a function to validate admin code format (4 digits)
CREATE OR REPLACE FUNCTION validate_admin_code_format(code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Check if code is exactly 4 digits
  RETURN code ~ '^[0-9]{4}$';
END;
$$;

