
-- ---------- Work item types and issue keys (for example DEV-12) ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
    CREATE TYPE task_type AS ENUM ('task', 'bug', 'story');
  END IF;
END $$;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type task_type NOT NULL DEFAULT 'task';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(6);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS task_counter INTEGER NOT NULL DEFAULT 0;

-- Existing projects get a prefix from the letters in their name, and existing tasks get numbers
UPDATE projects
SET key_prefix = COALESCE(NULLIF(UPPER(LEFT(regexp_replace(name, '[^A-Za-z]', '', 'g'), 3)), ''), 'PRJ')
WHERE key_prefix IS NULL;

UPDATE tasks t
SET number = s.rn + COALESCE((SELECT MAX(x.number) FROM tasks x WHERE x.project_id = t.project_id), 0)
FROM (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
  FROM tasks
  WHERE number IS NULL
) s
WHERE t.id = s.id;

UPDATE projects p
SET task_counter = GREATEST(p.task_counter, COALESCE((SELECT MAX(t.number) FROM tasks t WHERE t.project_id = p.id), 0));

ALTER TABLE tasks ALTER COLUMN number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_project_number ON tasks(project_id, number);

-- Every new task gets the next number of its project, whichever way it is inserted
CREATE OR REPLACE FUNCTION assign_task_number() RETURNS trigger AS $$
DECLARE
  n INTEGER;
BEGIN
  IF NEW.number IS NULL THEN
    UPDATE projects
    SET task_counter = task_counter + 1,
        key_prefix = COALESCE(key_prefix, NULLIF(UPPER(LEFT(regexp_replace(name, '[^A-Za-z]', '', 'g'), 3)), ''), 'PRJ')
    WHERE id = NEW.project_id
    RETURNING task_counter INTO n;
    NEW.number := n;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_assign_number ON tasks;
CREATE TRIGGER tasks_assign_number BEFORE INSERT ON tasks
FOR EACH ROW EXECUTE FUNCTION assign_task_number();