import type { Database } from 'bun:sqlite';
import type { PaginatedTags, Tag } from '../../types';
import { command, execute, executeTransaction, readAll, readOne, readTransaction } from './shared';

interface PageOptions {
  page: number;
  pageSize: number;
  query?: string;
}

export async function loadTagsPage(db: Database, options: PageOptions): Promise<PaginatedTags> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.query?.trim()) {
    const pattern = `%${options.query.trim().replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push("tg.name LIKE ? ESCAPE '\\'");
    values.push(pattern);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (options.page - 1) * options.pageSize;
  const [countRows, summaryRows, tagRows] = readTransaction(db, [
    command(db, `SELECT COUNT(*) AS count FROM tags tg ${where}`, values),
    command(db, `SELECT
      COUNT(DISTINCT CASE WHEN t.deleted_at IS NULL THEN t.id END) AS tagged_topics,
      (SELECT COUNT(*) FROM topics WHERE deleted_at IS NULL) AS total_topics
      FROM topic_tags tt
      INNER JOIN topics t ON t.id = tt.topic_id`),
    command(db, `SELECT tg.id, tg.name, tg.color,
      COUNT(DISTINCT CASE WHEN t.deleted_at IS NULL THEN t.id END) AS tag_count,
      COUNT(DISTINCT CASE WHEN t.deleted_at IS NULL AND t.status IN ('scripting', 'production') THEN t.id END) AS in_progress_count,
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
  const rows = tagRows as Array<Tag & {
    tag_count?: number;
    in_progress_count?: number;
    published_count?: number;
    words_total?: number;
    avg_score?: number;
  }>;
  const total = Number((countRows[0] as { count?: number } | undefined)?.count || 0);
  const summaryRow = summaryRows[0] as { tagged_topics?: number; total_topics?: number } | undefined;
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

export async function listTags(db: Database): Promise<Tag[]> {
  return readAll<Tag>(db, 'SELECT id, name, color FROM tags ORDER BY name ASC');
}

export async function insertTag(db: Database, tag: Tag): Promise<Tag | null> {
  const existing = readOne<Tag>(db, 'SELECT id, name, color FROM tags WHERE name = ? COLLATE NOCASE', [tag.name]);
  if (existing) return existing;
  execute(db, 'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)',
    [tag.id, tag.name, tag.color, new Date().toISOString()]);
  return null;
}

export async function updateTag(
  db: Database,
  id: string,
  body: Record<string, unknown>
): Promise<Tag | 'duplicate' | null> {
  const existing = readOne<{ id: string; name: string; color: string }>(
    db,
    'SELECT id, name, color FROM tags WHERE name = ? COLLATE NOCASE',
    [body.name],
  );
  if (existing && existing.id !== id) return 'duplicate';
  const fields = ['name'];
  const values: unknown[] = [body.name];
  if (Object.prototype.hasOwnProperty.call(body, 'color')) {
    fields.push('color');
    values.push(body.color);
  }
  execute(db, `UPDATE tags SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`, [...values, id]);
  return readOne<Tag>(db, 'SELECT id, name, color FROM tags WHERE id = ?', [id]);
}

export async function deleteTag(db: Database, id: string): Promise<void> {
  executeTransaction(db, [
    command(db, 'DELETE FROM topic_tags WHERE tag_id = ?', [id]),
    command(db, 'DELETE FROM tags WHERE id = ?', [id]),
  ]);
}
