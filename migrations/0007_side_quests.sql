CREATE TABLE side_quests (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL CHECK (length(question) BETWEEN 3 AND 240),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

CREATE TABLE side_quest_answers (
  id TEXT PRIMARY KEY,
  quest_id TEXT NOT NULL REFERENCES side_quests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (quest_id, user_id)
);

CREATE INDEX side_quests_status_created_idx ON side_quests(status, created_at DESC);
CREATE INDEX side_quest_answers_quest_created_idx ON side_quest_answers(quest_id, created_at ASC);
