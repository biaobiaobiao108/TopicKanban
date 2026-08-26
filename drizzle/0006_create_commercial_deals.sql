CREATE TABLE IF NOT EXISTS commercial_deals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  brand_name TEXT NOT NULL DEFAULT '',
  agency_name TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_channel TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'other' CHECK (source IN ('huahuo', 'brand_direct', 'agency', 'mcn', 'other')),
  deliverable_type TEXT NOT NULL DEFAULT 'custom_video' CHECK (deliverable_type IN ('custom_video', 'dynamic', 'live', 'offline_activity', 'other')),
  status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'communicating', 'quoted', 'confirmed', 'producing', 'reviewing', 'scheduled', 'delivered', 'paused', 'closed_lost')),
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

CREATE TABLE IF NOT EXISTS commercial_deal_topics (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  relation_role TEXT NOT NULL DEFAULT 'related' CHECK (relation_role IN ('primary', 'related')),
  created_at TEXT NOT NULL,
  UNIQUE (deal_id, topic_id),
  FOREIGN KEY (deal_id) REFERENCES commercial_deals(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS commercial_deal_activities (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'status_change', 'payment')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deal_id) REFERENCES commercial_deals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commercial_deals_status ON commercial_deals(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_commercial_deals_due_date ON commercial_deals(delivery_due_date);
CREATE INDEX IF NOT EXISTS idx_commercial_deals_payment ON commercial_deals(payment_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_commercial_deals_published_video ON commercial_deals(published_video_id);
CREATE INDEX IF NOT EXISTS idx_commercial_deal_topics_topic ON commercial_deal_topics(topic_id);
CREATE INDEX IF NOT EXISTS idx_commercial_deal_topics_deal ON commercial_deal_topics(deal_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_deal_primary_topic
  ON commercial_deal_topics(deal_id)
  WHERE relation_role = 'primary';
CREATE INDEX IF NOT EXISTS idx_commercial_deal_activities_deal ON commercial_deal_activities(deal_id, created_at);
