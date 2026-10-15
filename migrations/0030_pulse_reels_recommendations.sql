-- 0030_pulse_reels_recommendations.sql
-- Adda Pulse Reels Recommendation Engine & Behavioral Telemetry Schema

CREATE TABLE IF NOT EXISTS pulse_reel_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reel_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  duration_watched_ms INTEGER DEFAULT 0,
  completion_percent REAL DEFAULT 0.0,
  category TEXT,
  author_name TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_pulse_events_user ON pulse_reel_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_events_reel ON pulse_reel_events (reel_id, event_type);
CREATE INDEX IF NOT EXISTS idx_pulse_events_dedup ON pulse_reel_events (user_id, reel_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS pulse_user_profiles (
  user_id TEXT PRIMARY KEY,
  topic_affinities TEXT NOT NULL DEFAULT '{}',
  creator_affinities TEXT NOT NULL DEFAULT '{}',
  total_impressions INTEGER DEFAULT 0,
  total_watches INTEGER DEFAULT 0,
  total_completions INTEGER DEFAULT 0,
  total_replays INTEGER DEFAULT 0,
  total_skips INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0,
  total_not_interested INTEGER DEFAULT 0,
  avg_completion_rate REAL DEFAULT 0.0,
  last_active_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_pulse_user_profiles_updated ON pulse_user_profiles (updated_at DESC);

CREATE TABLE IF NOT EXISTS pulse_user_negative_signals (
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'not_interested',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_neg_user ON pulse_user_negative_signals (user_id, target_type);
