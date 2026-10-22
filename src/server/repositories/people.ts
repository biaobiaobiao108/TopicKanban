import type { Database } from 'bun:sqlite';
import type { PaginatedPeople, Person, PersonRelationship } from '../../types';
import { command, execute, executeTransaction, readAll, readOne, readTransaction, type SqlCommand } from './shared';

interface PageOptions {
  page: number;
  pageSize: number;
  query?: string;
}

export async function loadPeoplePage(db: Database, options: PageOptions): Promise<PaginatedPeople> {
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
  const [countRows, itemRows] = readTransaction(db, [
    command(db, `SELECT COUNT(*) AS count FROM people p ${where}`, values),
    command(
      db,
      `SELECT p.*,
      (SELECT COUNT(*) FROM topic_people tp
        INNER JOIN topics rt ON rt.id = tp.topic_id AND rt.deleted_at IS NULL
        WHERE tp.person_id = p.id) AS related_topics_count
      FROM people p ${where}
      ORDER BY p.updated_at DESC, p.id DESC LIMIT ? OFFSET ?`,
      [...values, options.pageSize, offset],
    ),
  ]);
  const items = itemRows as Array<Person & { related_topic_previews?: Array<{ id: string; title: string }> }>;
  if (items.length > 0) {
    const ids = items.map(person => person.id);
    const placeholders = ids.map(() => '?').join(',');
    const previewRows = readAll<{ person_id: string; id: string; title: string }>(
      db,
      `SELECT tp.person_id, t.id, t.title
      FROM topic_people tp INNER JOIN topics t ON t.id = tp.topic_id
      WHERE tp.person_id IN (${placeholders}) AND t.deleted_at IS NULL
      ORDER BY t.updated_at DESC, t.id DESC`,
      ids,
    );
    const previewsByPerson = new Map<string, Array<{ id: string; title: string }>>();
    previewRows.forEach(preview => {
      const current = previewsByPerson.get(preview.person_id) || [];
      if (current.length < 2)
        previewsByPerson.set(preview.person_id, [...current, { id: preview.id, title: preview.title }]);
    });
    items.forEach(person => {
      person.related_topic_previews = previewsByPerson.get(person.id) || [];
    });
  }
  const total = Number((countRows[0] as { count?: number } | undefined)?.count || 0);
  return {
    items,
    page: options.page,
    page_size: options.pageSize,
    total,
    total_pages: Math.ceil(total / options.pageSize),
  };
}

export function personStatement(db: Database, person: Person): SqlCommand {
  return command(
    db,
    `INSERT INTO people (
    id, name, aliases, avatar_url, description, identity, platform_accounts, quotes, notes, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      person.id,
      person.name,
      person.aliases,
      person.avatar_url,
      person.description,
      person.identity,
      person.platform_accounts,
      person.quotes,
      person.notes,
      person.created_at,
      person.updated_at,
    ],
  );
}

export function relationshipStatement(db: Database, relationship: PersonRelationship): SqlCommand {
  return command(
    db,
    `INSERT INTO person_relationships (
    id, person_a_id, person_b_id, relationship, description, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      relationship.id,
      relationship.person_a_id,
      relationship.person_b_id,
      relationship.relationship,
      relationship.description,
      relationship.created_at,
    ],
  );
}

export async function listPeopleOptions(db: Database): Promise<Array<{ id: string; name: string }>> {
  return readAll<{ id: string; name: string }>(
    db,
    'SELECT id, name FROM people ORDER BY name COLLATE NOCASE ASC, id ASC',
  );
}

export async function insertPerson(db: Database, person: Person): Promise<void> {
  executeTransaction(db, [personStatement(db, person)]);
}

export async function updatePerson(db: Database, id: string, body: Record<string, unknown>): Promise<Person | null> {
  const fields = [
    'name',
    'aliases',
    'avatar_url',
    'description',
    'identity',
    'platform_accounts',
    'quotes',
    'notes',
  ].filter(field => Object.prototype.hasOwnProperty.call(body, field));
  if (fields.length > 0) {
    execute(db, `UPDATE people SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [
      ...fields.map(field => body[field]),
      new Date().toISOString(),
      id,
    ]);
  }
  return readOne<Person>(db, 'SELECT * FROM people WHERE id = ?', [id]);
}

export async function deletePerson(db: Database, id: string): Promise<void> {
  executeTransaction(db, [
    command(db, 'DELETE FROM topic_people WHERE person_id = ?', [id]),
    command(db, 'DELETE FROM person_relationships WHERE person_a_id = ? OR person_b_id = ?', [id, id]),
    command(db, 'DELETE FROM people WHERE id = ?', [id]),
  ]);
}

export async function loadRelationship(db: Database, id: string): Promise<PersonRelationship | null> {
  return readOne<PersonRelationship>(
    db,
    `SELECT r.*, a.name AS person_a_name, b.name AS person_b_name
    FROM person_relationships r
    LEFT JOIN people a ON a.id = r.person_a_id
    LEFT JOIN people b ON b.id = r.person_b_id
    WHERE r.id = ?`,
    [id],
  );
}

export async function insertRelationship(db: Database, relationship: PersonRelationship): Promise<void> {
  executeTransaction(db, [relationshipStatement(db, relationship)]);
}

export async function updateRelationship(
  db: Database,
  id: string,
  body: Record<string, unknown>,
): Promise<PersonRelationship | null> {
  const fields = ['person_a_id', 'person_b_id', 'relationship', 'description'].filter(field =>
    Object.prototype.hasOwnProperty.call(body, field),
  );
  if (fields.length > 0) {
    execute(db, `UPDATE person_relationships SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`, [
      ...fields.map(field => body[field]),
      id,
    ]);
  }
  return loadRelationship(db, id);
}

export async function deleteRelationship(db: Database, id: string): Promise<void> {
  execute(db, 'DELETE FROM person_relationships WHERE id = ?', [id]);
}
