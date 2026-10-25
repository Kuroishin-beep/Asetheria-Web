-- ---------------------------------------------------------------------------
-- Phase 0: per-player grants (src/lib/rbac.ts). Idempotent; safe to re-run.
--
-- Locally this table came from `drizzle-kit push`, which was never run against
-- Neon, so production had no entry_grants and every player-scoped query failed
-- with 42P01 ("relation does not exist"). This creates it exactly as
-- src/db/schema.ts declares it.
--
-- Rollback: scripts/sql/grants-rollback.sql (drops the table; no entry or
-- user is touched).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entry_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        entry_kind,
  entry_id    uuid REFERENCES entries(id) ON DELETE CASCADE,
  granted     boolean NOT NULL DEFAULT true,
  granted_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_grants_kind_xor_entry CHECK ((kind IS NULL) <> (entry_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS entry_grants_user_kind_idx ON entry_grants (user_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS entry_grants_user_entry_idx ON entry_grants (user_id, entry_id);
CREATE INDEX IF NOT EXISTS entry_grants_user_idx ON entry_grants (user_id);
