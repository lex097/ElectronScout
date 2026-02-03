-- Create betting system tables
-- Stores ebucks balance and bets

-- User ebucks balance table
CREATE TABLE IF NOT EXISTS user_ebucks_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL UNIQUE, -- scout_name + team_number combination
  scout_name TEXT NOT NULL,
  team_number TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bets table
CREATE TABLE IF NOT EXISTS bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL,
  match_key TEXT NOT NULL,
  match_number INTEGER NOT NULL,
  event_key TEXT NOT NULL,
  bet_type TEXT NOT NULL CHECK (bet_type IN ('winner', 'margin', 'over_under', 'parlay')),
  bet_details JSONB NOT NULL, -- Stores bet-specific data (alliance, margin, threshold, etc.)
  bet_amount INTEGER NOT NULL CHECK (bet_amount > 0),
  odds NUMERIC(10, 2) NOT NULL CHECK (odds >= 1.0),
  potential_payout NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'cancelled')),
  payout INTEGER DEFAULT 0, -- Actual payout if won (0 if lost)
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_identifier) REFERENCES user_ebucks_balance(user_identifier) ON DELETE CASCADE
);

-- Indexes for fast lookups
CREATE INDEX idx_bets_user_identifier ON bets(user_identifier);
CREATE INDEX idx_bets_match_key ON bets(match_key);
CREATE INDEX idx_bets_status ON bets(status);
CREATE INDEX idx_bets_event_key ON bets(event_key);
CREATE INDEX idx_bets_created_at ON bets(created_at DESC);

-- Add comments
COMMENT ON TABLE user_ebucks_balance IS 'Stores virtual currency (ebucks) balance for each user';
COMMENT ON TABLE bets IS 'Stores all betting transactions with match info, odds, and resolution status';
COMMENT ON COLUMN bets.bet_details IS 'JSONB storing bet-specific data: {alliance: "red"/"blue", margin: 5, threshold: 80, over_under: "over", parlay_bets: [...]}';
