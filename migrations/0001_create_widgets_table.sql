-- Example D1 migration demonstrating the template's D1 + migrations setup.
-- The `widgets` table backs the generic "widget" example domain.
CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_widgets_created_at ON widgets(created_at DESC);
