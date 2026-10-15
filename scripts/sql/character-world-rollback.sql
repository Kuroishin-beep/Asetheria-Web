-- Undoes scripts/sql/character-world.sql. The journal is deleted with its table; characters, entries and users are not touched.
DROP TABLE IF EXISTS character_journal;
DROP INDEX IF EXISTS characters_shared_idx;
ALTER TABLE characters DROP COLUMN IF EXISTS home_entry_id;
ALTER TABLE characters DROP COLUMN IF EXISTS shared;
