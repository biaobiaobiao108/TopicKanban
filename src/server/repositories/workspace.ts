import type {
  Draft,
  DraftCitation,
  PublishPackageRecord,
  Source,
  TopicReport,
  TopicWorkspaceData,
} from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';
import { loadTopicReport } from './writing';

export class SourceReorderInvalidStateError extends Error {}

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
  const [sourcesResult, report, draft, citationsResult, publishPackageResult] = await Promise.all([
    db.prepare('SELECT * FROM sources WHERE topic_id = ? ORDER BY sort_order ASC, created_at DESC').bind(topicId).all<Source>(),
    loadTopicReport(db, topicId),
    db.prepare('SELECT * FROM drafts WHERE topic_id = ?').bind(topicId).first<Draft>(),
    db.prepare('SELECT * FROM draft_citations WHERE topic_id = ? ORDER BY created_at DESC').bind(topicId).all<DraftCitation>(),
    db.prepare('SELECT * FROM publish_packages WHERE topic_id = ?').bind(topicId).first<Record<string, unknown>>(),
  ]);
  return {
    sources: sourcesResult.results,
    report,
    timeline: [],
    draft: draft || null,
    citations: citationsResult.results,
    publish_package: normalizePublishPackageRecord(publishPackageResult),
  };
}

export async function loadSourcesByTopic(db: SqliteDatabase, topicId: string): Promise<Source[]> {
  const result = await db.prepare('SELECT * FROM sources WHERE topic_id = ? ORDER BY sort_order ASC, created_at DESC')
    .bind(topicId).all<Source>();
  return result.results;
}

export function sourceStatement(db: SqliteDatabase, source: Source): SqlitePreparedStatement {
  return bind(db, `INSERT INTO sources (
    id, topic_id, title, content, url, platform, author, published_at,
    verification_status, notes, event_date, date_precision, sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    source.id, source.topic_id, source.title, source.content || '', source.url || '', source.platform || 'bilibili',
    source.author || '', source.published_at || '', source.verification_status || 'unverified', source.notes || '',
    source.event_date || '', source.date_precision || 'exact', source.sort_order || 0,
    source.created_at, source.updated_at,
  ]);
}

export async function insertSource(db: SqliteDatabase, source: Source): Promise<void> {
  await sourceStatement(db, source).run();
}

export async function updateSource(db: SqliteDatabase, id: string, body: Record<string, unknown>): Promise<Source | null> {
  const fields = ['title', 'content', 'url', 'platform', 'author', 'published_at', 'verification_status', 'notes', 'event_date', 'date_precision', 'sort_order']
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (fields.length > 0) {
    await bind(db, `UPDATE sources SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...fields.map((field) => body[field]), new Date().toISOString(), id]).run();
  }
  return db.prepare('SELECT * FROM sources WHERE id = ?').bind(id).first<Source>();
}

export async function reorderSources(db: SqliteDatabase, sources: Array<{ id: string; topic_id: string }>): Promise<string> {
  const now = new Date().toISOString();
  if (sources.length > 0) {
    const sourceIds = sources.map((s) => s.id);
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new SourceReorderInvalidStateError('Duplicate source ids are not allowed');
    }
    const placeholders = sourceIds.map(() => '?').join(',');
    const existing = await db.prepare(`SELECT id, topic_id FROM sources WHERE id IN (${placeholders})`)
      .bind(...sourceIds).all<{ id: string; topic_id: string }>();
    if (existing.results.length !== sourceIds.length) {
      throw new SourceReorderInvalidStateError('All sources must exist before reordering');
    }
    const requestedTopicIds = new Set(sources.map((s) => s.topic_id));
    if (requestedTopicIds.size !== 1 || existing.results.some((s) => s.topic_id !== sources[0]?.topic_id)) {
      throw new SourceReorderInvalidStateError('Sources must belong to the same topic');
    }
    await db.batch(sources.map((s, index) => bind(
      db,
      'UPDATE sources SET sort_order = ?, updated_at = ? WHERE id = ?',
      [index + 1, now, s.id]
    )));
  }
  return now;
}

export async function deleteSource(db: SqliteDatabase, id: string): Promise<void> {
  await bind(db, 'DELETE FROM sources WHERE id = ?', [id]).run();
}
