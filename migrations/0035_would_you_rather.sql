-- Migration: 0035_would_you_rather.sql
-- Table for Global "Would You Rather" dilemmas
CREATE TABLE IF NOT EXISTS wyr_dilemmas (
  id TEXT PRIMARY KEY,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'universal',
  votes_a INTEGER NOT NULL DEFAULT 0,
  votes_b INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  is_approved INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wyr_dilemmas_created ON wyr_dilemmas(is_approved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wyr_dilemmas_category ON wyr_dilemmas(category, is_approved);

-- Table for tracking votes by user or anonymous device
CREATE TABLE IF NOT EXISTS wyr_votes (
  id TEXT PRIMARY KEY,
  dilemma_id TEXT NOT NULL REFERENCES wyr_dilemmas(id) ON DELETE CASCADE,
  voter_key TEXT NOT NULL,
  choice TEXT NOT NULL CHECK(choice IN ('a', 'b')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wyr_votes_unique ON wyr_votes(dilemma_id, voter_key);
CREATE INDEX IF NOT EXISTS idx_wyr_votes_voter ON wyr_votes(voter_key);

-- Initial curated universal starter dilemmas
INSERT OR IGNORE INTO wyr_dilemmas (id, option_a, option_b, category, votes_a, votes_b) VALUES
  ('wyr-1', 'Always know when someone is lying to you', 'Always get away with any lie you tell', 'superpower', 1420, 890),
  ('wyr-2', 'Have photographic memory of everything you see', 'Be able to speak every language on Earth fluently', 'superpower', 950, 1680),
  ('wyr-3', 'Win $10,000,000 in cash right now', 'Go back to age 10 with all your current knowledge', 'hypothetical', 1830, 1540),
  ('wyr-4', 'Never have to sleep again with zero fatigue', 'Never have to eat or drink again with peak nutrition', 'lifestyle', 2110, 640),
  ('wyr-5', 'Have a 1-minute real-life rewind button', 'Have a real-life pause button for up to 10 minutes', 'superpower', 1780, 1490),
  ('wyr-6', 'Travel 100 years into the future with zero memories', 'Travel 100 years into the past with all your memories', 'deep', 870, 1340),
  ('wyr-7', 'Always be 15 minutes late to everything', 'Always be 25 minutes early to everything', 'lifestyle', 620, 1980),
  ('wyr-8', 'Live in a world without music', 'Live in a world without movies and video games', 'lifestyle', 410, 2450),
  ('wyr-9', 'Be the smartest person in the room surrounded by fools', 'Be the most average person surrounded by geniuses', 'deep', 790, 1850),
  ('wyr-10', 'Unlimited free flights anywhere on Earth forever', 'Unlimited free 5-star hotel stays anywhere forever', 'lifestyle', 1920, 1130),
  ('wyr-11', 'Ace every exam without studying for more than 10 minutes', 'Get paid $2,000 every single month for simply attending class', 'college', 1430, 2180),
  ('wyr-12', 'Never feel physical pain again', 'Never feel emotional heartbreak again', 'deep', 810, 1960);
