-- Migration 0033: Chat Features Expansion (Documents, Starred, Pinning, Ephemeral, Announcements, Polls)
PRAGMA foreign_keys = OFF;

-- 1. Starred Messages Table
CREATE TABLE IF NOT EXISTS chat_starred_messages (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  chat_kind TEXT NOT NULL CHECK (chat_kind IN ('dm', 'group')),
  room_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_starred_user ON chat_starred_messages(user_id, created_at DESC);

-- 2. Add columns to dm_conversations
ALTER TABLE dm_conversations ADD COLUMN pinned_message_id TEXT;
ALTER TABLE dm_conversations ADD COLUMN disappearing_duration_seconds INTEGER NOT NULL DEFAULT 0;

-- 3. Add columns to groups
ALTER TABLE groups ADD COLUMN pinned_message_id TEXT;
ALTER TABLE groups ADD COLUMN disappearing_duration_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE groups ADD COLUMN announcement_only INTEGER NOT NULL DEFAULT 0;

-- 4. Recreate dm_messages to allow 'document' in media_type and add metadata columns
CREATE TABLE IF NOT EXISTS dm_messages_new (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at TEXT,
  reply_to_message_id TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'gif', 'voice_note', 'document')),
  media_url TEXT,
  media_duration_seconds INTEGER,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  file_name TEXT,
  file_size INTEGER,
  is_forwarded INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  poll_id TEXT
);

INSERT OR IGNORE INTO dm_messages_new (
  id, conversation_id, sender_id, body, created_at, edited_at,
  reply_to_message_id, media_type, media_url, media_duration_seconds,
  is_deleted, file_name, file_size, is_forwarded, expires_at, poll_id
)
SELECT
  id, conversation_id, sender_id, body, created_at, edited_at,
  reply_to_message_id, media_type, media_url, media_duration_seconds,
  is_deleted, NULL, NULL, 0, NULL, NULL
FROM dm_messages;

DROP TABLE IF EXISTS dm_messages;
ALTER TABLE dm_messages_new RENAME TO dm_messages;
CREATE INDEX IF NOT EXISTS dm_messages_conversation_created_idx ON dm_messages(conversation_id, created_at DESC);

-- 5. Recreate group_messages to allow 'document' in media_type and add metadata columns
CREATE TABLE IF NOT EXISTS group_messages_new (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at TEXT,
  reply_to_message_id TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'gif', 'voice_note', 'document')),
  media_url TEXT,
  media_duration_seconds INTEGER,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  file_name TEXT,
  file_size INTEGER,
  is_forwarded INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  poll_id TEXT
);

INSERT OR IGNORE INTO group_messages_new (
  id, group_id, sender_id, body, created_at, edited_at,
  reply_to_message_id, media_type, media_url, media_duration_seconds,
  is_deleted, file_name, file_size, is_forwarded, expires_at, poll_id
)
SELECT
  id, group_id, sender_id, body, created_at, edited_at,
  reply_to_message_id, media_type, media_url, media_duration_seconds,
  is_deleted, NULL, NULL, 0, NULL, NULL
FROM group_messages;

DROP TABLE IF EXISTS group_messages;
ALTER TABLE group_messages_new RENAME TO group_messages;
CREATE INDEX IF NOT EXISTS group_messages_group_created_idx ON group_messages(group_id, created_at DESC);

PRAGMA foreign_keys = ON;
