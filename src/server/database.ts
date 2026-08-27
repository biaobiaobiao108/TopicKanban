import type {
  AppSettings,
  BackupData,
  BootstrapData,
  Draft,
  DraftCitation,
  CommercialDeal,
  CommercialDealActivity,
  CommercialDealDetail,
  CommercialDealTopic,
  DealFocusData,
  Person,
  PersonRelationship,
  PublishedVideo,
  PublishPackageRecord,
  Source,
  Tag,
  TimelineEvent,
  Topic,
  PaginatedTopics,
  PaginatedPeople,
  PaginatedPublishedVideos,
  PaginatedTags,
  PaginatedCommercialDeals,
} from '../types';
import { DEFAULT_APP_SETTINGS, isTopicStatus } from '../types';
import {
  analyzePeoplePerformance,
  analyzeTagPerformance,
  analyzeTopicModelCorrelation,
  calculateChannelOverview,
  calculateDeepMetrics,
  generateAnalyticsInsights,
  type PublishedAnalyticsPayload,
} from '../lib/videoAnalytics';

export const MAX_IMPORT_STATEMENTS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface BackupImportSummary {
  bytes: number;
  statements: number;
  topics: number;
  sources: number;
  timeline: number;
  people: number;
  drafts: number;
  citations: number;
  tags: number;
  published: number;
  publish_packages: number;
  commercial_deals: number;
  commercial_deal_topics: number;
  commercial_deal_activities: number;
}

export class BackupImportLimitError extends Error {}

export function getBackupImportSummary(data: BackupData): BackupImportSummary {
  const topicRelations = data.topics.reduce(
    (count, topic) => count + (topic.tags?.length || 0) + (topic.people?.length || 0),
    0
  );
  const statements = 16 + data.tags.length + data.people.length + data.topics.length + topicRelations
    + data.sources.length + data.timeline.length
    + data.timeline.reduce((count, event) => count + (event.person_ids?.length || 0), 0)
    + data.drafts.length + data.citations.length
    + data.relationships.length + data.published.length + (data.publish_packages?.length || 0)
    + (data.commercial_deals?.length || 0) + (data.commercial_deal_topics?.length || 0)
    + (data.commercial_deal_activities?.length || 0);

  return {
    bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength,
    statements,
    topics: data.topics.length,
    sources: data.sources.length,
    timeline: data.timeline.length,
    people: data.people.length,
    drafts: data.drafts.length,
    citations: data.citations.length,
    tags: data.tags.length,
    published: data.published.length,
    publish_packages: data.publish_packages?.length || 0,
    commercial_deals: data.commercial_deals?.length || 0,
    commercial_deal_topics: data.commercial_deal_topics?.length || 0,
    commercial_deal_activities: data.commercial_deal_activities?.length || 0,
  };
}

export function assertBackupImportWithinLimits(data: BackupData): BackupImportSummary {
  const summary = getBackupImportSummary(data);
  if (summary.bytes > MAX_IMPORT_BYTES) {
    throw new BackupImportLimitError(`备份文件超过 ${(MAX_IMPORT_BYTES / 1024 / 1024).toFixed(0)} MB 限制`);
  }
  if (summary.statements > MAX_IMPORT_STATEMENTS) {
    throw new BackupImportLimitError(`备份包含 ${summary.statements} 条写入，超过单次原子恢复上限 ${MAX_IMPORT_STATEMENTS} 条`);
  }
  return summary;
}

function bind(db: D1Database, sql: string, values: unknown[] = []): D1PreparedStatement {
  return db.prepare(sql).bind(...values);
}

export async function loadTopics(db: D1Database, scope: 'active' | 'trash' | 'all' = 'active'): Promise<Topic[]> {
  const topicFilter = scope === 'active'
    ? 'WHERE t.deleted_at IS NULL'
    : scope === 'trash'
      ? 'WHERE t.deleted_at IS NOT NULL'
      : '';
  const results = await db.batch([
    db.prepare(`SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM timeline_events e WHERE e.topic_id = t.id) AS timeline_count,
      (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.topic_id = t.id) AS commercial_deals_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t ${topicFilter}
      ORDER BY t.is_pinned DESC, t.sort_order ASC, t.updated_at DESC`),
    db.prepare('SELECT topic_id, tag_id FROM topic_tags'),
    db.prepare('SELECT topic_id, person_id FROM topic_people'),
    db.prepare('SELECT id, name, color FROM tags'),
    db.prepare('SELECT * FROM people'),
  ]);

  const topicRows = results[0].results as unknown as Topic[];
  const topicTags = results[1].results as unknown as Array<{ topic_id: string; tag_id: string }>;
  const topicPeople = results[2].results as unknown as Array<{ topic_id: string; person_id: string }>;
  const tags = results[3].results as unknown as Tag[];
  const people = results[4].results as unknown as Person[];
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]));
  const personMap = new Map(people.map((person) => [person.id, person]));
  const tagsByTopic = new Map<string, Tag[]>();
  const peopleByTopic = new Map<string, Person[]>();

  topicTags.forEach(({ topic_id, tag_id }) => {
    const tag = tagMap.get(tag_id);
    if (tag) tagsByTopic.set(topic_id, [...(tagsByTopic.get(topic_id) || []), tag]);
  });
  topicPeople.forEach(({ topic_id, person_id }) => {
    const person = personMap.get(person_id);
    if (person) peopleByTopic.set(topic_id, [...(peopleByTopic.get(topic_id) || []), person]);
  });

  return topicRows.map((topic) => ({
    ...topic,
    tags: tagsByTopic.get(topic.id) || [],
    people: peopleByTopic.get(topic.id) || [],
  }));
}

