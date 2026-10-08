-- ---------------------------------------------------------------------------
-- Phase 10: saved characters. Idempotent; safe to run on every deploy.
-- Rollback: scripts/sql/characters-rollback.sql (drops the table; no entry,
-- user or map is touched).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS characters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  -- The submitted character (what the player chose, including the dice rolled).
  input       jsonb NOT NULL,
  -- What the server computed from it with the house rules; never taken from the client.
  sheet       jsonb NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT characters_name_length CHECK (char_length(name) BETWEEN 1 AND 80)
);
CREATE INDEX IF NOT EXISTS characters_user_idx ON characters (user_id, archived_at);
