-- Migration 0038: Drop remaining Pulse & Reels tables
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS pulse_reel_events;
DROP TABLE IF EXISTS pulse_reel_likes;
DROP TABLE IF EXISTS pulse_reel_views;
DROP TABLE IF EXISTS anonymous_asks;

PRAGMA foreign_keys = ON;
