-- DevSync database schema (PostgreSQL)
-- Run the whole script in DBeaver: open SQL Editor, paste, then press Alt+X (Execute script).

-- ---------- Enums ----------
CREATE TYPE team_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE notification_type AS ENUM ('task_assigned', 'mentioned', 'comment_added', 'team_invite');

-- ---------- Users and auth ----------
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- One-time tokens for "forgot password". Only a hash of the token is stored.
CREATE TABLE password_resets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);

-- ---------- Teams ----------
CREATE TABLE teams (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
    team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      team_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON team_members(user_id);

CREATE TABLE invitations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email       VARCHAR(255) NOT NULL,
    role        team_role NOT NULL DEFAULT 'member',
    token_hash  TEXT NOT NULL UNIQUE,
    invited_by  UUID NOT NULL REFERENCES users(id),
    expires_at  TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invitations_team ON invitations(team_id);
CREATE INDEX idx_invitations_email ON invitations(email);

-- ---------- Projects and tasks ----------
CREATE TABLE projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    description TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_team ON projects(team_id);

CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    status      task_status NOT NULL DEFAULT 'todo',
    priority    task_priority NOT NULL DEFAULT 'medium',
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by  UUID NOT NULL REFERENCES users(id),
    due_date    DATE,
    position    INTEGER NOT NULL DEFAULT 0,  -- order of the card inside its Kanban column
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Board view: tasks of a project grouped by status and ordered by position
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status, position);
-- "My tasks" view
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);

-- ---------- Collaboration ----------
CREATE TABLE comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_task ON comments(task_id, created_at);

-- Project chat: one room per project
CREATE TABLE chat_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_project ON chat_messages(project_id, created_at DESC);

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       notification_type NOT NULL,
    task_id    UUID REFERENCES tasks(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Fast "unread notifications for this user" lookup
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE activity_logs (
    id          BIGSERIAL PRIMARY KEY,
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(50) NOT NULL,   -- e.g. 'task_created', 'task_moved', 'comment_added'
    entity_type VARCHAR(30) NOT NULL,   -- e.g. 'task', 'comment'
    entity_id   UUID,
    metadata    JSONB NOT NULL DEFAULT '{}',  -- e.g. {"from": "todo", "to": "done"}
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_project ON activity_logs(project_id, created_at DESC);

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
