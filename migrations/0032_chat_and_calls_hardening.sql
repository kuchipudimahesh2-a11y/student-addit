-- Migration 0032: Chat & Calls Hardening, WebSocket Tickets, and Schema Alignment
PRAGMA foreign_keys = OFF;

-- 1. Single-use hashed WebSocket tickets for chat rooms
CREATE TABLE IF NOT EXISTS chat_ws_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_key TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_ws_tickets_expires ON chat_ws_tickets(expires_at);

-- 2. Single-use hashed WebSocket tickets for polls
CREATE TABLE IF NOT EXISTS polls_ws_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_polls_ws_tickets_expires ON polls_ws_tickets(expires_at);

-- 3. Align link_previews schema
CREATE TABLE IF NOT EXISTS link_previews_aligned (
  url TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  image TEXT,
  site_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO link_previews_aligned (url, title, description, image, site_name, created_at)
SELECT url, title, description, NULL, NULL, created_at FROM link_previews;

DROP TABLE IF EXISTS link_previews;
ALTER TABLE link_previews_aligned RENAME TO link_previews;

PRAGMA foreign_keys = ON;
