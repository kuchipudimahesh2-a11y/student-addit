-- Migration 0039: Complete and permanent purge of all historical Reels and Study Reels tables
PRAGMA foreign_keys = OFF;

-- Drop all Study Reels tables and associated indices
DROP TABLE IF EXISTS user_ai_generation_requests;
DROP TABLE IF EXISTS user_study_lessons;
DROP TABLE IF EXISTS study_lesson_batches;
DROP TABLE IF EXISTS study_deck_likes;
DROP TABLE IF EXISTS user_daily_ai_generations;
DROP TABLE IF EXISTS user_card_interactions;
DROP TABLE IF EXISTS study_cards;
DROP TABLE IF EXISTS study_decks;

-- Drop all legacy Pulse Reels tables and associated indices
DROP TABLE IF EXISTS pulse_reel_events;
DROP TABLE IF EXISTS pulse_reel_likes;
DROP TABLE IF EXISTS pulse_reel_views;
DROP TABLE IF EXISTS pulse_reels_interactions;
DROP TABLE IF EXISTS pulse_reels_user_affinities;
DROP TABLE IF EXISTS pulse_reels_views;
DROP TABLE IF EXISTS pulse_reels_likes;
DROP TABLE IF EXISTS pulse_reel_comments;
DROP TABLE IF EXISTS pulse_reels;

PRAGMA foreign_keys = ON;
