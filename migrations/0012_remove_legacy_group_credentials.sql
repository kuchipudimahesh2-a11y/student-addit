-- Rebuild the group tables without the retired numeric group code and shared
-- password columns. Copy every group, membership, invitation, message, and
-- invite-link record before replacing the old tables.
CREATE TABLE groups_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  require_approval INTEGER NOT NULL DEFAULT 0 CHECK (require_approval IN (0, 1))
);
INSERT INTO groups_v2 (id, name, visibility, created_by, created_at, require_approval)
SELECT id, name, visibility, created_by, created_at, require_approval FROM groups;

CREATE TABLE group_memberships_v2 (
  group_id TEXT NOT NULL REFERENCES groups_v2(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(group_id, user_id)
);
INSERT INTO group_memberships_v2 (group_id, user_id, role, joined_at)
SELECT group_id, user_id, role, joined_at FROM group_memberships;

CREATE TABLE group_invitations_v2 (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups_v2(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (inviter_id <> invitee_id)
);
INSERT INTO group_invitations_v2 (id, group_id, inviter_id, invitee_id, status, created_at, updated_at)
SELECT id, group_id, inviter_id, invitee_id, status, created_at, updated_at FROM group_invitations;

CREATE TABLE group_messages_v2 (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups_v2(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO group_messages_v2 (id, group_id, sender_id, body, created_at)
SELECT id, group_id, sender_id, body, created_at FROM group_messages;

CREATE TABLE group_invite_links_v2 (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups_v2(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at TEXT
);
INSERT INTO group_invite_links_v2 (id, group_id, token_hash, created_by, created_at, revoked_at, use_count, last_used_at)
SELECT id, group_id, token_hash, created_by, created_at, revoked_at, use_count, last_used_at FROM group_invite_links;

CREATE TABLE group_join_requests_v2 (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups_v2(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO group_join_requests_v2 (id, group_id, user_id, status, created_at, updated_at)
SELECT id, group_id, user_id, status, created_at, updated_at FROM group_join_requests;

DROP TABLE group_messages;
DROP TABLE group_invitations;
DROP TABLE group_memberships;
DROP TABLE group_invite_links;
DROP TABLE group_join_requests;
DROP TABLE groups;

ALTER TABLE groups_v2 RENAME TO groups;
ALTER TABLE group_memberships_v2 RENAME TO group_memberships;
ALTER TABLE group_invitations_v2 RENAME TO group_invitations;
ALTER TABLE group_messages_v2 RENAME TO group_messages;
ALTER TABLE group_invite_links_v2 RENAME TO group_invite_links;
ALTER TABLE group_join_requests_v2 RENAME TO group_join_requests;

CREATE INDEX groups_name_idx ON groups(name COLLATE NOCASE);
CREATE INDEX group_memberships_user_idx ON group_memberships(user_id, joined_at DESC);
CREATE UNIQUE INDEX group_invitation_pending_unique_idx ON group_invitations(group_id, invitee_id) WHERE status = 'pending';
CREATE INDEX group_invitations_invitee_idx ON group_invitations(invitee_id, status, created_at DESC);
CREATE INDEX group_messages_group_created_idx ON group_messages(group_id, created_at DESC);
CREATE INDEX group_invite_links_active_idx ON group_invite_links(group_id, revoked_at, created_at DESC);
CREATE UNIQUE INDEX group_join_requests_pending_unique_idx ON group_join_requests(group_id, user_id) WHERE status = 'pending';
CREATE INDEX group_join_requests_user_idx ON group_join_requests(user_id, status, created_at DESC);
CREATE INDEX group_join_requests_group_idx ON group_join_requests(group_id, status, created_at DESC);
