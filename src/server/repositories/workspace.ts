import type {
  Draft,
  DraftCitation,
  PublishPackageRecord,
  Source,
  TimelineEvent,
  TopicWorkspaceData,
} from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';

function normalizePublishPackageRecord(row: Record<string, unknown> | null): PublishPackageRecord | null {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    topic_id: String(row.topic_id || ''),
    version: Number(row.version || 1),
    title_simplified: typeof row.title_simplified === 'string' ? row.title_simplified : '',
    title_traditional: typeof row.title_traditional === 'string' ? row.title_traditional : '',
    description_simplified: typeof row.description_simplified === 'string' ? row.description_simplified : '',
    description_traditional: typeof row.description_traditional === 'string' ? row.description_traditional : '',
    title_traditional_auto: Number(row.title_traditional_auto) === 1,
    description_traditional_auto: Number(row.description_traditional_auto) === 1,
    content_json: typeof row.content_json === 'string' ? row.content_json : '{}',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
  };
}

export async function loadTopicWorkspace(db: SqliteDatabase, topicId: string): Promise<TopicWorkspaceData> {
  const [sourcesResult, timeline, draft, citationsResult, publishPackageResult] = await Promise.all([
    db.prepare('SELECT * FROM sources WHERE topic_id = ? ORDER BY created_at DESC').bind(topicId).all<Source>(),
    loadTimelineEvents(db, topicId),
    db.prepare('SELECT * FROM drafts WHERE topic_id = ?').bind(topicId).first<Draft>(),
    db.prepare('SELECT * FROM draft_citations WHERE topic_id = ? ORDER BY created_at DESC').bind(topicId).all<DraftCitation>(),
    db.prepare('SELECT * FROM publish_packages WHERE topic_id = ?').bind(topicId).first<Record<string, unknown>>(),
  ]);
  return {
    sources: sourcesResult.results,
    timeline,
    draft: draft || null,
    citations: citationsResult.results,
    publish_package: normalizePublishPackageRecord(publishPackageResult),
  };
}

export async function loadSourcesByTopic(db: SqliteDatabase, topicId: string): Promise<Source[]> {
  const result = await db.prepare('SELECT * FROM sources WHERE topic_id = ? ORDER BY created_at DESC')
    .bind(topicId).all<Source>();
  return result.results;
}

export function sourceStatement(db: SqliteDatabase, source: Source): SqlitePreparedStatement {
  return bind(db, `INSERT INTO sources (
    id, topic_id, title, content, url, platform, author, published_at,
    verification_status, notes, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    source.id, source.topic_id, source.title, source.content, source.url, source.platform,
    source.author, source.published_at, source.verification_status, source.notes,
    source.created_at, source.updated_at,
  ]);
}

export async function insertSource(db: SqliteDatabase, source: Source): Promise<void> {
  await sourceStatement(db, source).run();
}

export async function updateSource(db: SqliteDatabase, id: string, body: Record<string, unknown>): Promise<Source | null> {
  const fields = ['title', 'content', 'url', 'platform', 'author', 'published_at', 'verification_status', 'notes']
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (fields.length > 0) {
    await bind(db, `UPDATE sources SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...fields.map((field) => body[field]), new Date().toISOString(), id]).run();
  }
  return db.prepare('SELECT * FROM sources WHERE id = ?').bind(id).first<Source>();
}

export async function deleteSource(db: SqliteDatabase, id: string): Promise<void> {
  await bind(db, 'DELETE FROM sources WHERE id = ?', [id]).run();
}

export async function loadTimelineEvents(db: SqliteDatabase, topicId: string): Promise<TimelineEvent[]> {
  const [eventResult, personResult] = await db.batch([
    db.prepare('SELECT * FROM timeline_events WHERE topic_id = ? ORDER BY sort_order').bind(topicId),
    db.prepare(`SELECT tep.timeline_event_id, tep.person_id
      FROM timeline_event_people tep
      INNER JOIN timeline_events te ON te.id = tep.timeline_event_id
      WHERE te.topic_id = ?`).bind(topicId),
  ]);
  const personIdsByEvent = new Map<string, string[]>();
  (personResult.results as unknown as Array<{ timeline_event_id: string; person_id: string }>).forEach((row) => {
    personIdsByEvent.set(row.timeline_event_id, [
      ...(personIdsByEvent.get(row.timeline_event_id) || []),
      row.person_id,
    ]);
  });
  return (eventResult.results as unknown as TimelineEvent[]).map((event) => ({
    ...event,
    person_ids: personIdsByEvent.get(event.id) || [],
  }));
}

function replaceTimelinePeopleStatements(
  db: SqliteDatabase,
  eventId: string,
  personIds: string[]
): SqlitePreparedStatement[] {
  return [
    bind(db, 'DELETE FROM timeline_event_people WHERE timeline_event_id = ?', [eventId]),
    ...Array.from(new Set(personIds)).map((personId) => bind(
      db,
      'INSERT INTO timeline_event_people (id, timeline_event_id, person_id) VALUES (?, ?, ?)',
      [`${eventId}:${personId}`, eventId, personId]
    )),
  ];
}

export async function getNextTimelineSortOrder(db: SqliteDatabase, topicId: string): Promise<number> {
  const max = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM timeline_events WHERE topic_id = ?')
    .bind(topicId).first<{ value: number }>();
  return (max?.value || 0) + 1;
}

export function timelineStatement(db: SqliteDatabase, event: TimelineEvent): SqlitePreparedStatement {
  return bind(db, `INSERT INTO timeline_events (
      id, topic_id, title, description, event_date, date_precision, verification_status,
      sort_order, contrast_tag, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      event.id, event.topic_id, event.title, event.description, event.event_date, event.date_precision,
      event.verification_status, event.sort_order, event.contrast_tag ?? '', event.created_at, event.updated_at,
    ]);
}

export async function insertTimelineEvent(db: SqliteDatabase, event: TimelineEvent): Promise<void> {
  await db.batch([
    timelineStatement(db, event),
    ...replaceTimelinePeopleStatements(db, event.id, event.person_ids || []),
  ]);
}

export async function updateTimelineEvent(
  db: SqliteDatabase,
  id: string,
  body: Record<string, unknown>
): Promise<TimelineEvent | null> {
  const fields = ['title', 'description', 'event_date', 'date_precision', 'verification_status', 'sort_order', 'contrast_tag']
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (fields.length > 0) {
    await bind(db, `UPDATE timeline_events SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...fields.map((field) => body[field]), new Date().toISOString(), id]).run();
  }
  if (Array.isArray(body.person_ids)) {
    await db.batch(replaceTimelinePeopleStatements(
      db,
      id,
      body.person_ids.filter((value): value is string => typeof value === 'string')
    ));
  }
  const row = await db.prepare('SELECT topic_id FROM timeline_events WHERE id = ?').bind(id).first<{ topic_id: string }>();
  if (!row) return null;
  return (await loadTimelineEvents(db, row.topic_id)).find((event) => event.id === id) || null;
}

export async function reorderTimelineEvents(db: SqliteDatabase, events: TimelineEvent[]): Promise<string> {
  const now = new Date().toISOString();
  if (events.length > 0) {
    await db.batch(events.map((event, index) => bind(
      db,
      'UPDATE timeline_events SET sort_order = ?, updated_at = ? WHERE id = ?',
      [index + 1, now, event.id]
    )));
  }
  return now;
}

export async function deleteTimelineEvent(db: SqliteDatabase, id: string): Promise<void> {
  await bind(db, 'DELETE FROM timeline_events WHERE id = ?', [id]).run();
}
