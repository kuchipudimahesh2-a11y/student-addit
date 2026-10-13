-- Migration 0026: Pulse Production Upgrade — Moderation, Reporting, Blocking & Indexed Engagement
PRAGMA foreign_keys = ON;

-- 1. Add moderation flags and aggregate counter columns to pulse_posts
ALTER TABLE pulse_posts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pulse_posts ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pulse_posts ADD COLUMN reaction_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pulse_posts ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;

-- 2. Add moderation flags to pulse_comments
ALTER TABLE pulse_comments ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pulse_comments ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;

-- 3. Backfill initial reaction and comment counts from existing rows
UPDATE pulse_posts SET reaction_count = (
  SELECT COUNT(*) FROM pulse_reactions WHERE pulse_reactions.post_id = pulse_posts.id
);

UPDATE pulse_posts SET comment_count = (
  SELECT COUNT(*) FROM pulse_comments WHERE pulse_comments.post_id = pulse_posts.id AND pulse_comments.is_deleted = 0
);

-- 4. High-performance indexes for keyset pagination and filtering
CREATE INDEX IF NOT EXISTS pulse_posts_fresh_idx ON pulse_posts(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS pulse_posts_trending_idx ON pulse_posts(reaction_count DESC, comment_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS pulse_posts_debated_idx ON pulse_posts(comment_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS pulse_posts_prompt_idx ON pulse_posts(prompt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pulse_posts_user_created_idx ON pulse_posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pulse_comments_user_created_idx ON pulse_comments(user_id, created_at DESC);

-- 5. Student Community Reporting Table
CREATE TABLE IF NOT EXISTS pulse_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 2 AND 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pulse_reports_status_idx ON pulse_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS pulse_reports_target_idx ON pulse_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS pulse_reports_reporter_created_idx ON pulse_reports(reporter_id, created_at DESC);

-- 6. User Blocks & Unwanted Interactions Table
CREATE TABLE IF NOT EXISTS user_blocks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_user_idx ON user_blocks(user_id);
