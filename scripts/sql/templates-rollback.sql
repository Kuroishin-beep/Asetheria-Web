-- Undoes scripts/sql/templates.sql. Custom templates are deleted with the table and the built-in
-- defaults apply again; entries, users and grants are not touched.
DROP TABLE IF EXISTS page_templates;
