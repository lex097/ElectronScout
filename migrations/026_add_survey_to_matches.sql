-- Add survey column to matches table for post-match survey data (JSON)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS survey JSONB;

COMMENT ON COLUMN matches.survey IS 'Post-match survey answers: ratings, choices, notes. Keyed by question id.';
