-- Migration: 0039_ai_teach.sql
-- Tables for AI Teach (ChatGPT-like Tutor with document learning)

CREATE TABLE IF NOT EXISTS ai_teach_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  document_name TEXT,
  document_type TEXT,
  document_size INTEGER DEFAULT 0,
  teaching_mode TEXT DEFAULT 'step_by_step',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_teach_sessions_user_updated ON ai_teach_sessions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_teach_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant' or 'system'
  content TEXT NOT NULL,
  attachments TEXT,   -- JSON string: { fileName, fileType, fileSize, preview }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_teach_messages_session ON ai_teach_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_teach_messages_user ON ai_teach_messages(user_id, created_at ASC);
