-- Keep the existing Aids 2 group and its message history. Open it for joining,
-- make the requested adda account its group admin, and add every account that
-- exists when this migration runs.
INSERT INTO groups (id, name, visibility, created_by, require_approval)
SELECT 'aids-2', 'Aids 2', 'public', owner.id, 0
FROM users owner
WHERE lower(owner.username) = lower('mahi2a494')
  AND NOT EXISTS (SELECT 1 FROM groups WHERE lower(name) = lower('Aids 2'))
ON CONFLICT(id) DO NOTHING;

UPDATE groups
SET name = 'Aids 2', visibility = 'public', require_approval = 0
WHERE lower(name) = lower('Aids 2');

UPDATE group_memberships
SET role = 'member'
WHERE group_id IN (SELECT id FROM groups WHERE lower(name) = lower('Aids 2'));

INSERT INTO group_memberships (group_id, user_id, role)
SELECT g.id, u.id, CASE WHEN lower(u.username) = lower('mahi2a494') THEN 'admin' ELSE 'member' END
FROM groups g
CROSS JOIN users u
WHERE lower(g.name) = lower('Aids 2')
ON CONFLICT(group_id, user_id) DO UPDATE SET role = excluded.role;

-- Move the former public-room conversation and resources into Aids 2 so they
-- remain available from the new chat list instead of being stranded off-screen.
INSERT OR IGNORE INTO group_messages (id, group_id, sender_id, body, created_at)
SELECT 'lobby-' || m.id, g.id, m.user_id, m.body, m.created_at
FROM messages m
CROSS JOIN groups g
WHERE lower(g.name) = lower('Aids 2');

UPDATE study_sections
SET name = substr(name, 1, 60) || ' (The adda ' || substr(id, 1, 8) || ')'
WHERE scope_type = 'lobby' AND scope_id = 'lobby'
  AND EXISTS (
    SELECT 1 FROM groups g JOIN study_sections existing
      ON existing.scope_type = 'group' AND existing.scope_id = g.id
     AND lower(existing.name) = lower(study_sections.name)
    WHERE lower(g.name) = lower('Aids 2')
  );

UPDATE study_sections
SET scope_type = 'group',
    scope_id = (SELECT id FROM groups WHERE lower(name) = lower('Aids 2'))
WHERE scope_type = 'lobby' AND scope_id = 'lobby'
  AND EXISTS (SELECT 1 FROM groups WHERE lower(name) = lower('Aids 2'));

UPDATE polls
SET scope_type = 'group',
    scope_id = (SELECT id FROM groups WHERE lower(name) = lower('Aids 2'))
WHERE scope_type = 'lobby' AND scope_id = 'lobby'
  AND EXISTS (SELECT 1 FROM groups WHERE lower(name) = lower('Aids 2'));

