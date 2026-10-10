-- Group access now uses public discovery or bearer invite links instead of
-- exposing an eight-digit number and shared password.
ALTER TABLE groups ADD COLUMN require_approval INTEGER NOT NULL DEFAULT 0 CHECK (require_approval IN (0, 1));
UPDATE groups SET require_approval = CASE WHEN visibility = 'private' THEN 1 ELSE 0 END;

-- Invalidate legacy shared passwords. The column remains only to satisfy the
-- original SQLite table constraint; no API reads or accepts this sentinel.
UPDATE groups SET password_hash = 'invite-link-only' WHERE visibility = 'private';

CREATE TABLE group_invite_links (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at TEXT
);
CREATE INDEX group_invite_links_active_idx ON group_invite_links(group_id, revoked_at, created_at DESC);

CREATE TABLE group_join_requests (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX group_join_requests_pending_unique_idx ON group_join_requests(group_id, user_id) WHERE status = 'pending';
CREATE INDEX group_join_requests_user_idx ON group_join_requests(user_id, status, created_at DESC);
CREATE INDEX group_join_requests_group_idx ON group_join_requests(group_id, status, created_at DESC);
