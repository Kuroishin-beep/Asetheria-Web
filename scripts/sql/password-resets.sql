-- ---------------------------------------------------------------------------
-- Forgot password: a player asks, the DM sets a new password from the Party page.
-- One open request per player. Idempotent; safe to run on every deploy.
-- Rollback: scripts/sql/password-resets-rollback.sql (drops the table only).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_reset_requests (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  note          text NOT NULL DEFAULT '',
  requested_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_requests_note_length CHECK (char_length(note) <= 280)
);