export async function loadTrashedTopics(db: D1Database): Promise<Topic[]> {
  return loadTopics(db, 'trash');
}

export async function loadTodayFocus(db: D1Database): Promise<{ topics: Topic[]; total_active: number }> {
  const activeCondition = "t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox')";
  const [focusResult, priorityResult, recentResult, countResult] = await db.batch([
    db.prepare(`SELECT t.id FROM topics t WHERE ${activeCondition}
      ORDER BY t.is_pinned DESC,
        CASE WHEN t.status IN ('approved', 'scripting', 'production') THEN 1 ELSE 0 END DESC,
        CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
        t.updated_at DESC, t.id DESC LIMIT 1`),
    db.prepare(`SELECT t.id FROM topics t WHERE ${activeCondition}
      ORDER BY t.is_pinned DESC,
        CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
        t.updated_at DESC, t.id DESC LIMIT 5`),
    db.prepare(`SELECT t.id FROM topics t WHERE t.deleted_at IS NULL ORDER BY t.updated_at DESC, t.id DESC LIMIT 8`),
    db.prepare(`SELECT COUNT(*) AS count FROM topics t WHERE ${activeCondition}`),
  ]);
  const orderedIds = Array.from(new Set([
    ...(focusResult.results as unknown as Array<{ id: string }>).map((row) => row.id),
    ...(priorityResult.results as unknown as Array<{ id: string }>).map((row) => row.id),
    ...(recentResult.results as unknown as Array<{ id: string }>).map((row) => row.id),
  ]));
  const loadedTopics = await Promise.all(orderedIds.map((id) => loadTopic(db, id)));
  return {
    topics: loadedTopics.filter((topic): topic is Topic => Boolean(topic)),
    total_active: Number((countResult.results[0] as { count?: number } | undefined)?.count || 0),
  };
}

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

