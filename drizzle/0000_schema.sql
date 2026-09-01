PRAGMA foreign_keys = ON;

CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  storyline TEXT NOT NULL DEFAULT '',
  why_now TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'approved', 'scripting', 'production', 'published', 'icebox')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low', 'none')),
  target_publish_date TEXT,
  deadline TEXT,
  score_character INTEGER NOT NULL DEFAULT 0 CHECK (score_character BETWEEN 0 AND 2),
  score_conflict INTEGER NOT NULL DEFAULT 0 CHECK (score_conflict BETWEEN 0 AND 2),
  score_contrast INTEGER NOT NULL DEFAULT 0 CHECK (score_contrast BETWEEN 0 AND 2),
  score_material INTEGER NOT NULL DEFAULT 0 CHECK (score_material BETWEEN 0 AND 2),
  score_story INTEGER NOT NULL DEFAULT 0 CHECK (score_story BETWEEN 0 AND 2),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  deleted_at TEXT
);

CREATE INDEX idx_topics_target_publish_date ON topics(target_publish_date);
CREATE INDEX idx_topics_deadline ON topics(deadline);

CREATE TABLE topic_todos (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  current_started_at TEXT,
  completed_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (completed_at IS NULL OR is_current = 0),
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE INDEX idx_topic_todos_topic_order ON topic_todos(topic_id, sort_order, created_at);
CREATE UNIQUE INDEX idx_topic_todos_current
  ON topic_todos(topic_id)
  WHERE is_current = 1 AND completed_at IS NULL;

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'bilibili',
  author TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('confirmed', 'unverified', 'rejected')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE timeline_events (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  date_precision TEXT NOT NULL DEFAULT 'exact' CHECK (date_precision IN ('exact', 'year_month', 'year', 'unknown')),
  verification_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (verification_status IN ('confirmed', 'unverified', 'rejected')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  contrast_tag TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  identity TEXT NOT NULL DEFAULT '',
  platform_accounts TEXT NOT NULL DEFAULT '',
  quotes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE person_relationships (
  id TEXT PRIMARY KEY,
  person_a_id TEXT NOT NULL,
  person_b_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  CHECK (person_a_id != person_b_id),
  FOREIGN KEY (person_a_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (person_b_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE topic_people (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE timeline_event_people (
  id TEXT PRIMARY KEY,
  timeline_event_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  FOREIGN KEY (timeline_event_id) REFERENCES timeline_events(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE draft_citations (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('source', 'timeline', 'person', 'outline')),
  reference_id TEXT NOT NULL,
  reference_title TEXT NOT NULL,
  reference_snapshot TEXT NOT NULL DEFAULT '',
  quoted_text TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('confirmed', 'unverified', 'rejected')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT 'stone',
  created_at TEXT NOT NULL
);

CREATE TABLE topic_tags (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE published_videos (
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

CREATE INDEX idx_topics_status_sort ON topics(status, sort_order);
CREATE INDEX idx_topics_updated_at ON topics(updated_at);
CREATE INDEX idx_topics_deleted_at ON topics(deleted_at);
CREATE INDEX idx_sources_topic_id ON sources(topic_id);
CREATE INDEX idx_timeline_topic_sort ON timeline_events(topic_id, sort_order);
CREATE UNIQUE INDEX idx_timeline_people_unique ON timeline_event_people(timeline_event_id, person_id);
CREATE INDEX idx_timeline_people_person_id ON timeline_event_people(person_id);
CREATE UNIQUE INDEX idx_drafts_topic_id ON drafts(topic_id);
CREATE INDEX idx_draft_citations_topic_id ON draft_citations(topic_id);
CREATE INDEX idx_draft_citations_reference ON draft_citations(reference_type, reference_id);
CREATE UNIQUE INDEX idx_tags_name_unique ON tags(name COLLATE NOCASE);
CREATE UNIQUE INDEX idx_topic_tags_unique ON topic_tags(topic_id, tag_id);
CREATE INDEX idx_topic_tags_tag_id ON topic_tags(tag_id);
CREATE UNIQUE INDEX idx_topic_people_unique ON topic_people(topic_id, person_id);
CREATE INDEX idx_topic_people_person_id ON topic_people(person_id);
CREATE INDEX idx_relationships_people ON person_relationships(person_a_id, person_b_id);
CREATE INDEX idx_published_topic_id ON published_videos(topic_id);

CREATE TABLE publish_packages (
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

CREATE INDEX idx_publish_packages_updated_at ON publish_packages(updated_at);

CREATE TABLE commercial_deals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  brand_name TEXT NOT NULL DEFAULT '',
  agency_name TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_channel TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'other' CHECK (source IN ('huahuo', 'brand_direct', 'agency', 'mcn', 'other')),
  deliverable_type TEXT NOT NULL DEFAULT 'custom_video' CHECK (deliverable_type IN ('custom_video', 'dynamic', 'live', 'offline_activity', 'other')),
  status TEXT NOT NULL DEFAULT 'communicating' CHECK (status IN ('communicating', 'producing', 'delivered', 'archived')),
  contract_status TEXT NOT NULL DEFAULT 'not_started' CHECK (contract_status IN ('not_started', 'drafting', 'signed')),
  contract_summary TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '',
  restrictions TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  paid_at TEXT,
  delivery_due_date TEXT,
  publish_date TEXT,
  next_action TEXT NOT NULL DEFAULT '',
  next_action_due_date TEXT,
  published_video_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (published_video_id) REFERENCES published_videos(id) ON DELETE SET NULL
);

CREATE TABLE commercial_deal_topics (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  relation_role TEXT NOT NULL DEFAULT 'related' CHECK (relation_role IN ('primary', 'related')),
  created_at TEXT NOT NULL,
  UNIQUE (deal_id, topic_id),
  FOREIGN KEY (deal_id) REFERENCES commercial_deals(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE commercial_deal_activities (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'status_change', 'payment')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES commercial_deals(id) ON DELETE CASCADE
);

CREATE INDEX idx_commercial_deals_status ON commercial_deals(status, updated_at);
CREATE INDEX idx_commercial_deals_due_date ON commercial_deals(delivery_due_date);
CREATE INDEX idx_commercial_deals_payment ON commercial_deals(payment_status, updated_at);
CREATE INDEX idx_commercial_deals_published_video ON commercial_deals(published_video_id);
CREATE INDEX idx_commercial_deal_topics_topic ON commercial_deal_topics(topic_id);
CREATE INDEX idx_commercial_deal_topics_deal ON commercial_deal_topics(deal_id);
CREATE UNIQUE INDEX idx_commercial_deal_primary_topic
  ON commercial_deal_topics(deal_id)
  WHERE relation_role = 'primary';
CREATE INDEX idx_commercial_deal_activities_deal ON commercial_deal_activities(deal_id, created_at);
