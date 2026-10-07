CREATE TABLE side_quest_push_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('quest-published', 'answer-posted')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'completed', 'failed')),
  target_count INTEGER NOT NULL DEFAULT 0 CHECK (target_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE side_quest_push_deliveries (
  event_id TEXT NOT NULL REFERENCES side_quest_push_events(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'expired', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, subscription_id)
);

CREATE INDEX side_quest_push_deliveries_pending_idx
  ON side_quest_push_deliveries(event_id, status, subscription_id);
