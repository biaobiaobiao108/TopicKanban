import { createId } from '../apiShared';
import type {
  CommercialDeal,
  CommercialDealActivity,
  CommercialDealDetail,
  CommercialDealTopic,
  DealFocusData,
  PaginatedCommercialDeals,
  PublishedVideo,
} from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';

export interface CommercialDealPageOptions {
  page: number;
  pageSize: number;
  query?: string;
  status?: string;
  paymentStatus?: string;
  scope?: 'active' | 'closed' | 'all';
}

function normalizeCommercialDeal(row: Record<string, unknown>): CommercialDeal {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    brand_name: String(row.brand_name || ''),
    agency_name: String(row.agency_name || ''),
    contact_name: String(row.contact_name || ''),
    contact_channel: String(row.contact_channel || ''),
    source: String(row.source || 'other') as CommercialDeal['source'],
    deliverable_type: String(row.deliverable_type || 'custom_video') as CommercialDeal['deliverable_type'],
    status: String(row.status || 'communicating') as CommercialDeal['status'],
    contract_status: String(row.contract_status || 'not_started') as CommercialDeal['contract_status'],
    contract_summary: String(row.contract_summary || ''),
    brief: String(row.brief || ''),
    requirements: String(row.requirements || ''),
    restrictions: String(row.restrictions || ''),
    amount_cents: Number(row.amount_cents || 0),
    payment_status: String(row.payment_status || 'unpaid') as CommercialDeal['payment_status'],
    paid_at: (row.paid_at as string | null | undefined) ?? null,
    delivery_due_date: (row.delivery_due_date as string | null | undefined) ?? null,
    publish_date: (row.publish_date as string | null | undefined) ?? null,
    next_action: String(row.next_action || ''),
    next_action_due_date: (row.next_action_due_date as string | null | undefined) ?? null,
    published_video_id: (row.published_video_id as string | null | undefined) ?? null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    primary_topic_id: (row.primary_topic_id as string | null | undefined) ?? null,
    primary_topic_title: (row.primary_topic_title as string | null | undefined) ?? null,
    linked_topic_count: Number(row.linked_topic_count || 0),
    published_video_title: (row.published_video_title as string | null | undefined) ?? null,
    relation_role: row.relation_role as CommercialDeal['relation_role'],
  };
}

function commercialDealProjection(): string {
  return `d.*,
    (SELECT cdt.topic_id FROM commercial_deal_topics cdt
      WHERE cdt.deal_id = d.id AND cdt.relation_role = 'primary' LIMIT 1) AS primary_topic_id,
    (SELECT t.title FROM commercial_deal_topics cdt
      INNER JOIN topics t ON t.id = cdt.topic_id
      WHERE cdt.deal_id = d.id AND cdt.relation_role = 'primary' LIMIT 1) AS primary_topic_title,
    (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.deal_id = d.id) AS linked_topic_count,
    (SELECT v.title FROM published_videos v WHERE v.id = d.published_video_id LIMIT 1) AS published_video_title`;
}

function buildCommercialDealFilter(options: CommercialDealPageOptions): { conditions: string[]; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.scope === 'active') conditions.push("d.status IN ('communicating', 'producing')");
  if (options.scope === 'closed') conditions.push("d.status IN ('delivered', 'archived')");
  if (options.status) {
    const statuses = options.status.split(',').map((value) => value.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push('d.status = ?');
      values.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`d.status IN (${statuses.map(() => '?').join(',')})`);
      values.push(...statuses);
    }
  }
  if (options.paymentStatus) {
    conditions.push('d.payment_status = ?');
    values.push(options.paymentStatus);
  }
  if (options.query?.trim()) {
    const pattern = `%${options.query.trim().replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(`(
      d.title LIKE ? ESCAPE '\\' OR d.brand_name LIKE ? ESCAPE '\\'
      OR d.agency_name LIKE ? ESCAPE '\\' OR d.contact_name LIKE ? ESCAPE '\\'
      OR d.brief LIKE ? ESCAPE '\\' OR d.next_action LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM commercial_deal_topics sqdt
        INNER JOIN topics sqt ON sqt.id = sqdt.topic_id
        WHERE sqdt.deal_id = d.id AND sqt.title LIKE ? ESCAPE '\\')
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  return { conditions, values };
}

