-- Rollback for scripts/sql/grants.sql. Drops the per-player grants table only.
DROP TABLE IF EXISTS entry_grants;
