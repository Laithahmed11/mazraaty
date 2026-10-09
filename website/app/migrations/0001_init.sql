-- D1 schema. Applied by the platform on deploy (only when app.manifest.json
-- sets "db": true). ONE database is shared by preview + prod — keep every
-- change additive (CREATE TABLE IF NOT EXISTS / ADD COLUMN); a destructive
-- change hits production data. Bound as env.DB (see src/lib/bindings.server.ts).
--
-- Example:
-- CREATE TABLE IF NOT EXISTS items (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   title TEXT NOT NULL,
--   created_at TEXT NOT NULL DEFAULT (datetime('now'))
-- );

-- Executable no-op: Wrangler/Bun reject a comments-only migration on a fresh DB.
-- No tables, application rows or existing production data are changed.
SELECT 1;