export async function loadCommercialDealPage(db: SqliteDatabase, options: CommercialDealPageOptions): Promise<PaginatedCommercialDeals> {
  const filter = buildCommercialDealFilter(options);
  const where = filter.conditions.length ? `WHERE ${filter.conditions.join(' AND ')}` : '';
  const offset = (options.page - 1) * options.pageSize;
  const [countResult, rowsResult] = await db.batch([
    bind(db, `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN d.status IN ('communicating', 'producing') THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN d.status IN ('communicating', 'producing')
        AND d.delivery_due_date IS NOT NULL
        AND d.delivery_due_date <= date('now', '+8 hours', '+7 days') THEN 1 ELSE 0 END) AS due_soon_count,
      SUM(CASE WHEN d.status IN ('communicating', 'producing') AND TRIM(d.next_action) = '' THEN 1 ELSE 0 END) AS needs_action_count,
      SUM(CASE WHEN d.payment_status = 'unpaid' AND d.status != 'archived' THEN d.amount_cents ELSE 0 END) AS unpaid_amount_cents,
      SUM(CASE WHEN d.payment_status = 'unpaid' AND d.status != 'archived' THEN 1 ELSE 0 END) AS unpaid_count
      FROM commercial_deals d ${where}`, filter.values),
    bind(db, `SELECT ${commercialDealProjection()}
      FROM commercial_deals d ${where}
      ORDER BY CASE WHEN d.delivery_due_date IS NULL THEN 1 ELSE 0 END,
        d.delivery_due_date ASC, d.updated_at DESC, d.id DESC
      LIMIT ? OFFSET ?`, [...filter.values, options.pageSize, offset]),
  ]);
  const summaryRow = (countResult.results[0] || {}) as Record<string, unknown>;
  const total = Number(summaryRow.total || 0);
  return {
    items: (rowsResult.results as unknown as Array<Record<string, unknown>>).map(normalizeCommercialDeal),
    page: options.page,
    page_size: options.pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / options.pageSize)),
    summary: {
      active_count: Number(summaryRow.active_count || 0),
      due_soon_count: Number(summaryRow.due_soon_count || 0),
      needs_action_count: Number(summaryRow.needs_action_count || 0),
      unpaid_amount_cents: Number(summaryRow.unpaid_amount_cents || 0),
      unpaid_count: Number(summaryRow.unpaid_count || 0),
    },
  };
}

export async function loadCommercialDeal(db: SqliteDatabase, id: string): Promise<CommercialDealDetail | null> {
  const [dealRow, topicsResult, activitiesResult] = await db.batch([
    bind(db, `SELECT ${commercialDealProjection()} FROM commercial_deals d WHERE d.id = ? LIMIT 1`, [id]),
    bind(db, `SELECT cdt.*, t.title AS topic_title, t.status AS topic_status, t.deleted_at AS topic_deleted_at
      FROM commercial_deal_topics cdt
      INNER JOIN topics t ON t.id = cdt.topic_id
      WHERE cdt.deal_id = ?
      ORDER BY CASE WHEN cdt.relation_role = 'primary' THEN 0 ELSE 1 END, cdt.created_at ASC`, [id]),
    bind(db, 'SELECT * FROM commercial_deal_activities WHERE deal_id = ? ORDER BY created_at DESC', [id]),
  ]);
  const row = (dealRow.results[0] || null) as Record<string, unknown> | null;
  if (!row) return null;
  const deal = normalizeCommercialDeal(row);
  const publishedVideo = deal.published_video_id
    ? await db.prepare('SELECT * FROM published_videos WHERE id = ?').bind(deal.published_video_id).first<PublishedVideo>()
    : null;
  return {
    ...deal,
    topics: topicsResult.results as unknown as CommercialDealTopic[],
    activities: activitiesResult.results as unknown as CommercialDealActivity[],
    published_video: publishedVideo || null,
  };
}

export async function deleteCommercialDeal(db: SqliteDatabase, id: string): Promise<boolean> {
  const existing = await db.prepare('SELECT id FROM commercial_deals WHERE id = ?').bind(id).first<{ id: string }>();
  if (!existing) return false;
  await db.batch([
    db.prepare('DELETE FROM commercial_deal_activities WHERE deal_id = ?').bind(id),
    db.prepare('DELETE FROM commercial_deal_topics WHERE deal_id = ?').bind(id),
    db.prepare('DELETE FROM commercial_deals WHERE id = ?').bind(id),
  ]);
  return true;
}

export async function loadCommercialDealsByTopicId(db: SqliteDatabase, topicId: string): Promise<CommercialDeal[]> {
  const result = await db.prepare(`SELECT ${commercialDealProjection()}, cdt.relation_role AS relation_role
    FROM commercial_deals d
    INNER JOIN commercial_deal_topics cdt ON cdt.deal_id = d.id
    WHERE cdt.topic_id = ?
    ORDER BY CASE WHEN cdt.relation_role = 'primary' THEN 0 ELSE 1 END, d.updated_at DESC`).bind(topicId).all<Record<string, unknown>>();
  return result.results.map(normalizeCommercialDeal);
}

