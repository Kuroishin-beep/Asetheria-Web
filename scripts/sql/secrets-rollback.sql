-- Undoes scripts/sql/secrets.sql. Secret blocks and who they were revealed to are deleted
-- with their tables; the pages that held markers keep the marker lines (they render as
-- nothing), and entries, users and grants are not touched.
DROP TABLE IF EXISTS secret_reveals;
DROP TABLE IF EXISTS entry_secrets;
