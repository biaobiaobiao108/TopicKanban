import type { Database } from 'bun:sqlite';
import type {
  Draft,
  DraftCitation,
  PublishPackageRecord,
  Source,
  TopicWorkspaceData,
} from '../../types';
import { command, execute, readAll, readOne } from './shared';
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

export async function loadTopicWorkspace(db: Database, topicId: string): Promise<TopicWorkspaceData> {
  const [sources, report, draft, citations, publishPackage] = await Promise.all([
    Promise.resolve(readAll<Source>(db, 'SELECT * FROM sources WHERE topic_id = ? ORDER BY sort_order ASC, created_at DESC', [topicId])),
    loadTopicReport(db, topicId),
    Promise.resolve(readOne<Draft>(db, 'SELECT * FROM drafts WHERE topic_id = ?', [topicId])),
    Promise.resolve(readAll<DraftCitation>(db, 'SELECT * FROM draft_citations WHERE topic_id = ? ORDER BY created_at DESC', [topicId])),
    Promise.resolve(readOne<Record<string, unknown>>(db, 'SELECT * FROM publish_packages WHERE topic_id = ?', [topicId])),
  ]);
  return {
    sources,
    report,
    draft,
    citations,
    publish_package: normalizePublishPackageRecord(publishPackage),
  };
}

export async function loadSourcesByTopic(db: Database, topicId: string): Promise<Source[]> {
  return readAll<Source>(db, 'SELECT * FROM sources WHERE topic_id = ? ORDER BY sort_order ASC, created_at DESC', [topicId]);
}

export function sourceStatement(db: Database, source: Source) {
  return command(db, `INSERT INTO sources (
    id, topic_id, title, content, url, platform, author, published_at,
    verification_status, notes, event_date, date_precision, sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    source.id, source.topic_id, source.title, source.content || '', source.url || '', source.platform || 'bilibili',
    source.author || '', source.published_at || '', source.verification_status || 'unverified', source.notes || '',
    source.event_date ?? '', source.date_precision || 'exact', source.sort_order || 0,
    source.created_at, source.updated_at,
  ]);
}

export async function insertSource(db: Database, source: Source): Promise<void> {
  const { statement, values } = sourceStatement(db, source);
  statement.run(...values);
}

export async function updateSource(db: Database, id: string, body: Record<string, unknown>): Promise<Source | null> {
  const fields = ['title', 'content', 'url', 'platform', 'author', 'published_at', 'verification_status', 'notes', 'event_date', 'date_precision', 'sort_order']
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (fields.length > 0) {
    execute(db, `UPDATE sources SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...fields.map((field) => field === 'event_date' ? body[field] ?? '' : body[field]), new Date().toISOString(), id]);
  }
  return readOne<Source>(db, 'SELECT * FROM sources WHERE id = ?', [id]);
}

export async function reorderSources(db: Database, sources: Array<{ id: string; topic_id: string }>): Promise<string> {
  const now = new Date().toISOString();
  if (sources.length > 0) {
    const sourceIds = sources.map((source) => source.id);
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new SourceReorderInvalidStateError('Duplicate source ids are not allowed');
    }

    db.transaction(() => {
      const placeholders = sourceIds.map(() => '?').join(',');
      const existing = readAll<{ id: string; topic_id: string }>(
        db,
        `SELECT id, topic_id FROM sources WHERE id IN (${placeholders})`,
        sourceIds,
      );

      if (existing.length !== sourceIds.length) {
        throw new SourceReorderInvalidStateError('All sources must exist before reordering');
      }
      const requestedTopicIds = new Set(sources.map((source) => source.topic_id));
      if (requestedTopicIds.size !== 1 || existing.some((source) => source.topic_id !== sources[0]?.topic_id)) {
        throw new SourceReorderInvalidStateError('Sources must belong to the same topic');
      }

      const updateStatement = db.query('UPDATE sources SET sort_order = ?, updated_at = ? WHERE id = ?');
      sources.forEach((source, index) => {
        updateStatement.run(index + 1, now, source.id);
      });
    }).immediate();
  }
  return now;
}

export async function deleteSource(db: Database, id: string): Promise<void> {
  execute(db, 'DELETE FROM sources WHERE id = ?', [id]);
}
