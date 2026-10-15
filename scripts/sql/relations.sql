-- ---------------------------------------------------------------------------
-- Phase 17: relations between pages (family ties and ties in the wider world).
-- Idempotent; safe to run on every deploy.
-- Rollback: scripts/sql/relations-rollback.sql (drops the table; no entry or user is touched).
--
-- A symmetric type (spouse, sibling, ally, rival) is stored once with its ends in a fixed order
-- (from_id < to_id), so "A allied with B" and "B allied with A" can never both exist.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS relations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id     uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  to_id       uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  type        text NOT NULL,
  note        text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relations_not_self CHECK (from_id <> to_id),
  CONSTRAINT relations_type CHECK (type IN ('parent', 'spouse', 'sibling', 'ally', 'rival', 'vassal', 'member')),
  CONSTRAINT relations_note_length CHECK (char_length(note) <= 300),
  CONSTRAINT relations_symmetric_order CHECK (type NOT IN ('spouse', 'sibling', 'ally', 'rival') OR from_id < to_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS relations_unique_idx ON relations (from_id, to_id, type);
CREATE INDEX IF NOT EXISTS relations_from_idx ON relations (from_id);
CREATE INDEX IF NOT EXISTS relations_to_idx ON relations (to_id);
