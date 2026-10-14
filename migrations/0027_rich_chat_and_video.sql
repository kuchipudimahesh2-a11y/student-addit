-- Migration 0027: Rich In-Chat Media, Reactions, Deletions, Link Previews, and Video Calling
PRAGMA foreign_keys = ON;

-- 1. Extend DM Messages with media and soft-delete fields
ALTER TABLE dm_messages ADD COLUMN media_type TEXT CHECK (media_type IN ('image', 'gif', 'voice_note'));
ALTER TABLE dm_messages ADD COLUMN media_url TEXT;
ALTER TABLE dm_messages ADD COLUMN media_duration_seconds INTEGER;
ALTER TABLE dm_messages ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;

-- 2. Extend Group Messages with media and soft-delete fields
ALTER TABLE group_messages ADD COLUMN media_type TEXT CHECK (media_type IN ('image', 'gif', 'voice_note'));
ALTER TABLE group_messages ADD COLUMN media_url TEXT;
ALTER TABLE group_messages ADD COLUMN media_duration_seconds INTEGER;
ALTER TABLE group_messages ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;

-- 3. Message Emoji Reactions Table
CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id TEXT PRIMARY KEY,
  chat_kind TEXT NOT NULL CHECK (chat_kind IN ('dm', 'group')),
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS chat_message_reactions_msg_idx ON chat_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS chat_message_reactions_user_idx ON chat_message_reactions(user_id);

-- 4. OpenGraph Link Previews Cache Table
CREATE TABLE IF NOT EXISTS link_previews (
  url TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  title TEXT,
  description TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Extend Voice Calls to support Video Calling mode
ALTER TABLE voice_calls ADD COLUMN call_mode TEXT NOT NULL DEFAULT 'audio' CHECK (call_mode IN ('audio', 'video'));