export async function loadCommercialDealFocus(db: SqliteDatabase): Promise<DealFocusData> {
  const [dueResult, unpaidResult, countResult] = await db.batch([
    db.prepare(`SELECT ${commercialDealProjection()} FROM commercial_deals d
      WHERE d.status IN ('communicating', 'producing')
        AND (d.delivery_due_date <= date('now', '+8 hours')
          OR d.next_action = '')
      ORDER BY CASE WHEN d.delivery_due_date IS NULL THEN 1 ELSE 0 END,
        d.delivery_due_date ASC, d.updated_at DESC LIMIT 8`),
    db.prepare(`SELECT ${commercialDealProjection()} FROM commercial_deals d
      WHERE d.status = 'delivered' AND d.payment_status = 'unpaid'
      ORDER BY d.updated_at DESC LIMIT 8`),
    db.prepare("SELECT COUNT(*) AS count FROM commercial_deals WHERE status IN ('communicating', 'producing')"),
  ]);
  return {
    due_items: (dueResult.results as unknown as Array<Record<string, unknown>>).map(normalizeCommercialDeal),
    unpaid_items: (unpaidResult.results as unknown as Array<Record<string, unknown>>).map(normalizeCommercialDeal),
    total_active: Number((countResult.results[0] as { count?: number } | undefined)?.count || 0),
  };
}

export function commercialDealStatement(db: SqliteDatabase, deal: CommercialDeal): SqlitePreparedStatement {
  return bind(db, `INSERT INTO commercial_deals (
    id, title, brand_name, agency_name, contact_name, contact_channel, source,
    deliverable_type, status, contract_status, contract_summary, brief, requirements,
    restrictions, amount_cents, payment_status, paid_at, delivery_due_date, publish_date,
    next_action, next_action_due_date, published_video_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title, brand_name=excluded.brand_name, agency_name=excluded.agency_name,
    contact_name=excluded.contact_name, contact_channel=excluded.contact_channel, source=excluded.source,
    deliverable_type=excluded.deliverable_type, status=excluded.status, contract_status=excluded.contract_status,
    contract_summary=excluded.contract_summary, brief=excluded.brief, requirements=excluded.requirements,
    restrictions=excluded.restrictions, amount_cents=excluded.amount_cents, payment_status=excluded.payment_status,
    paid_at=excluded.paid_at, delivery_due_date=excluded.delivery_due_date, publish_date=excluded.publish_date,
    next_action=excluded.next_action, next_action_due_date=excluded.next_action_due_date,
    published_video_id=excluded.published_video_id, updated_at=excluded.updated_at`, [
    deal.id, deal.title, deal.brand_name, deal.agency_name, deal.contact_name, deal.contact_channel,
    deal.source, deal.deliverable_type, deal.status, deal.contract_status, deal.contract_summary,
    deal.brief, deal.requirements, deal.restrictions, deal.amount_cents, deal.payment_status,
    deal.paid_at ?? null, deal.delivery_due_date ?? null, deal.publish_date ?? null, deal.next_action,
    deal.next_action_due_date ?? null, deal.published_video_id ?? null, deal.created_at, deal.updated_at,
  ]);
}

export function commercialDealTopicStatement(db: SqliteDatabase, relation: CommercialDealTopic): SqlitePreparedStatement {
  return bind(db, `INSERT INTO commercial_deal_topics (id, deal_id, topic_id, relation_role, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      deal_id=excluded.deal_id, topic_id=excluded.topic_id, relation_role=excluded.relation_role`, [
    relation.id, relation.deal_id, relation.topic_id, relation.relation_role, relation.created_at,
  ]);
}

export function commercialDealActivityStatement(db: SqliteDatabase, activity: CommercialDealActivity): SqlitePreparedStatement {
  return bind(db, `INSERT INTO commercial_deal_activities (id, deal_id, kind, content, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      deal_id=excluded.deal_id, kind=excluded.kind, content=excluded.content, created_at=excluded.created_at`, [
    activity.id, activity.deal_id, activity.kind, activity.content, activity.created_at,
  ]);
}
export async function insertCommercialDeal(db: SqliteDatabase, deal: CommercialDeal): Promise<void> {
  await commercialDealStatement(db, deal).run();
}

