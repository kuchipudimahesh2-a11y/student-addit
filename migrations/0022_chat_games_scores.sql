-- Add score columns for 6x6 Points Battle mode in in-chat games
ALTER TABLE dm_games ADD COLUMN score_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dm_games ADD COLUMN score_o INTEGER NOT NULL DEFAULT 0;
