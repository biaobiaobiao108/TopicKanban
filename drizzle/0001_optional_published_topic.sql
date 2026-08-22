CREATE TABLE published_videos_next (
  id TEXT PRIMARY KEY,
  topic_id TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  bvid TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  favorites INTEGER NOT NULL DEFAULT 0 CHECK (favorites >= 0),
  comments INTEGER NOT NULL DEFAULT 0 CHECK (comments >= 0),
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

INSERT INTO published_videos_next (
  id, topic_id, title, url, bvid, published_at, views, likes, coins, favorites, comments, notes, updated_at
)
SELECT
  id, topic_id, title, url, bvid, published_at, views, likes, coins, favorites, comments, notes, updated_at
FROM published_videos;

DROP TABLE published_videos;
ALTER TABLE published_videos_next RENAME TO published_videos;
CREATE INDEX idx_published_topic_id ON published_videos(topic_id);
