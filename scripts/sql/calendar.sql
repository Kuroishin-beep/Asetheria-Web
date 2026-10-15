-- ---------------------------------------------------------------------------
-- Phase 15: the Asetheria calendar. Idempotent; safe to run on every deploy.
-- Rollback: scripts/sql/calendar-rollback.sql (drops the table; no entry or user is touched).
--
-- One row, because the world has one calendar. No month or weekday names are built in:
-- the DM defines them, and until then the table is empty and the page says so.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS calendar_config (
  id            smallint PRIMARY KEY DEFAULT 1,
  months        jsonb NOT NULL,
  weekdays      jsonb NOT NULL,
  year_label    text NOT NULL DEFAULT '',
  first_weekday integer NOT NULL DEFAULT 0,
  current_year  integer NOT NULL,
  current_month integer NOT NULL,
  current_day   integer NOT NULL,
  updated_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_config_single_row CHECK (id = 1),
  CONSTRAINT calendar_config_months_array CHECK (jsonb_typeof(months) = 'array' AND jsonb_array_length(months) BETWEEN 1 AND 60),
  CONSTRAINT calendar_config_weekdays_array CHECK (jsonb_typeof(weekdays) = 'array' AND jsonb_array_length(weekdays) BETWEEN 1 AND 30),
  CONSTRAINT calendar_config_label_length CHECK (char_length(year_label) <= 20),
  CONSTRAINT calendar_config_year_range CHECK (current_year BETWEEN -100000 AND 100000)
);
