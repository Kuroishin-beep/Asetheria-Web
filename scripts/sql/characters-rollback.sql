-- Undoes scripts/sql/characters.sql. Saved characters are deleted with their table;
-- entries, users, grants and maps are not touched.
-- The journal added later (scripts/sql/character-world.sql) hangs on the characters and is removed first,
-- so rolling back the characters also rolls that back; to keep the characters, use character-world-rollback.sql.
DROP TABLE IF EXISTS character_journal;
DROP TABLE IF EXISTS characters;
