-- Remove unused columns from teams table: organization, subscription_tier, max_users

ALTER TABLE teams
DROP COLUMN IF EXISTS organization,
DROP COLUMN IF EXISTS subscription_tier,
DROP COLUMN IF EXISTS max_users;

