
-- ---------- Sprints and the backlog (tasks without a sprint are the backlog) ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sprint_status') THEN
    CREATE TYPE sprint_status AS ENUM ('planned', 'active', 'completed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sprints (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    goal         TEXT,
    status       sprint_status NOT NULL DEFAULT 'planned',
    start_date   DATE,
    end_date     DATE,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by   UUID NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id, created_at);
-- The database itself allows only one active sprint per project, even if two requests arrive together
CREATE UNIQUE INDEX IF NOT EXISTS idx_sprints_one_active ON sprints(project_id) WHERE status = 'active';

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);