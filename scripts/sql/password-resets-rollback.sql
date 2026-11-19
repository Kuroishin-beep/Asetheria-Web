-- Rollback for scripts/sql/password-resets.sql. Pending requests are lost; no account is touched.
DROP TABLE IF EXISTS password_reset_requests;
