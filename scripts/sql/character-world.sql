-- ---------------------------------------------------------------------------
-- Phase 19: characters linked to the world.
-- Idempotent; safe to run on every deploy. Additive only: nothing existing is changed or dropped.
-- Rollback: scripts/sql/character-world-rollback.sql (drops the journal and the two new columns;
-- no character, entry or user is touched).
--
--   characters.shared         the owner has shared this character with the party roster
--   characters.home_entry_id  the place (a location page) the character calls home; cleared if the page is deleted
--   character_journal         a character's private journal: its player writes, its player and the DM read
-- ---------------------------------------------------------------------------

ALTER TABLE characters ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT false;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS home_entry_id uuid REFERENCES entries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS characters_shared_idx ON characters (updated_at DESC) WHERE shared AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS character_journal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id  uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title         text NOT NULL DEFAULT '',
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT character_journal_title_length CHECK (char_length(title) <= 120),
  CONSTRAINT character_journal_body_length CHECK (char_length(body) BETWEEN 1 AND 4000)
);
CREATE INDEX IF NOT EXISTS character_journal_character_idx ON character_journal (character_id, created_at DESC);
