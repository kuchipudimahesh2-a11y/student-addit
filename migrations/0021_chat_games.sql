CREATE TABLE dm_games (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK (game_type IN ('tictactoe', 'truth_or_dare')),
  grid_size INTEGER NOT NULL DEFAULT 3 CHECK (grid_size IN (3, 6)),
  target_streak INTEGER NOT NULL DEFAULT 3,
  player_x_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_o_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turn_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'won', 'draw', 'abandoned')),
  winner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  board_state TEXT NOT NULL,
  winning_line TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX dm_games_conversation_idx ON dm_games(conversation_id, created_at DESC);
CREATE INDEX dm_games_active_idx ON dm_games(conversation_id, status) WHERE status = 'in_progress';
