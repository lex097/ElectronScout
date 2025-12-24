-- Update admin_code format expectations from 4 digits to 6 digits

-- Update comment
COMMENT ON COLUMN teams.admin_code IS '6-digit admin code for team administrators';

-- Update helper function to validate 6-digit format
CREATE OR REPLACE FUNCTION validate_admin_code_format(code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Check if code is exactly 6 digits
  RETURN code ~ '^[0-9]{6}$';
END;
$$;


