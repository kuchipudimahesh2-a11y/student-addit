-- 0029_pulse_reels_views.sql
-- Adda Pulse Reels Viewing History & Analytics Engine

CREATE TABLE IF NOT EXISTS pulse_reel_views (
  reel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  watch_count INTEGER NOT NULL DEFAULT 1,
  last_watched_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (reel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_reel_views_user ON pulse_reel_views (user_id, last_watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_reel_views_reel ON pulse_reel_views (reel_id, last_watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_reels_feed_sort ON pulse_reels (category, created_at DESC, id DESC);
