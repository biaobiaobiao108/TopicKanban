import type { PageMeta, PaginatedTags, Tag } from '../../types';
import type { SqliteDatabase } from '../sqlite';
import { bind, escapeLike } from './shared';

interface PageOptions {
  page: number;
  pageSize: number;
  query?: string;
}

export async function loadTagsPage(db: SqliteDatabase, options: PageOptions): Promise<PaginatedTags> {
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

export async function listTags(db: SqliteDatabase): Promise<Tag[]> {
  const result = await db.prepare('SELECT id, name, color FROM tags ORDER BY name ASC').all<Tag>();
  return result.results;
}

export async function insertTag(db: SqliteDatabase, tag: Tag): Promise<Tag | null> {
  const existing = await db.prepare('SELECT id, name, color FROM tags WHERE name = ? COLLATE NOCASE')
    .bind(tag.name).first<Tag>();
  if (existing) return existing;
  await bind(db, 'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)',
    [tag.id, tag.name, tag.color, new Date().toISOString()]).run();
  return null;
}

export async function updateTag(
  db: SqliteDatabase,
  id: string,
  body: Record<string, unknown>
): Promise<Tag | 'duplicate' | null> {
  const existing = await db.prepare('SELECT id, name, color FROM tags WHERE name = ? COLLATE NOCASE')
    .bind(body.name).first<{ id: string; name: string; color: string }>();
  if (existing && existing.id !== id) return 'duplicate';
  await bind(db, 'UPDATE tags SET name = ?, color = ? WHERE id = ?', [body.name, body.color, id]).run();
  return db.prepare('SELECT id, name, color FROM tags WHERE id = ?').bind(id).first<Tag>();
}

export async function deleteTag(db: SqliteDatabase, id: string): Promise<void> {
  await db.batch([
    bind(db, 'DELETE FROM topic_tags WHERE tag_id = ?', [id]),
    bind(db, 'DELETE FROM tags WHERE id = ?', [id]),
  ]);
}
