-- Undoes scripts/sql/map-regions.sql: drops the regions and layers and the two pin columns. Maps, pins and
-- entries are not touched (a pin loses only its layer and its link to a city map).
ALTER TABLE map_pins DROP COLUMN IF EXISTS child_map_id;
ALTER TABLE map_pins DROP COLUMN IF EXISTS layer_id;
DROP TABLE IF EXISTS map_regions;
DROP TABLE IF EXISTS map_layers;
