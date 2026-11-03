-- Mentions in project chat have no task, so notifications can point at a project directly
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;