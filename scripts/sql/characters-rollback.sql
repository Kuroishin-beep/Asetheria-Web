-- Undoes scripts/sql/characters.sql. Saved characters are deleted with their table;
-- entries, users, grants and maps are not touched.
DROP TABLE IF EXISTS characters;
