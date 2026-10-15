-- Undoes scripts/sql/maps.sql. Pins are deleted with their table; no entry is touched.
-- The regions and layers added later (scripts/sql/map-regions.sql) depend on the maps and are removed
-- first, so rolling back the maps also rolls those back; to keep the pins and maps, use map-regions-rollback.sql.
DROP TABLE IF EXISTS map_regions;
DROP TABLE IF EXISTS map_pins;
DROP TABLE IF EXISTS map_layers;
DROP TABLE IF EXISTS maps;
