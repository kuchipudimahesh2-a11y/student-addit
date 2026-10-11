CREATE TABLE IF NOT EXISTS chat_read_states (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_kind TEXT NOT NULL CHECK (chat_kind IN ('dm', 'group')),
  chat_id TEXT NOT NULL,
  last_read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, chat_kind, chat_id)
);

CREATE INDEX IF NOT EXISTS chat_read_states_user_idx ON chat_read_states(user_id, chat_kind, chat_id);