export async function loadCommercialDealPage(db: D1Database, options: CommercialDealPageOptions): Promise<PaginatedCommercialDeals> {
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

export async function loadCommercialDeal(db: D1Database, id: string): Promise<CommercialDealDetail | null> {
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

export async function deleteCommercialDeal(db: D1Database, id: string): Promise<boolean> {
  const existing = await db.prepare('SELECT id FROM commercial_deals WHERE id = ?').bind(id).first<{ id: string }>();
  if (!existing) return false;
  await db.batch([
    db.prepare('DELETE FROM commercial_deal_activities WHERE deal_id = ?').bind(id),
    db.prepare('DELETE FROM commercial_deal_topics WHERE deal_id = ?').bind(id),
    db.prepare('DELETE FROM commercial_deals WHERE id = ?').bind(id),
  ]);
  return true;
}

export async function loadCommercialDealsByTopicId(db: D1Database, topicId: string): Promise<CommercialDeal[]> {
  const result = await db.prepare(`SELECT ${commercialDealProjection()}, cdt.relation_role AS relation_role
    FROM commercial_deals d
    INNER JOIN commercial_deal_topics cdt ON cdt.deal_id = d.id
    WHERE cdt.topic_id = ?
    ORDER BY CASE WHEN cdt.relation_role = 'primary' THEN 0 ELSE 1 END, d.updated_at DESC`).bind(topicId).all<Record<string, unknown>>();
  return result.results.map(normalizeCommercialDeal);
}

export async function loadCommercialDealFocus(db: D1Database): Promise<DealFocusData> {
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

export class TopicNotInTrashError extends Error {}

function permanentDeleteStatements(db: D1Database, id: string): D1PreparedStatement[] {
  const trashedTopic = 'SELECT id FROM topics WHERE id = ? AND deleted_at IS NOT NULL';
  return [
    bind(db, `DELETE FROM draft_citations WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM drafts WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM sources WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM timeline_event_people WHERE timeline_event_id IN
      (SELECT id FROM timeline_events WHERE topic_id IN (${trashedTopic}))`, [id]),
    bind(db, `DELETE FROM timeline_events WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM topic_tags WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM topic_people WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM commercial_deal_topics WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, `DELETE FROM published_videos WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, 'DELETE FROM topics WHERE id = ? AND deleted_at IS NOT NULL', [id]),
  ];
}

export async function permanentlyDeleteTrashedTopics(db: D1Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  const result = await bind(db,
    `SELECT id FROM topics WHERE deleted_at IS NOT NULL AND id IN (${placeholders})`, ids
  ).all<{ id: string }>();
  if (result.results.length !== ids.length) {
    throw new TopicNotInTrashError('All topics must be in trash before permanent deletion');
  }

  const CHUNK_SIZE = 25;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunkIds = ids.slice(i, i + CHUNK_SIZE);
    await db.batch(chunkIds.flatMap((id) => permanentDeleteStatements(db, id)));
  }
}

export interface TopicPageOptions {
  scope: 'active' | 'archived' | 'trash' | 'all';
  page: number;
  pageSize: number;
  query?: string;
  status?: string;
  priority?: string;
  tagId?: string;
  personId?: string;
  sort?: 'title' | 'status' | 'priority' | 'score' | 'words' | 'updated_at' | 'created_at' | 'sort_order';
  direction?: 'asc' | 'desc';
}

function buildTopicFilterConditions(options: TopicPageOptions): { conditions: string[]; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.status) {
    const statuses = options.status.split(',').map((status) => status.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push('t.status = ?');
      values.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`t.status IN (${statuses.map(() => '?').join(',')})`);
      values.push(...statuses);
    }
  }
  if (options.priority) { conditions.push('t.priority = ?'); values.push(options.priority); }
  if (options.tagId) { conditions.push('EXISTS (SELECT 1 FROM topic_tags ft WHERE ft.topic_id = t.id AND ft.tag_id = ?)'); values.push(options.tagId); }
  if (options.personId) { conditions.push('EXISTS (SELECT 1 FROM topic_people fp WHERE fp.topic_id = t.id AND fp.person_id = ?)'); values.push(options.personId); }
  if (options.query) {
    const pattern = `%${options.query.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(`(t.title LIKE ? ESCAPE '\\' OR t.summary LIKE ? ESCAPE '\\' OR t.hook LIKE ? ESCAPE '\\'
      OR t.next_action LIKE ? ESCAPE '\\' OR t.storyline LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM topic_tags st INNER JOIN tags sg ON sg.id = st.tag_id WHERE st.topic_id = t.id AND sg.name LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM topic_people sp INNER JOIN people spp ON spp.id = sp.person_id WHERE sp.topic_id = t.id
        AND (spp.name LIKE ? ESCAPE '\\' OR spp.aliases LIKE ? ESCAPE '\\' OR spp.identity LIKE ? ESCAPE '\\')))`);
    values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  return { conditions, values };
}

function getTopicScopeCondition(scope: TopicPageOptions['scope']): string {
  if (scope === 'trash') return 't.deleted_at IS NOT NULL';
  if (scope === 'active') return "t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox')";
  if (scope === 'archived') return "t.deleted_at IS NULL AND t.status IN ('published', 'icebox')";
  return 't.deleted_at IS NULL';
}

export async function loadTopicPage(db: D1Database, options: TopicPageOptions): Promise<PaginatedTopics> {
  const baseFilter = buildTopicFilterConditions(options);
  const conditions = [getTopicScopeCondition(options.scope), ...baseFilter.conditions];
  const values = baseFilter.values;
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const baseWhere = baseFilter.conditions.length ? `WHERE ${baseFilter.conditions.join(' AND ')}` : '';
  const sortExpressions: Record<string, string> = {
    title: 't.title COLLATE NOCASE', status: 't.status', priority: "CASE t.priority WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END",
    score: '(t.score_character + t.score_conflict + t.score_contrast + t.score_material + t.score_story)',
    words: 'draft_word_count', created_at: 't.created_at', updated_at: 't.updated_at', sort_order: 't.sort_order',
  };
  const sort = sortExpressions[options.sort || 'updated_at'];
  const direction = options.direction === 'asc' ? 'ASC' : 'DESC';
  const offset = (options.page - 1) * options.pageSize;
  const [countResult, summaryResult, scopeCountsResult, rowsResult] = await db.batch([
    bind(db, `SELECT COUNT(*) AS count FROM topics t ${where}`, values),
    bind(db, `SELECT
      COALESCE(SUM(COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0)), 0) AS total_words,
      COALESCE(SUM(CASE WHEN t.deleted_at IS NULL AND t.status IN ('scripting', 'production') THEN 1 ELSE 0 END), 0) AS in_scripting_count
      FROM topics t ${where}`, values),
    bind(db, `SELECT
      COALESCE(SUM(CASE WHEN t.deleted_at IS NULL AND t.status NOT IN ('published', 'icebox') THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN t.deleted_at IS NULL AND t.status IN ('published', 'icebox') THEN 1 ELSE 0 END), 0) AS archived,
      COALESCE(SUM(CASE WHEN t.deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS trash
      FROM topics t ${baseWhere}`, baseFilter.values),
    bind(db, `SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM timeline_events e WHERE e.topic_id = t.id) AS timeline_count,
      (SELECT COUNT(*) FROM commercial_deal_topics cdt WHERE cdt.topic_id = t.id) AS commercial_deals_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t ${where} ORDER BY ${sort} ${direction}, t.id ASC LIMIT ? OFFSET ?`, [...values, options.pageSize, offset]),
  ]);
  const rows = rowsResult.results as unknown as Topic[];
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const [tagResult, personResult] = await db.batch([
      bind(db, `SELECT tt.topic_id, tg.* FROM topic_tags tt INNER JOIN tags tg ON tg.id = tt.tag_id WHERE tt.topic_id IN (${placeholders})`, ids),
      bind(db, `SELECT tp.topic_id, p.* FROM topic_people tp INNER JOIN people p ON p.id = tp.person_id WHERE tp.topic_id IN (${placeholders})`, ids),
    ]);
    rows.forEach((topic) => {
      topic.tags = (tagResult.results as unknown as Array<Tag & { topic_id: string }>).filter((tag) => tag.topic_id === topic.id);
      topic.people = (personResult.results as unknown as Array<Person & { topic_id: string }>).filter((person) => person.topic_id === topic.id);
    });
  }
  const total = Number((countResult.results[0] as { count?: number } | undefined)?.count || 0);
  const summaryRow = summaryResult.results[0] as { total_words?: number; in_scripting_count?: number } | undefined;
  const scopeCountsRow = scopeCountsResult.results[0] as { active?: number; archived?: number; trash?: number } | undefined;
  return {
    items: rows,
    page: options.page,
    page_size: options.pageSize,
    total,
    total_pages: Math.ceil(total / options.pageSize),
    summary: {
      total_words: Number(summaryRow?.total_words || 0),
      in_scripting_count: Number(summaryRow?.in_scripting_count || 0),
    },
    scope_counts: {
      active: Number(scopeCountsRow?.active || 0),
      archived: Number(scopeCountsRow?.archived || 0),
      trash: Number(scopeCountsRow?.trash || 0),
    },
  };
}

interface PageOptions {
  page: number;
  pageSize: number;
  query?: string;
}

export async function loadPublishedPage(db: D1Database, options: PageOptions): Promise<PaginatedPublishedVideos> {
  const offset = (options.page - 1) * options.pageSize;
  const [countResult, rowsResult] = await db.batch([
    db.prepare('SELECT COUNT(*) AS count FROM published_videos'),
    db.prepare(`SELECT v.*, t.title AS topic_title
      FROM published_videos v
      LEFT JOIN topics t ON t.id = v.topic_id
      ORDER BY v.published_at DESC, v.updated_at DESC, v.id DESC
      LIMIT ? OFFSET ?`).bind(options.pageSize, offset),
  ]);
  const total = Number((countResult.results[0] as { count?: number } | undefined)?.count || 0);
  return {
    items: rowsResult.results as unknown as PaginatedPublishedVideos['items'],
    page: options.page,
    page_size: options.pageSize,
    total,
    total_pages: Math.ceil(total / options.pageSize),
  };
}

export async function loadPublishedAnalytics(
  db: D1Database,
  options: PageOptions & { range: 'all' | '90d' | 'year' },
): Promise<PublishedAnalyticsPayload> {
  const result = await db.prepare(`SELECT v.*, t.title AS topic_title
    FROM published_videos v
    LEFT JOIN topics t ON t.id = v.topic_id
    ORDER BY v.published_at DESC, v.updated_at DESC, v.id DESC`).all<PublishedVideo>();
  const allVideos = result.results || [];
  const topics = await loadTopics(db, 'active');
  const filteredVideos = options.range === 'all'
    ? allVideos
    : (() => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (options.range === '90d' ? 90 : 365));
      return allVideos.filter((video) => {
        const publishedAt = video.published_at ? new Date(video.published_at) : null;
        return publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt >= cutoff;
      });
    })();
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const ranking = filteredVideos
    .map((video) => {
      const topic = video.topic_id ? topicMap.get(video.topic_id) || null : null;
      return {
        video,
        topic,
        deepMetrics: calculateDeepMetrics(video, topic),
        storyModelTotal: topic
          ? topic.score_character + topic.score_conflict + topic.score_contrast + topic.score_material + topic.score_story
          : 0,
      };
    })
    .sort((a, b) => (b.video.views || 0) - (a.video.views || 0) || a.video.id.localeCompare(b.video.id));
  const offset = (options.page - 1) * options.pageSize;

  return {
    totalVideos: filteredVideos.length,
    overview: calculateChannelOverview(filteredVideos, topics),
    correlation: analyzeTopicModelCorrelation(filteredVideos, topics),
    people: analyzePeoplePerformance(filteredVideos, topics),
    tags: analyzeTagPerformance(filteredVideos, topics),
    insights: generateAnalyticsInsights(filteredVideos, topics),
    ranking: ranking.slice(offset, offset + options.pageSize),
    ranking_total: ranking.length,
    ranking_page: options.page,
    ranking_page_size: options.pageSize,
  };
}

export async function loadPeoplePage(db: D1Database, options: PageOptions): Promise<PaginatedPeople> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.query?.trim()) {
    const pattern = `%${options.query.trim().replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(`(p.name LIKE ? ESCAPE '\\' OR p.aliases LIKE ? ESCAPE '\\'
      OR p.identity LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')`);
    values.push(pattern, pattern, pattern, pattern);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (options.page - 1) * options.pageSize;
  const [countResult, rowsResult] = await db.batch([
    bind(db, `SELECT COUNT(*) AS count FROM people p ${where}`, values),
    bind(db, `SELECT p.*,
      (SELECT COUNT(*) FROM topic_people tp
        INNER JOIN topics rt ON rt.id = tp.topic_id AND rt.deleted_at IS NULL
        WHERE tp.person_id = p.id) AS related_topics_count
      FROM people p ${where}
      ORDER BY p.updated_at DESC, p.id DESC LIMIT ? OFFSET ?`, [...values, options.pageSize, offset]),
  ]);
  const items = rowsResult.results as unknown as Array<Person & { related_topic_previews?: Array<{ id: string; title: string }> }>;
  if (items.length > 0) {
    const ids = items.map((person) => person.id);
    const placeholders = ids.map(() => '?').join(',');
    const previewResult = await bind(db, `SELECT tp.person_id, t.id, t.title
      FROM topic_people tp INNER JOIN topics t ON t.id = tp.topic_id
      WHERE tp.person_id IN (${placeholders}) AND t.deleted_at IS NULL
      ORDER BY t.updated_at DESC, t.id DESC`, ids).all<{ person_id: string; id: string; title: string }>();
    const previews = new Map<string, Array<{ id: string; title: string }>>();
    previewResult.results.forEach((preview) => {
      const current = previews.get(preview.person_id) || [];
      if (current.length < 2) previews.set(preview.person_id, [...current, { id: preview.id, title: preview.title }]);
    });
    items.forEach((person) => {
      person.related_topic_previews = previews.get(person.id) || [];
    });
  }
  const total = Number((countResult.results[0] as { count?: number } | undefined)?.count || 0);
  return {
    items,
    page: options.page,
    page_size: options.pageSize,
    total,
    total_pages: Math.ceil(total / options.pageSize),
  };
}

export async function loadTagsPage(db: D1Database, options: PageOptions): Promise<PaginatedTags> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.query?.trim()) {
    const pattern = `%${options.query.trim().replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push("tg.name LIKE ? ESCAPE '\\'");
    values.push(pattern);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (options.page - 1) * options.pageSize;
  const [countResult, summaryResult, rowsResult] = await db.batch([
    bind(db, `SELECT COUNT(*) AS count FROM tags tg ${where}`, values),
    db.prepare(`SELECT
      COUNT(DISTINCT CASE WHEN t.deleted_at IS NULL THEN t.id END) AS tagged_topics,
      (SELECT COUNT(*) FROM topics WHERE deleted_at IS NULL) AS total_topics
      FROM topic_tags tt
      INNER JOIN topics t ON t.id = tt.topic_id`),
    bind(db, `SELECT tg.id, tg.name, tg.color,
      COUNT(DISTINCT CASE WHEN t.deleted_at IS NULL THEN t.id END) AS tag_count,
      COUNT(DISTINCT CASE WHEN t.deleted_at IS NULL AND t.status IN ('approved', 'scripting', 'production') THEN t.id END) AS in_progress_count,
      COUNT(DISTINCT CASE WHEN t.deleted_at IS NULL AND t.status = 'published' THEN t.id END) AS published_count,
      COALESCE(SUM(CASE WHEN t.deleted_at IS NULL THEN COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) ELSE 0 END), 0) AS words_total,
      COALESCE(AVG(CASE WHEN t.deleted_at IS NULL THEN
        (t.score_character + t.score_conflict + t.score_contrast + t.score_material + t.score_story) / 5.0 END), 0) AS avg_score
      FROM tags tg
      LEFT JOIN topic_tags tt ON tt.tag_id = tg.id
      LEFT JOIN topics t ON t.id = tt.topic_id
      ${where}
      GROUP BY tg.id, tg.name, tg.color
      ORDER BY tg.name COLLATE NOCASE ASC, tg.id ASC LIMIT ? OFFSET ?`, [...values, options.pageSize, offset]),
  ]);
  const rows = rowsResult.results as unknown as Array<Tag & {
    tag_count?: number;
    in_progress_count?: number;
    published_count?: number;
    words_total?: number;
    avg_score?: number;
  }>;
  const total = Number((countResult.results[0] as { count?: number } | undefined)?.count || 0);
  const summaryRow = summaryResult.results[0] as { tagged_topics?: number; total_topics?: number } | undefined;
  return {
    items: rows.map(({ tag_count, in_progress_count, published_count, words_total, avg_score, ...tag }) => ({
      ...tag,
      stats: {
        count: Number(tag_count || 0),
        in_progress_count: Number(in_progress_count || 0),
        published_count: Number(published_count || 0),
        words_total: Number(words_total || 0),
        avg_score: Number(Number(avg_score || 0).toFixed(1)),
      },
    })),
    page: options.page,
    page_size: options.pageSize,
    total,
    total_pages: Math.ceil(total / options.pageSize),
    summary: {
      tagged_topics: Number(summaryRow?.tagged_topics || 0),
      total_topics: Number(summaryRow?.total_topics || 0),
    },
  };
}

export interface BootstrapLoadOptions {
  includeTopics?: boolean;
  includePeople?: boolean;
  includeRelationships?: boolean;
  includePublished?: boolean;
  includeTags?: boolean;
}

export async function loadBootstrap(db: D1Database, kvSettings?: AppSettings, options: BootstrapLoadOptions = {}): Promise<BootstrapData> {
  const includeTopics = options.includeTopics !== false;
  const includePeople = options.includePeople !== false;
  const includeRelationships = options.includeRelationships !== false;
  const includePublished = options.includePublished !== false;
  const includeTags = options.includeTags !== false;
  const queries: D1PreparedStatement[] = [
    includePeople ? db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM topic_people tp WHERE tp.person_id = p.id) AS related_topics_count
      FROM people p ORDER BY p.updated_at DESC`) : db.prepare('SELECT NULL WHERE 1 = 0'),
    includeRelationships ? db.prepare(`SELECT r.*, a.name AS person_a_name, b.name AS person_b_name
      FROM person_relationships r
      LEFT JOIN people a ON a.id = r.person_a_id
      LEFT JOIN people b ON b.id = r.person_b_id
      ORDER BY r.created_at DESC`) : db.prepare('SELECT NULL WHERE 1 = 0'),
    includePublished ? db.prepare(`SELECT v.*, t.title AS topic_title FROM published_videos v
      LEFT JOIN topics t ON t.id = v.topic_id ORDER BY v.published_at DESC, v.updated_at DESC`)
      : db.prepare('SELECT NULL WHERE 1 = 0'),
    includeTags ? db.prepare('SELECT id, name, color FROM tags ORDER BY name ASC') : db.prepare('SELECT NULL WHERE 1 = 0'),
  ];

  const settings = kvSettings || DEFAULT_APP_SETTINGS;

  const [topics, otherResults] = await Promise.all([
    includeTopics ? loadTopics(db, 'active') : Promise.resolve([] as Topic[]),
    db.batch(queries),
  ]);

  return {
    topics,
    people: otherResults[0].results as unknown as Person[],
    relationships: otherResults[1].results as unknown as PersonRelationship[],
    published: otherResults[2].results as unknown as PublishedVideo[],
    tags: otherResults[3].results as unknown as Tag[],
    settings,
  };
}

