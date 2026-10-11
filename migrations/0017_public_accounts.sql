ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'public' CHECK (account_type IN ('public', 'private'));
CREATE INDEX IF NOT EXISTS users_account_type_created_idx ON users(account_type, created_at DESC);
