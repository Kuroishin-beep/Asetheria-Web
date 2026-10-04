-- ---------------------------------------------------------------------------
-- Phase 8b: interactive maps. Idempotent; safe to run on every deploy.
-- Rollback: scripts/sql/maps-rollback.sql (drops both tables; pins are lost,
-- entries are untouched).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS maps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  name        text NOT NULL,
  image_path  text NOT NULL,
  width       integer NOT NULL,
  height      integer NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS maps_slug_idx ON maps (slug);

CREATE TABLE IF NOT EXISTS map_pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  entry_id    uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  x           double precision NOT NULL,
  y           double precision NOT NULL,
  label       text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_pins_x_range CHECK (x >= 0 AND x <= 1),
  CONSTRAINT map_pins_y_range CHECK (y >= 0 AND y <= 1)
);
CREATE INDEX IF NOT EXISTS map_pins_map_idx ON map_pins (map_id);
CREATE INDEX IF NOT EXISTS map_pins_entry_idx ON map_pins (entry_id);