export async function loadTopic(db: D1Database, id: string): Promise<Topic | null> {
  const results = await db.batch([
    bind(db, `SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.verification_status = 'confirmed') AS verified_sources_count,
      (SELECT COUNT(*) FROM timeline_events e WHERE e.topic_id = t.id) AS timeline_count,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t WHERE t.id = ? AND t.deleted_at IS NULL LIMIT 1`, [id]),
    bind(db, `SELECT tg.* FROM tags tg
      INNER JOIN topic_tags tt ON tt.tag_id = tg.id
      WHERE tt.topic_id = ?`, [id]),
    bind(db, `SELECT p.* FROM people p
      INNER JOIN topic_people tp ON tp.person_id = p.id
      WHERE tp.topic_id = ?`, [id]),
  ]);

  const topic = (results[0].results as unknown as Topic[])[0];
  if (!topic) return null;

  return {
    ...topic,
    tags: (results[1].results as unknown as Tag[]) || [],
    people: (results[2].results as unknown as Person[]) || [],
  };
}

function topicStatement(db: D1Database, topic: Partial<Topic> & { id: string; title: string }): D1PreparedStatement {
  const now = new Date().toISOString();
  return bind(db, `INSERT INTO topics (
    id, title, summary, hook, storyline, why_now, status, priority, next_action,
    next_action_updated_at, next_action_deferred_until,
    score_character, score_conflict, score_contrast, score_material, score_story,
    is_pinned, sort_order, created_at, updated_at, published_at, deleted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title, summary=excluded.summary, hook=excluded.hook, storyline=excluded.storyline,
    why_now=excluded.why_now, status=excluded.status, priority=excluded.priority,
    next_action=excluded.next_action, next_action_updated_at=excluded.next_action_updated_at,
    next_action_deferred_until=excluded.next_action_deferred_until, score_character=excluded.score_character,
    score_conflict=excluded.score_conflict, score_contrast=excluded.score_contrast,
    score_material=excluded.score_material, score_story=excluded.score_story,
    is_pinned=excluded.is_pinned, sort_order=excluded.sort_order, updated_at=excluded.updated_at,
    published_at=excluded.published_at, deleted_at=excluded.deleted_at`, [
    topic.id, topic.title, topic.summary ?? '', topic.hook ?? '', topic.storyline ?? '', topic.why_now ?? '',
    topic.status ?? 'inbox', topic.priority ?? 'medium', topic.next_action ?? '',
    topic.next_action_updated_at ?? (topic.next_action ? now : null), topic.next_action_deferred_until ?? null,
    topic.score_character ?? 0, topic.score_conflict ?? 0, topic.score_contrast ?? 0,
    topic.score_material ?? 0, topic.score_story ?? 0, topic.is_pinned ?? 0, topic.sort_order ?? 0,
    topic.created_at ?? now, now, topic.published_at ?? null, topic.deleted_at ?? null,
  ]);
}

