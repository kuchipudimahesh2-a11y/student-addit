-- Migration 0018: Bi-weekly game seasons and score reset
-- Creates season tracking table for 14-day reset cycles.
-- Clears historical game runs so Boys, Girls, and cumulative player totals start at 0 for Season 1,
-- while each player's all-time highest score in the `scores` table remains preserved.

CREATE TABLE game_seasons (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_season INTEGER NOT NULL DEFAULT 1,
  season_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_reset_at TEXT NOT NULL,
  last_reset_at TEXT
);

INSERT INTO game_seasons (id, current_season, season_started_at, next_reset_at, last_reset_at)
VALUES (1, 1, CURRENT_TIMESTAMP, datetime('now', '+14 days'), CURRENT_TIMESTAMP);

-- Reset existing game runs to zero out boys and girls team points and player cumulative run scores.
-- All-time highest scores in the `scores` table are preserved.
DELETE FROM game_runs;
