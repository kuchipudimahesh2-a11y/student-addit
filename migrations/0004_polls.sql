CREATE TABLE polls (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL CHECK (length(question) BETWEEN 3 AND 240),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

CREATE TABLE poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 160),
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (poll_id, position),
  UNIQUE (poll_id, id)
);

CREATE TABLE poll_votes (
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id, user_id),
  FOREIGN KEY (poll_id, option_id) REFERENCES poll_options(poll_id, id) ON DELETE CASCADE
);

CREATE INDEX polls_status_created_idx ON polls(status, created_at DESC);
CREATE INDEX poll_options_poll_idx ON poll_options(poll_id, position);
CREATE INDEX poll_votes_option_idx ON poll_votes(poll_id, option_id);
