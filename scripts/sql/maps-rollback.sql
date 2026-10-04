-- Undoes scripts/sql/maps.sql. Pins are deleted with their table; no entry is touched.
DROP TABLE IF EXISTS map_pins;
DROP TABLE IF EXISTS maps;
