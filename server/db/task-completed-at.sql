
-- ---------- Exact completion time of a task ----------
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Tasks that were already finished get their last update as a best guess
UPDATE tasks SET completed_at = updated_at WHERE status = 'done' AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION set_task_completed_at() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at THEN
    IF NEW.status = 'done' THEN
      NEW.completed_at := now();
    ELSE
      NEW.completed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_set_completed_at ON tasks;
CREATE TRIGGER tasks_set_completed_at BEFORE INSERT OR UPDATE OF status, completed_at ON tasks
FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();