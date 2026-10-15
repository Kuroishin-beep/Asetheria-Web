-- ---------------------------------------------------------------------------
-- Phase 16: events for the timeline are pages of a new kind. Idempotent.
-- Postgres cannot remove a value from an enum, so there is no data rollback:
-- see scripts/sql/events-rollback.sql.
-- ---------------------------------------------------------------------------

ALTER TYPE entry_kind ADD VALUE IF NOT EXISTS 'event';
