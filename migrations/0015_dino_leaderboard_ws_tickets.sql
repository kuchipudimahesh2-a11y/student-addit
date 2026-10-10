CREATE TABLE dino_leaderboard_ws_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX dino_leaderboard_ws_tickets_expiry_idx ON dino_leaderboard_ws_tickets(expires_at);
