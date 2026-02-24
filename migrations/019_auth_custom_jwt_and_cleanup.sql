-- Migration 019: Auth with custom JWT - refresh tokens, schema updates, data cleanup
-- Enables Supabase Auth + custom claims with RLS. Clears existing bets/ebucks.

-- 1. Create refresh_tokens table (stores long-lived refresh tokens, 1 year validity)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_identifier TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_team_id ON refresh_tokens(team_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- 2. Drop FK from bets, add team_id to both tables
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_user_identifier_fkey;

ALTER TABLE user_ebucks_balance ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

-- 3. Truncate (clear all bets and ebucks)
TRUNCATE TABLE bets CASCADE;
TRUNCATE TABLE user_ebucks_balance CASCADE;

-- 4. Update user_ebucks_balance: team_id required, composite unique
ALTER TABLE user_ebucks_balance DROP CONSTRAINT IF EXISTS user_ebucks_balance_user_identifier_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ebucks_team_identifier 
  ON user_ebucks_balance(team_id, user_identifier);
ALTER TABLE user_ebucks_balance ALTER COLUMN team_id SET NOT NULL;

-- 5. Update bets: team_id required, FK to user_ebucks_balance(team_id, user_identifier)
ALTER TABLE bets ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE bets ADD CONSTRAINT bets_ebucks_fkey 
  FOREIGN KEY (team_id, user_identifier) 
  REFERENCES user_ebucks_balance(team_id, user_identifier) ON DELETE CASCADE;
