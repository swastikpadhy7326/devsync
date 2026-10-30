
-- ---------- File attachments (photos and PDFs) for chat messages and tasks ----------
-- A chat message may now be only a file, so the body may be empty (it is still limited to 2000 characters)
DO $$
DECLARE
  c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'chat_messages'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%char_length(body)%'
  LOOP
    EXECUTE format('ALTER TABLE chat_messages DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_body_length CHECK (char_length(body) <= 2000);

CREATE TABLE IF NOT EXISTS attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    message_id   UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
    task_id      UUID REFERENCES tasks(id) ON DELETE CASCADE,
    uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    filename     VARCHAR(200) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes   INTEGER NOT NULL CHECK (size_bytes > 0),
    data         BYTEA NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- a file belongs to a chat message or to a task, never both and never neither
    CHECK ((message_id IS NOT NULL) <> (task_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_attachments_project ON attachments(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_one_per_message ON attachments(message_id) WHERE message_id IS NOT NULL;