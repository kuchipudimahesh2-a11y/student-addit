-- Migration 0031: Drop Discussions & Reels systems completely (no trace)
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS pulse_reels_interactions;
DROP TABLE IF EXISTS pulse_reels_user_affinities;
DROP TABLE IF EXISTS pulse_reels_views;
DROP TABLE IF EXISTS pulse_reels_likes;
DROP TABLE IF EXISTS pulse_reel_comments;
DROP TABLE IF EXISTS pulse_reels;
DROP TABLE IF EXISTS pulse_reports;
DROP TABLE IF EXISTS pulse_moderation_reports;
DROP TABLE IF EXISTS pulse_poll_votes;
DROP TABLE IF EXISTS pulse_reactions;
DROP TABLE IF EXISTS pulse_comments;
DROP TABLE IF EXISTS pulse_posts;
DROP TABLE IF EXISTS pulse_prompts;
DROP TABLE IF EXISTS pulse_syndicated_sources;
DROP TABLE IF EXISTS pulse_user_profiles;
DROP TABLE IF EXISTS pulse_user_negative_signals;

PRAGMA foreign_keys = ON;
