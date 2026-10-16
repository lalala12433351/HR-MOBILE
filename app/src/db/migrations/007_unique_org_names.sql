-- =============================================================================
-- Migration 007: One department per name, one team per name within a department
-- Executes within an isolated tenant schema (search_path set by the caller).
-- Runs after 006 because duplicate chat channels are merged here as well.
-- Duplicates are merged into the oldest row; people, leads and messages move over.
-- =============================================================================

-- ---------------------------------------------------------------- departments
CREATE TEMP TABLE _dept_merge ON COMMIT DROP AS
SELECT dup_id, keep_id FROM (
  SELECT id AS dup_id,
         FIRST_VALUE(id) OVER (PARTITION BY LOWER(name) ORDER BY created_at, id) AS keep_id
  FROM departments
) x
WHERE dup_id <> keep_id;

UPDATE teams t SET department_id = m.keep_id FROM _dept_merge m WHERE t.department_id = m.dup_id;
UPDATE job_roles r SET department_id = m.keep_id FROM _dept_merge m WHERE r.department_id = m.dup_id;
UPDATE employees e SET department_id = m.keep_id FROM _dept_merge m WHERE e.department_id = m.dup_id;
UPDATE announcements a SET target_department_id = m.keep_id FROM _dept_merge m WHERE a.target_department_id = m.dup_id;
UPDATE departments d SET lead_employee_id = dup.lead_employee_id
FROM _dept_merge m JOIN departments dup ON dup.id = m.dup_id
WHERE d.id = m.keep_id AND d.lead_employee_id IS NULL AND dup.lead_employee_id IS NOT NULL;

INSERT INTO department_leads (department_id, employee_id, is_primary)
SELECT m.keep_id, l.employee_id, false
FROM department_leads l JOIN _dept_merge m ON m.dup_id = l.department_id
ON CONFLICT (department_id, employee_id) DO NOTHING;

UPDATE chat_conversations c SET department_id = m.keep_id
FROM _dept_merge m
WHERE c.department_id = m.dup_id AND c.team_id IS NOT NULL;

CREATE TEMP TABLE _dept_channel_merge ON COMMIT DROP AS
SELECT dup.id AS dup_conv, keep.id AS keep_conv
FROM _dept_merge m
JOIN chat_conversations dup
  ON dup.department_id = m.dup_id AND dup.type = 'team_channel' AND dup.team_id IS NULL
JOIN chat_conversations keep
  ON keep.department_id = m.keep_id AND keep.type = 'team_channel' AND keep.team_id IS NULL;

UPDATE chat_messages msg SET conversation_id = cm.keep_conv
FROM _dept_channel_merge cm WHERE msg.conversation_id = cm.dup_conv;
DELETE FROM chat_conversations c USING _dept_channel_merge cm WHERE c.id = cm.dup_conv;

UPDATE chat_conversations c SET department_id = m.keep_id
FROM _dept_merge m
WHERE c.department_id = m.dup_id AND c.type = 'team_channel' AND c.team_id IS NULL;

DELETE FROM departments d USING _dept_merge m WHERE d.id = m.dup_id;

CREATE UNIQUE INDEX IF NOT EXISTS departments_name_uq ON departments (LOWER(name));

-- ---------------------------------------------------------------------- teams
CREATE TEMP TABLE _team_merge ON COMMIT DROP AS
SELECT dup_id, keep_id FROM (
  SELECT id AS dup_id,
         FIRST_VALUE(id) OVER (PARTITION BY department_id, LOWER(name) ORDER BY created_at, id) AS keep_id
  FROM teams
) x
WHERE dup_id <> keep_id;

UPDATE employees e SET team_id = m.keep_id FROM _team_merge m WHERE e.team_id = m.dup_id;
UPDATE teams t SET lead_employee_id = dup.lead_employee_id
FROM _team_merge m JOIN teams dup ON dup.id = m.dup_id
WHERE t.id = m.keep_id AND t.lead_employee_id IS NULL AND dup.lead_employee_id IS NOT NULL;

INSERT INTO team_leads (team_id, employee_id, is_primary)
SELECT m.keep_id, l.employee_id, false
FROM team_leads l JOIN _team_merge m ON m.dup_id = l.team_id
ON CONFLICT (team_id, employee_id) DO NOTHING;

CREATE TEMP TABLE _team_channel_merge ON COMMIT DROP AS
SELECT dup.id AS dup_conv, keep.id AS keep_conv
FROM _team_merge m
JOIN chat_conversations dup ON dup.team_id = m.dup_id AND dup.type = 'team_channel'
JOIN chat_conversations keep ON keep.team_id = m.keep_id AND keep.type = 'team_channel';

UPDATE chat_messages msg SET conversation_id = cm.keep_conv
FROM _team_channel_merge cm WHERE msg.conversation_id = cm.dup_conv;
DELETE FROM chat_conversations c USING _team_channel_merge cm WHERE c.id = cm.dup_conv;

UPDATE chat_conversations c SET team_id = m.keep_id
FROM _team_merge m
WHERE c.team_id = m.dup_id AND c.type = 'team_channel';

DELETE FROM teams t USING _team_merge m WHERE t.id = m.dup_id;

CREATE UNIQUE INDEX IF NOT EXISTS teams_department_name_uq ON teams (department_id, LOWER(name));

-- Channels that received merged messages should sort by their newest message.
UPDATE chat_conversations c
SET last_message_at = latest.created_at
FROM (SELECT conversation_id, MAX(created_at) AS created_at FROM chat_messages GROUP BY conversation_id) latest
WHERE latest.conversation_id = c.id AND c.type = 'team_channel' AND latest.created_at > c.last_message_at;
