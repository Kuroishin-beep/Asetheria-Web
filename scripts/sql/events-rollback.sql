-- Postgres cannot drop a value from an enum, so the 'event' kind stays, unused, exactly as it does for
-- 'fauna' and 'table'. To take the feature out, archive the pages of kind event from the app
-- (nothing is deleted) and revert the code; there is nothing to undo in the schema.
SELECT 1;