function sourceStatement(db: D1Database, source: Source): D1PreparedStatement {
  return bind(db, `INSERT INTO sources (
    id, topic_id, title, content, url, platform, author, published_at,
    verification_status, notes, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    source.id, source.topic_id, source.title, source.content, source.url, source.platform,
    source.author, source.published_at, source.verification_status, source.notes,
    source.created_at, source.updated_at,
  ]);
}

function timelineStatement(db: D1Database, event: TimelineEvent): D1PreparedStatement {
  return bind(db, `INSERT INTO timeline_events (
    id, topic_id, title, description, event_date, date_precision, verification_status,
    sort_order, contrast_tag, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    event.id, event.topic_id, event.title, event.description, event.event_date, event.date_precision,
    event.verification_status, event.sort_order, event.contrast_tag ?? '', event.created_at, event.updated_at,
  ]);
}

function personStatement(db: D1Database, person: Person): D1PreparedStatement {
  return bind(db, `INSERT INTO people (
    id, name, aliases, avatar_url, description, identity, platform_accounts, quotes, notes, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    person.id, person.name, person.aliases, person.avatar_url, person.description, person.identity,
    person.platform_accounts, person.quotes, person.notes, person.created_at, person.updated_at,
  ]);
}

function relationshipStatement(db: D1Database, relationship: PersonRelationship): D1PreparedStatement {
  return bind(db, `INSERT INTO person_relationships (
    id, person_a_id, person_b_id, relationship, description, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)`, [
    relationship.id, relationship.person_a_id, relationship.person_b_id,
    relationship.relationship, relationship.description, relationship.created_at,
  ]);
}

function draftStatement(db: D1Database, draft: Draft): D1PreparedStatement {
  return bind(db, `INSERT INTO drafts (
    id, topic_id, title, content_json, content_html, word_count, version, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    draft.id, draft.topic_id, draft.title, draft.content_json, draft.content_html,
    draft.word_count, draft.version || 1, draft.updated_at,
  ]);
}

