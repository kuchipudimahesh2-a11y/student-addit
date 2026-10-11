CREATE TABLE voice_calls (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('dm', 'random')),
  conversation_id TEXT REFERENCES dm_conversations(id) ON DELETE CASCADE,
  random_match_id TEXT,
  caller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ringing', 'accepted', 'connected', 'declined', 'cancelled', 'missed', 'completed', 'ended', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  connected_at TEXT,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  CHECK (caller_id <> recipient_id),
  CHECK ((scope = 'dm' AND conversation_id IS NOT NULL AND random_match_id IS NULL) OR (scope = 'random' AND conversation_id IS NULL AND random_match_id IS NOT NULL))
);
CREATE INDEX voice_calls_dm_history_idx ON voice_calls(conversation_id, created_at DESC, id DESC) WHERE scope = 'dm';
CREATE INDEX voice_calls_random_match_idx ON voice_calls(random_match_id, status);
CREATE INDEX voice_calls_participants_idx ON voice_calls(caller_id, recipient_id, status);

CREATE TABLE voice_active_members (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE
);
CREATE INDEX voice_active_members_call_idx ON voice_active_members(call_id);

CREATE TABLE voice_call_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX voice_call_attempts_user_time_idx ON voice_call_attempts(user_id, attempted_at);

CREATE TABLE voice_ws_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('inbox', 'session')),
  call_id TEXT REFERENCES voice_calls(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  CHECK ((purpose = 'inbox' AND call_id IS NULL) OR (purpose = 'session' AND call_id IS NOT NULL))
);
CREATE INDEX voice_ws_tickets_expiry_idx ON voice_ws_tickets(expires_at);
