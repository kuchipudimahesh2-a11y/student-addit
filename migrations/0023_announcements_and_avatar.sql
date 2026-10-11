ALTER TABLE users ADD COLUMN avatar_url TEXT;

CREATE TABLE IF NOT EXISTS system_announcements (
  id TEXT PRIMARY KEY,
  title TEXT,
  body TEXT NOT NULL,
  image_url TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS system_announcements_created_idx ON system_announcements(created_at DESC);