function citationStatement(db: D1Database, citation: DraftCitation): D1PreparedStatement {
  return bind(db, `INSERT INTO draft_citations (
    id, topic_id, reference_type, reference_id, reference_title, reference_snapshot,
    quoted_text, verification_status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    citation.id, citation.topic_id, citation.reference_type, citation.reference_id,
    citation.reference_title, citation.reference_snapshot, citation.quoted_text,
    citation.verification_status, citation.created_at,
  ]);
}

function publishedStatement(db: D1Database, video: PublishedVideo): D1PreparedStatement {
  return bind(db, `INSERT INTO published_videos (
    id, topic_id, title, url, bvid, published_at, views, likes, coins, favorites, comments, notes, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    video.id, video.topic_id, video.title, video.url, video.bvid, video.published_at,
    video.views, video.likes, video.coins, video.favorites, video.comments, video.notes, video.updated_at,
  ]);
}

function publishPackageStatement(db: D1Database, publishPackage: PublishPackageRecord): D1PreparedStatement {
  return bind(db, `INSERT INTO publish_packages (
    id, topic_id, version, title_simplified, title_traditional, description_simplified, description_traditional,
    title_traditional_auto, description_traditional_auto, content_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    publishPackage.id, publishPackage.topic_id, publishPackage.version, publishPackage.title_simplified,
    publishPackage.title_traditional, publishPackage.description_simplified, publishPackage.description_traditional,
    publishPackage.title_traditional_auto ? 1 : 0, publishPackage.description_traditional_auto ? 1 : 0,
    publishPackage.content_json, publishPackage.updated_at,
  ]);
}

function commercialDealStatement(db: D1Database, deal: CommercialDeal): D1PreparedStatement {
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

function commercialDealTopicStatement(db: D1Database, relation: CommercialDealTopic): D1PreparedStatement {
  return bind(db, `INSERT INTO commercial_deal_topics (id, deal_id, topic_id, relation_role, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      deal_id=excluded.deal_id, topic_id=excluded.topic_id, relation_role=excluded.relation_role`, [
    relation.id, relation.deal_id, relation.topic_id, relation.relation_role, relation.created_at,
  ]);
}

function commercialDealActivityStatement(db: D1Database, activity: CommercialDealActivity): D1PreparedStatement {
  return bind(db, `INSERT INTO commercial_deal_activities (id, deal_id, kind, content, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      deal_id=excluded.deal_id, kind=excluded.kind, content=excluded.content, created_at=excluded.created_at`, [
    activity.id, activity.deal_id, activity.kind, activity.content, activity.created_at,
  ]);
}

export async function replaceAllData(db: D1Database, data: BackupData): Promise<void> {
  assertBackupImportWithinLimits(data);
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM commercial_deal_activities'),
    db.prepare('DELETE FROM commercial_deal_topics'),
    db.prepare('DELETE FROM commercial_deals'),
    db.prepare('DELETE FROM topic_tags'), db.prepare('DELETE FROM topic_people'),
    db.prepare('DELETE FROM timeline_event_people'),
    db.prepare('DELETE FROM sources'), db.prepare('DELETE FROM timeline_events'),
    db.prepare('DELETE FROM draft_citations'), db.prepare('DELETE FROM drafts'), db.prepare('DELETE FROM person_relationships'),
    db.prepare('DELETE FROM publish_packages'), db.prepare('DELETE FROM published_videos'), db.prepare('DELETE FROM topics'),
    db.prepare('DELETE FROM people'), db.prepare('DELETE FROM tags'),
  ];

  data.tags.forEach((tag) => statements.push(bind(db,
    'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)',
    [tag.id, tag.name, tag.color ?? 'stone', data.export_at]
  )));
  data.people.forEach((person) => statements.push(personStatement(db, person)));
  data.topics.forEach((topic) => statements.push(topicStatement(db, { ...topic, title: topic.title })));
  data.topics.forEach((topic) => {
    topic.tags?.forEach((tag) => statements.push(bind(db,
      'INSERT OR IGNORE INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)',
      [`${topic.id}:${tag.id}`, topic.id, tag.id]
    )));
    topic.people?.forEach((person) => statements.push(bind(db,
      'INSERT OR IGNORE INTO topic_people (id, topic_id, person_id, role) VALUES (?, ?, ?, ?)',
      [`${topic.id}:${person.id}`, topic.id, person.id, '']
    )));
  });
  data.sources.forEach((source) => statements.push(sourceStatement(db, source)));
  data.timeline.forEach((event) => {
    statements.push(timelineStatement(db, event));
    event.person_ids?.forEach((personId) => statements.push(bind(db,
      'INSERT INTO timeline_event_people (id, timeline_event_id, person_id) VALUES (?, ?, ?)',
      [`${event.id}:${personId}`, event.id, personId]
    )));
  });
  data.drafts.forEach((draft) => statements.push(draftStatement(db, draft)));
  data.citations.forEach((citation) => statements.push(citationStatement(db, citation)));
  data.relationships.forEach((relationship) => statements.push(relationshipStatement(db, relationship)));
  data.published.forEach((video) => statements.push(publishedStatement(db, video)));
  (data.publish_packages || []).forEach((publishPackage) => statements.push(publishPackageStatement(db, publishPackage)));
  (data.commercial_deals || []).forEach((deal) => statements.push(commercialDealStatement(db, deal)));
  (data.commercial_deal_topics || []).forEach((relation) => statements.push(commercialDealTopicStatement(db, relation)));
  (data.commercial_deal_activities || []).forEach((activity) => statements.push(commercialDealActivityStatement(db, activity)));

  const BATCH_CHUNK_SIZE = 50;
  for (let i = 0; i < statements.length; i += BATCH_CHUNK_SIZE) {
    const chunk = statements.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(chunk);
  }
}

export async function exportAllData(db: D1Database, kvSettings?: AppSettings): Promise<BackupData> {
  const [bootstrap, allTopics, details] = await Promise.all([
    loadBootstrap(db, kvSettings),
    loadTopics(db, 'all'),
    db.batch([
      db.prepare('SELECT * FROM sources ORDER BY created_at DESC'),
      db.prepare('SELECT * FROM timeline_events ORDER BY topic_id, sort_order'),
      db.prepare('SELECT * FROM drafts ORDER BY updated_at DESC'),
      db.prepare('SELECT * FROM draft_citations ORDER BY created_at DESC'),
      db.prepare('SELECT timeline_event_id, person_id FROM timeline_event_people'),
      db.prepare('SELECT * FROM publish_packages ORDER BY updated_at DESC'),
      db.prepare('SELECT * FROM commercial_deals ORDER BY updated_at DESC'),
      db.prepare('SELECT * FROM commercial_deal_topics ORDER BY created_at ASC'),
      db.prepare('SELECT * FROM commercial_deal_activities ORDER BY created_at ASC'),
    ]),
  ]);
  const personIdsByEvent = new Map<string, string[]>();
  (details[4].results as unknown as Array<{ timeline_event_id: string; person_id: string }>).forEach((row) => {
    personIdsByEvent.set(row.timeline_event_id, [
      ...(personIdsByEvent.get(row.timeline_event_id) || []),
      row.person_id,
    ]);
  });
  const timeline = (details[1].results as unknown as TimelineEvent[]).map((event) => ({
    ...event,
    person_ids: personIdsByEvent.get(event.id) || [],
  }));
  const publishPackages = (details[5].results as unknown as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    title_traditional_auto: Number(row.title_traditional_auto) === 1,
    description_traditional_auto: Number(row.description_traditional_auto) === 1,
  })) as unknown as PublishPackageRecord[];
  return {
    version: '2.0',
    export_at: new Date().toISOString(),
    topics: allTopics,
    sources: details[0].results as unknown as Source[],
    timeline,
    people: bootstrap.people,
    relationships: bootstrap.relationships,
    drafts: details[2].results as unknown as Draft[],
    citations: details[3].results as unknown as DraftCitation[],
    tags: bootstrap.tags,
    published: bootstrap.published,
    publish_packages: publishPackages,
    commercial_deals: details[6].results as unknown as CommercialDeal[],
    commercial_deal_topics: details[7].results as unknown as CommercialDealTopic[],
    commercial_deal_activities: details[8].results as unknown as CommercialDealActivity[],
    settings: kvSettings || bootstrap.settings,
  };
}

export const statements = {
  bind,
  topic: topicStatement,
  source: sourceStatement,
  timeline: timelineStatement,
  person: personStatement,
  relationship: relationshipStatement,
  draft: draftStatement,
  citation: citationStatement,
  published: publishedStatement,
  publishPackage: publishPackageStatement,
  commercialDeal: commercialDealStatement,
  commercialDealTopic: commercialDealTopicStatement,
  commercialDealActivity: commercialDealActivityStatement,
};
