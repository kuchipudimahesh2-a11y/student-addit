CREATE TABLE mini_game_bests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL CHECK (game_id IN ('quick-tap', 'perfect-timing', 'dodge-box', 'catch-it', 'reaction-test')),
  best_score INTEGER NOT NULL CHECK (best_score >= 0 AND best_score <= 1000000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, game_id)
);
