CREATE TABLE IF NOT EXISTS publish_packages (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  title_simplified TEXT NOT NULL DEFAULT '',
  title_traditional TEXT NOT NULL DEFAULT '',
  description_simplified TEXT NOT NULL DEFAULT '',
  description_traditional TEXT NOT NULL DEFAULT '',
  title_traditional_auto INTEGER NOT NULL DEFAULT 1 CHECK (title_traditional_auto IN (0, 1)),
  description_traditional_auto INTEGER NOT NULL DEFAULT 1 CHECK (description_traditional_auto IN (0, 1)),
  content_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_publish_packages_updated_at ON publish_packages(updated_at);
