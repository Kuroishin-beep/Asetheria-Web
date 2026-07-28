-- ---------------------------------------------------------------------------
-- Post-push database setup: extensions, full-text search, and fuzzy matching.
-- Idempotent — safe to run on every deploy.
-- ---------------------------------------------------------------------------

-- Trigram matching powers the "did you mean" behaviour in the command palette.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Postgres marks array_to_string() STABLE rather than IMMUTABLE, because for
-- most element types it depends on that type's output function. A generated
-- column requires an immutable expression, so wrap it: this is only ever
-- called with text[] and a constant separator, where the result genuinely is
-- immutable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION asetheria_tags_text(text[])
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  RETURNS NULL ON NULL INPUT
AS $fn$
  SELECT coalesce(array_to_string($1, ' '), '')
$fn$;

-- ---------------------------------------------------------------------------
-- Most entries carry their meaning in properties rather than prose: a deity
-- row is Alignment + Domains + Race and nothing else. Flattening the jsonb to
-- its values makes those searchable, so "satyr" or "revelry" finds Bacchus.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION asetheria_fields_text(jsonb)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
AS $fn$
  SELECT coalesce(string_agg(value, ' ' ORDER BY key), '')
  FROM jsonb_each_text(coalesce($1, '{}'::jsonb))
$fn$;

-- ---------------------------------------------------------------------------
-- Full-text search vector.
-- Weighting: name (A) > summary + tags + properties (B) > body (C) >
-- DM notes (D), so an entry titled "Leto" outranks one that merely mentions
-- Leto in passing.
-- ---------------------------------------------------------------------------
ALTER TABLE entries DROP COLUMN IF EXISTS search_vector;

ALTER TABLE entries
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(asetheria_tags_text(tags), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(asetheria_fields_text(fields), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(dm_notes, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS entries_search_idx ON entries USING gin (search_vector);

CREATE INDEX IF NOT EXISTS entries_name_trgm_idx ON entries USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS entries_summary_trgm_idx ON entries USING gin (summary gin_trgm_ops);

-- Keep `updated_at` honest even for writes that bypass the application.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entries_touch_updated_at ON entries;

CREATE TRIGGER entries_touch_updated_at
  BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS roll_tables_touch_updated_at ON roll_tables;

CREATE TRIGGER roll_tables_touch_updated_at
  BEFORE UPDATE ON roll_tables
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
