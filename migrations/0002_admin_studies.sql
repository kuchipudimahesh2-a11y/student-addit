ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin'));
ALTER TABLE users ADD COLUMN is_suspended INTEGER NOT NULL DEFAULT 0 CHECK (is_suspended IN (0, 1));

CREATE TABLE admin_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bootstrap_completed INTEGER NOT NULL DEFAULT 0 CHECK (bootstrap_completed IN (0, 1)),
  bootstrap_admin_id TEXT REFERENCES users(id)
);
INSERT INTO admin_settings (id) VALUES (1);

CREATE TABLE study_sections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_posts (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES study_sections(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 5000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES study_posts(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_ws_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES study_sections(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX study_posts_section_created_idx ON study_posts(section_id, created_at DESC);
CREATE INDEX study_attachments_post_idx ON study_attachments(post_id);
CREATE INDEX study_ws_tickets_expiry_idx ON study_ws_tickets(expires_at);
CREATE INDEX admin_audit_created_idx ON admin_audit_log(created_at DESC);
CREATE UNIQUE INDEX study_sections_name_idx ON study_sections(name COLLATE NOCASE);
