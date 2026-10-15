-- Undoes scripts/sql/calendar.sql. The calendar setup and the current date are deleted with the
-- table; entries and users are not touched.
DROP TABLE IF EXISTS calendar_config;
