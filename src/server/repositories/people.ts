import type { PageMeta, PaginatedPeople, Person, PersonRelationship } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind, escapeLike } from './shared';

interface PageOptions {
  page: number;
  pageSize: number;
  query?: string;
}

export async function loadPeoplePage(db: SqliteDatabase, options: PageOptions): Promise<PaginatedPeople> {
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

export function personStatement(db: SqliteDatabase, person: Person): SqlitePreparedStatement {
  return bind(db, `INSERT INTO people (
    id, name, aliases, avatar_url, description, identity, platform_accounts, quotes, notes, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    person.id, person.name, person.aliases, person.avatar_url, person.description, person.identity,
    person.platform_accounts, person.quotes, person.notes, person.created_at, person.updated_at,
  ]);
}

export function relationshipStatement(db: SqliteDatabase, relationship: PersonRelationship): SqlitePreparedStatement {
  return bind(db, `INSERT INTO person_relationships (
    id, person_a_id, person_b_id, relationship, description, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)`, [
    relationship.id, relationship.person_a_id, relationship.person_b_id,
    relationship.relationship, relationship.description, relationship.created_at,
  ]);
}

export async function listPeopleOptions(db: SqliteDatabase): Promise<Array<{ id: string; name: string }>> {
  const result = await db.prepare('SELECT id, name FROM people ORDER BY name COLLATE NOCASE ASC, id ASC')
    .all<{ id: string; name: string }>();
  return result.results;
}

export async function insertPerson(db: SqliteDatabase, person: Person): Promise<void> {
  await personStatement(db, person).run();
}

export async function updatePerson(db: SqliteDatabase, id: string, body: Record<string, unknown>): Promise<Person | null> {
  const fields = ['name', 'aliases', 'avatar_url', 'description', 'identity', 'platform_accounts', 'quotes', 'notes']
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (fields.length > 0) {
    await bind(db, `UPDATE people SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...fields.map((field) => body[field]), new Date().toISOString(), id]).run();
  }
  return db.prepare('SELECT * FROM people WHERE id = ?').bind(id).first<Person>();
}

export async function deletePerson(db: SqliteDatabase, id: string): Promise<void> {
  await db.batch([
    bind(db, 'DELETE FROM topic_people WHERE person_id = ?', [id]),
    bind(db, 'DELETE FROM person_relationships WHERE person_a_id = ? OR person_b_id = ?', [id, id]),
    bind(db, 'DELETE FROM people WHERE id = ?', [id]),
  ]);
}

export async function loadRelationship(db: SqliteDatabase, id: string): Promise<PersonRelationship | null> {
  return db.prepare(`SELECT r.*, a.name AS person_a_name, b.name AS person_b_name
    FROM person_relationships r
    LEFT JOIN people a ON a.id = r.person_a_id
    LEFT JOIN people b ON b.id = r.person_b_id
    WHERE r.id = ?`).bind(id).first<PersonRelationship>();
}

export async function insertRelationship(db: SqliteDatabase, relationship: PersonRelationship): Promise<void> {
  await relationshipStatement(db, relationship).run();
}

export async function updateRelationship(db: SqliteDatabase, id: string, body: Record<string, unknown>): Promise<PersonRelationship | null> {
  const fields = ['person_a_id', 'person_b_id', 'relationship', 'description']
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (fields.length > 0) {
    await bind(db, `UPDATE person_relationships SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map((field) => body[field]), id]).run();
  }
  return loadRelationship(db, id);
}

export async function deleteRelationship(db: SqliteDatabase, id: string): Promise<void> {
  await bind(db, 'DELETE FROM person_relationships WHERE id = ?', [id]).run();
}
