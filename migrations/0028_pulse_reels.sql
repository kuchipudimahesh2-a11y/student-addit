-- 0028_pulse_reels.sql
-- Adda Pulse Reels & Shorts Engine

CREATE TABLE IF NOT EXISTS pulse_reels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  caption TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER DEFAULT 15,
  author_name TEXT NOT NULL DEFAULT 'Campus Viral',
  author_avatar TEXT,
  sound_title TEXT DEFAULT 'Original Audio · Campus Vibes',
  category TEXT NOT NULL DEFAULT 'campus_life',
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_pulse_reels_category ON pulse_reels (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_reels_created ON pulse_reels (created_at DESC);

CREATE TABLE IF NOT EXISTS pulse_reel_likes (
  reel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS pulse_reel_comments (
  id TEXT PRIMARY KEY,
  reel_id TEXT NOT NULL,
  user_id TEXT,
  author_handle TEXT NOT NULL,
  avatar_url TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_pulse_reel_comments ON pulse_reel_comments (reel_id, created_at ASC);
