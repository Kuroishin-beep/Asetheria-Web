-- ---------------------------------------------------------------------------
-- Phase 12: inline secret blocks. Idempotent; safe to run on every deploy.
-- Rollback: scripts/sql/secrets-rollback.sql (drops both tables; no entry, user
-- or grant is touched, but the secret text is gone with them).
--
-- A secret block's text lives here and never in `entries.body`, which keeps it
-- out of every search vector, embedding, link and snippet a player can reach.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entry_secrets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- DM-only search over secret text; players never query this table.
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED,
  CONSTRAINT entry_secrets_body_length CHECK (char_length(body) BETWEEN 1 AND 20000)
);
CREATE INDEX IF NOT EXISTS entry_secrets_entry_idx ON entry_secrets (entry_id);
CREATE INDEX IF NOT EXISTS entry_secrets_search_idx ON entry_secrets USING gin (search_vector);

CREATE TABLE IF NOT EXISTS secret_reveals (
  secret_id   uuid NOT NULL REFERENCES entry_secrets(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revealed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revealed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (secret_id, user_id)
);
CREATE INDEX IF NOT EXISTS secret_reveals_user_idx ON secret_reveals (user_id);
