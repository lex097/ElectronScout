-- Truncate 6-digit admin codes to 4 digits by removing the last 2 digits
-- This updates any existing 6-digit admin codes in the teams table

UPDATE teams
SET admin_code = LEFT(admin_code, 4)
WHERE admin_code IS NOT NULL
  AND LENGTH(admin_code) = 6
  AND admin_code ~ '^[0-9]{6}$';

