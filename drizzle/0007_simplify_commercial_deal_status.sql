PRAGMA defer_foreign_keys = ON;

CREATE TABLE commercial_deals_status_new (
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

INSERT INTO commercial_deals_status_new (
  id, title, brand_name, agency_name, contact_name, contact_channel, source,
  deliverable_type, status, contract_status, contract_summary, brief, requirements,
  restrictions, amount_cents, payment_status, paid_at, delivery_due_date, publish_date,
  next_action, next_action_due_date, published_video_id, created_at, updated_at
)
SELECT
  id, title, brand_name, agency_name, contact_name, contact_channel, source,
  deliverable_type,
  CASE
    WHEN status IN ('producing', 'reviewing', 'scheduled') THEN 'producing'
    WHEN status = 'delivered' THEN 'delivered'
    WHEN status IN ('paused', 'closed_lost') THEN 'archived'
    ELSE 'communicating'
  END,
  contract_status, contract_summary, brief, requirements,
  restrictions, amount_cents, payment_status, paid_at, delivery_due_date, publish_date,
  next_action, next_action_due_date, published_video_id, created_at, updated_at
FROM commercial_deals;

DROP TABLE commercial_deals;
ALTER TABLE commercial_deals_status_new RENAME TO commercial_deals;

CREATE INDEX IF NOT EXISTS idx_commercial_deals_status ON commercial_deals(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_commercial_deals_due_date ON commercial_deals(delivery_due_date);
CREATE INDEX IF NOT EXISTS idx_commercial_deals_payment ON commercial_deals(payment_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_commercial_deals_published_video ON commercial_deals(published_video_id);
