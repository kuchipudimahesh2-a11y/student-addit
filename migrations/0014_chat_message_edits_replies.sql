ALTER TABLE dm_messages ADD COLUMN edited_at TEXT;
ALTER TABLE dm_messages ADD COLUMN reply_to_message_id TEXT REFERENCES dm_messages(id) ON DELETE SET NULL;

ALTER TABLE group_messages ADD COLUMN edited_at TEXT;
ALTER TABLE group_messages ADD COLUMN reply_to_message_id TEXT REFERENCES group_messages(id) ON DELETE SET NULL;
