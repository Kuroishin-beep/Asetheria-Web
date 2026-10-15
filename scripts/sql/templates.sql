-- ---------------------------------------------------------------------------
-- Phase 13: editable page templates. Idempotent; safe to run on every deploy.
-- Rollback: scripts/sql/templates-rollback.sql (drops the table; the built-in
-- defaults in src/lib/entry-templates.ts take over again, no page is touched).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS page_templates (
  kind        entry_kind PRIMARY KEY,
  body        text NOT NULL DEFAULT '',
  dm_notes    text NOT NULL DEFAULT '',
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_templates_body_length CHECK (char_length(body) <= 20000),
  CONSTRAINT page_templates_notes_length CHECK (char_length(dm_notes) <= 20000)
);
