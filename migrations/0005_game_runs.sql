CREATE TABLE game_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 1000000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX game_runs_user_created_idx ON game_runs(user_id, created_at DESC);
CREATE INDEX game_runs_created_idx ON game_runs(created_at DESC);

INSERT INTO game_runs (id, user_id, score)
SELECT 'legacy-best-' || user_id, user_id, best_score FROM scores WHERE best_score > 0;
