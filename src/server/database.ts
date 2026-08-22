import type {
  AppSettings,
  BackupData,
  BootstrapData,
  Draft,
  DraftCitation,
  Person,
  PersonRelationship,
  PublishedVideo,
  Source,
  Tag,
  TimelineEvent,
  Topic,
  PaginatedTopics,
} from '../types';
import { isTopicStatus } from '../types';

export const MAX_IMPORT_STATEMENTS = 500;
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
}

export class BackupImportLimitError extends Error {}

export function getBackupImportSummary(data: BackupData): BackupImportSummary {
  const topicRelations = data.topics.reduce(
    (count, topic) => count + (topic.tags?.length || 0) + (topic.people?.length || 0),
    0
  );
  const statements = 15 + data.tags.length + data.people.length + data.topics.length + topicRelations
    + data.sources.length + data.timeline.length
    + data.timeline.reduce((count, event) => count + (event.person_ids?.length || 0), 0)
    + data.drafts.length + data.citations.length
    + data.relationships.length + data.published.length;

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

export function parseSettings(rows?: Array<{ key: string; value: string }>): AppSettings {
  if (!rows || rows.length === 0) {
    return { reading_speed: 280, theme: 'light' };
  }
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const speed = Number(values.get('reading_speed'));
  const rawTheme = values.get('theme');
  const theme = rawTheme === 'dark' || rawTheme === 'warm_paper' || rawTheme === 'system' ? rawTheme : 'light';
  return {
    reading_speed: Number.isFinite(speed) && speed > 0 ? speed : 280,
    theme,
  };
}

async function loadTopics(db: D1Database, scope: 'active' | 'trash' | 'all' = 'active'): Promise<Topic[]> {
  const topicFilter = scope === 'active'
    ? 'WHERE t.deleted_at IS NULL'
    : scope === 'trash'
      ? 'WHERE t.deleted_at IS NOT NULL'
      : '';
  const results = await db.batch([
    db.prepare(`SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.type = 'fact' AND s.verification_status = 'confirmed') AS verified_facts_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.type = 'material') AS materials_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.type = 'fact' AND s.verification_status = 'unverified') AS unverified_facts_count,
      (SELECT COUNT(*) FROM timeline_events e WHERE e.topic_id = t.id) AS timeline_count,
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
    bind(db, `DELETE FROM published_videos WHERE topic_id IN (${trashedTopic})`, [id]),
    bind(db, 'DELETE FROM topics WHERE id = ? AND deleted_at IS NOT NULL', [id]),
  ];
}

export async function permanentlyDeleteTrashedTopics(db: D1Database, ids: string[]): Promise<void> {
  const placeholders = ids.map(() => '?').join(', ');
  const result = await bind(db,
    `SELECT id FROM topics WHERE deleted_at IS NOT NULL AND id IN (${placeholders})`, ids
  ).all<{ id: string }>();
  if (result.results.length !== ids.length) {
    throw new TopicNotInTrashError('All topics must be in trash before permanent deletion');
  }
  await db.batch(ids.flatMap((id) => permanentDeleteStatements(db, id)));
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
  sort?: 'title' | 'status' | 'priority' | 'score' | 'words' | 'updated_at' | 'created_at';
  direction?: 'asc' | 'desc';
}

export async function loadTopicPage(db: D1Database, options: TopicPageOptions): Promise<PaginatedTopics> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.scope === 'trash') conditions.push('t.deleted_at IS NOT NULL');
  else {
    conditions.push('t.deleted_at IS NULL');
    if (options.scope === 'active') conditions.push("t.status NOT IN ('published', 'icebox')");
    if (options.scope === 'archived') conditions.push("t.status IN ('published', 'icebox')");
  }
  if (options.status) { conditions.push('t.status = ?'); values.push(options.status); }
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
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortExpressions: Record<string, string> = {
    title: 't.title COLLATE NOCASE', status: 't.status', priority: "CASE t.priority WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END",
    score: '(t.score_character + t.score_conflict + t.score_contrast + t.score_material + t.score_story)',
    words: 'draft_word_count', created_at: 't.created_at', updated_at: 't.updated_at',
  };
  const sort = sortExpressions[options.sort || 'updated_at'];
  const direction = options.direction === 'asc' ? 'ASC' : 'DESC';
  const offset = (options.page - 1) * options.pageSize;
  const [countResult, rowsResult] = await db.batch([
    bind(db, `SELECT COUNT(*) AS count FROM topics t ${where}`, values),
    bind(db, `SELECT t.*,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id) AS sources_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.type = 'fact' AND s.verification_status = 'confirmed') AS verified_facts_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.type = 'material') AS materials_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.type = 'fact' AND s.verification_status = 'unverified') AS unverified_facts_count,
      (SELECT COUNT(*) FROM timeline_events e WHERE e.topic_id = t.id) AS timeline_count,
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
  return { items: rows, page: options.page, page_size: options.pageSize, total, total_pages: Math.ceil(total / options.pageSize) };
}

