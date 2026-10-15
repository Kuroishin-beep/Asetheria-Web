-- ---------------------------------------------------------------------------
-- Phase 18: map regions, layers and city maps. Idempotent; safe to run on every deploy.
-- Rollback: scripts/sql/map-regions-rollback.sql (drops the regions and layers and the two new pin
-- columns; maps, pins and entries are not touched).
--
-- A region is a polygon whose corners are fractions of the image, like a pin. A region linked to a page is
-- seen by whoever may read that page; a region with no page is the DM's alone. A pin may open another map
-- (a city's own map).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS map_layers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name        text NOT NULL,
  default_on  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_layers_name_length CHECK (char_length(name) BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX IF NOT EXISTS map_layers_name_idx ON map_layers (map_id, lower(name));
CREATE INDEX IF NOT EXISTS map_layers_map_idx ON map_layers (map_id);

CREATE TABLE IF NOT EXISTS map_regions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  layer_id    uuid REFERENCES map_layers(id) ON DELETE SET NULL,
  entry_id    uuid REFERENCES entries(id) ON DELETE CASCADE,
  name        text NOT NULL,
  points      jsonb NOT NULL,
  tone        text NOT NULL DEFAULT '1',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_regions_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT map_regions_points_array CHECK (jsonb_typeof(points) = 'array' AND jsonb_array_length(points) BETWEEN 3 AND 200),
  CONSTRAINT map_regions_tone CHECK (tone IN ('1', '2', '3', '4', '5'))
);
CREATE INDEX IF NOT EXISTS map_regions_map_idx ON map_regions (map_id);
CREATE INDEX IF NOT EXISTS map_regions_entry_idx ON map_regions (entry_id);
CREATE INDEX IF NOT EXISTS map_regions_layer_idx ON map_regions (layer_id);

ALTER TABLE map_pins ADD COLUMN IF NOT EXISTS layer_id uuid REFERENCES map_layers(id) ON DELETE SET NULL;
ALTER TABLE map_pins ADD COLUMN IF NOT EXISTS child_map_id uuid REFERENCES maps(id) ON DELETE SET NULL CONSTRAINT map_pins_not_own_child CHECK (child_map_id IS NULL OR child_map_id <> map_id);