export async function findCommercialDeal(db: SqliteDatabase, id: string): Promise<CommercialDeal | null> {
  return db.prepare('SELECT * FROM commercial_deals WHERE id = ?').bind(id).first<CommercialDeal>();
}

export async function publishedVideoExists(db: SqliteDatabase, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM published_videos WHERE id = ?').bind(id).first<{ id: string }>();
  return Boolean(row);
}

const COMMERCIAL_DEAL_UPDATE_FIELDS = [
  'title', 'brand_name', 'agency_name', 'contact_name', 'contact_channel', 'source',
  'deliverable_type', 'status', 'contract_status', 'contract_summary', 'brief',
  'requirements', 'restrictions', 'amount_cents', 'payment_status', 'paid_at',
  'delivery_due_date', 'publish_date', 'next_action', 'next_action_due_date', 'published_video_id',
] as const;

export async function updateCommercialDeal(
  db: SqliteDatabase,
  id: string,
  body: Record<string, unknown>
): Promise<CommercialDeal | null> {
  const existing = await findCommercialDeal(db, id);
  if (!existing) return null;
  const fields = COMMERCIAL_DEAL_UPDATE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  const now = new Date().toISOString();
  const batch: SqlitePreparedStatement[] = [];
  if (fields.length > 0) {
    batch.push(bind(db,
      `UPDATE commercial_deals SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...fields.map((field) => body[field]), now, id]
    ));
  }
  if (body.status !== undefined && body.status !== existing.status) {
    batch.push(commercialDealActivityStatement(db, {
      id: createId('deal-activity'), deal_id: id, kind: 'status_change',
      content: `阶段变更：${existing.status} → ${String(body.status)}`, created_at: now,
    }));
  }
  if (body.payment_status !== undefined && body.payment_status !== existing.payment_status) {
    batch.push(commercialDealActivityStatement(db, {
      id: createId('deal-activity'), deal_id: id, kind: 'payment',
      content: `回款状态：${existing.payment_status} → ${String(body.payment_status)}`, created_at: now,
    }));
  }
  if (batch.length > 0) await db.batch(batch);
  return loadCommercialDeal(db, id);
}

export async function replaceCommercialDealTopics(
  db: SqliteDatabase,
  dealId: string,
  primaryTopicId: string | null,
  relatedTopicIds: string[]
): Promise<'deal_not_found' | 'topic_not_found' | CommercialDealDetail | null> {
  const deal = await findCommercialDeal(db, dealId);
  if (!deal) return 'deal_not_found';
  const topicIds = Array.from(new Set([
    ...(primaryTopicId ? [primaryTopicId] : []),
    ...relatedTopicIds,
  ]));
  if (topicIds.length > 0) {
    const placeholders = topicIds.map(() => '?').join(',');
    const result = await db.prepare(`SELECT id FROM topics WHERE deleted_at IS NULL AND id IN (${placeholders})`)
      .bind(...topicIds).all<{ id: string }>();
    if (result.results.length !== topicIds.length) return 'topic_not_found';
  }
  const now = new Date().toISOString();
  const statementsToRun: SqlitePreparedStatement[] = [bind(
    db,
    'DELETE FROM commercial_deal_topics WHERE deal_id = ?',
    [dealId]
  )];
  topicIds.forEach((topicId) => statementsToRun.push(commercialDealTopicStatement(db, {
    id: `${dealId}:${topicId}`,
    deal_id: dealId,
    topic_id: topicId,
    relation_role: topicId === primaryTopicId ? 'primary' : 'related',
    created_at: now,
  })));
  await db.batch(statementsToRun);
  return loadCommercialDeal(db, dealId);
}

export async function insertCommercialDealActivity(
  db: SqliteDatabase,
  activity: CommercialDealActivity
): Promise<void> {
  await db.batch([
    commercialDealActivityStatement(db, activity),
    bind(db, 'UPDATE commercial_deals SET updated_at = ? WHERE id = ?', [activity.created_at, activity.deal_id]),
  ]);
}

export async function linkPublishedVideoToDeal(
  db: SqliteDatabase,
  id: string,
  publishedVideoId: string | null
): Promise<'deal_not_found' | 'video_not_found' | CommercialDealDetail | null> {
  const deal = await findCommercialDeal(db, id);
  if (!deal) return 'deal_not_found';
  if (publishedVideoId && !(await publishedVideoExists(db, publishedVideoId))) return 'video_not_found';
  await bind(db, 'UPDATE commercial_deals SET published_video_id = ?, updated_at = ? WHERE id = ?',
    [publishedVideoId, new Date().toISOString(), id]).run();
  return loadCommercialDeal(db, id);
}