export async function loadBootstrap(db: D1Database, kvSettings?: AppSettings): Promise<BootstrapData> {
  const queries: D1PreparedStatement[] = [
    db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM topic_people tp WHERE tp.person_id = p.id) AS related_topics_count
      FROM people p ORDER BY p.updated_at DESC`),
    db.prepare(`SELECT r.*, a.name AS person_a_name, b.name AS person_b_name
      FROM person_relationships r
      LEFT JOIN people a ON a.id = r.person_a_id
      LEFT JOIN people b ON b.id = r.person_b_id
      ORDER BY r.created_at DESC`),
    db.prepare(`SELECT v.*, t.title AS topic_title FROM published_videos v
      LEFT JOIN topics t ON t.id = v.topic_id ORDER BY v.published_at DESC, v.updated_at DESC`),
    db.prepare('SELECT id, name, color FROM tags ORDER BY name ASC'),
  ];
  if (!kvSettings) {
    queries.push(db.prepare('SELECT key, value FROM settings'));
  }

  const [topics, otherResults] = await Promise.all([
    loadTopics(db, 'active'),
    db.batch(queries),
  ]);

  const settings = kvSettings || parseSettings(otherResults[4]?.results as unknown as Array<{ key: string; value: string }>);

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
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.type = 'fact' AND s.verification_status = 'confirmed') AS verified_facts_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.type = 'material') AS materials_count,
      (SELECT COUNT(*) FROM sources s WHERE s.topic_id = t.id AND s.type = 'fact' AND s.verification_status = 'unverified') AS unverified_facts_count,
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
    id, topic_id, title, type, content, url, platform, author, published_at,
    verification_status, notes, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    source.id, source.topic_id, source.title, source.type, source.content, source.url, source.platform,
    source.author, source.published_at, source.verification_status, source.notes,
    source.created_at, source.updated_at,
  ]);
}

function timelineStatement(db: D1Database, event: TimelineEvent): D1PreparedStatement {
  return bind(db, `INSERT INTO timeline_events (
    id, topic_id, title, description, event_date, date_precision, verification_status,
    sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    event.id, event.topic_id, event.title, event.description, event.event_date, event.date_precision,
    event.verification_status, event.sort_order, event.created_at, event.updated_at,
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

export async function replaceAllData(db: D1Database, data: BackupData): Promise<void> {
  assertBackupImportWithinLimits(data);
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM topic_tags'), db.prepare('DELETE FROM topic_people'),
    db.prepare('DELETE FROM timeline_event_people'),
    db.prepare('DELETE FROM sources'), db.prepare('DELETE FROM timeline_events'),
    db.prepare('DELETE FROM draft_citations'), db.prepare('DELETE FROM drafts'), db.prepare('DELETE FROM person_relationships'),
    db.prepare('DELETE FROM published_videos'), db.prepare('DELETE FROM topics'),
    db.prepare('DELETE FROM people'), db.prepare('DELETE FROM tags'), db.prepare('DELETE FROM settings'),
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
  statements.push(bind(db, 'INSERT INTO settings (key, value) VALUES (?, ?)',
    ['reading_speed', String(data.settings.reading_speed)]));
  statements.push(bind(db, 'INSERT INTO settings (key, value) VALUES (?, ?)',
    ['theme', data.settings.theme]));

  await db.batch(statements);
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
};
