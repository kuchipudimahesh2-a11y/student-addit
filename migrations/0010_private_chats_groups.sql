ALTER TABLE study_sections ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'lobby' CHECK (scope_type IN ('lobby', 'group'));
ALTER TABLE study_sections ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'lobby';
DROP INDEX IF EXISTS study_sections_name_idx;
CREATE UNIQUE INDEX study_sections_scoped_name_idx ON study_sections(scope_type, scope_id, name COLLATE NOCASE);

ALTER TABLE polls ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'lobby' CHECK (scope_type IN ('lobby', 'group'));
ALTER TABLE polls ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'lobby';
CREATE INDEX polls_scope_status_created_idx ON polls(scope_type, scope_id, status, created_at DESC);

CREATE TABLE friend_requests (
  id TEXT PRIMARY KEY,
  pair_low TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pair_high TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (pair_low < pair_high),
  CHECK (sender_id <> recipient_id),
  UNIQUE(pair_low, pair_high)
);
CREATE INDEX friend_requests_recipient_status_idx ON friend_requests(recipient_id, status, created_at DESC);
CREATE INDEX friend_requests_sender_status_idx ON friend_requests(sender_id, status, created_at DESC);

CREATE TABLE dm_conversations (
  id TEXT PRIMARY KEY,
  pair_low TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pair_high TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pair_low, pair_high),
  CHECK (pair_low < pair_high)
);
CREATE TABLE dm_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX dm_messages_conversation_created_idx ON dm_messages(conversation_id, created_at DESC);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  group_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  password_hash TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((visibility = 'public' AND password_hash IS NULL) OR (visibility = 'private' AND password_hash IS NOT NULL))
);
CREATE INDEX groups_name_idx ON groups(name COLLATE NOCASE);

CREATE TABLE group_memberships (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(group_id, user_id)
);
CREATE INDEX group_memberships_user_idx ON group_memberships(user_id, joined_at DESC);

CREATE TABLE group_invitations (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (inviter_id <> invitee_id)
);
CREATE UNIQUE INDEX group_invitation_pending_unique_idx ON group_invitations(group_id, invitee_id) WHERE status = 'pending';
CREATE INDEX group_invitations_invitee_idx ON group_invitations(invitee_id, status, created_at DESC);

CREATE TABLE group_messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX group_messages_group_created_idx ON group_messages(group_id, created_at DESC);

CREATE TABLE chat_push_events (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'completed', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE TABLE chat_push_deliveries (
  event_id TEXT NOT NULL REFERENCES chat_push_events(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'expired', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id, subscription_id)
);
CREATE INDEX chat_push_deliveries_pending_idx ON chat_push_deliveries(event_id, status, subscription_id);
