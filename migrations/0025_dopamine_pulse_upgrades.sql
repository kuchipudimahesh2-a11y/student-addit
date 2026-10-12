-- Migration 0025: High-Dopamine & Customization Upgrades for Pulse
PRAGMA foreign_keys = ON;

-- Add customization and dopamine attributes to pulse_posts
ALTER TABLE pulse_posts ADD COLUMN vibe_sticker TEXT;
ALTER TABLE pulse_posts ADD COLUMN font_style TEXT NOT NULL DEFAULT 'sans';
ALTER TABLE pulse_posts ADD COLUMN is_spoiler INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pulse_posts ADD COLUMN gradient_theme TEXT NOT NULL DEFAULT 'aurora';

-- Index for filtering by vibe or spoilers if needed
CREATE INDEX IF NOT EXISTS pulse_posts_spoiler_idx ON pulse_posts(is_spoiler);
