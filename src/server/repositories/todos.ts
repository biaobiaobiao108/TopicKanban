import type { Topic, TopicTodo, TopicTodoMutationResult } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';
import { loadTopic } from './topics';

export class TopicTodoNotFoundError extends Error {}
export class TopicTodoInvalidStateError extends Error {}

function todoRowToRecord(row: TopicTodo): TopicTodo {
  return {
    ...row,
    is_current: Number(row.is_current) === 1 ? 1 : 0,
    notes: row.notes || '',
    due_date: row.due_date || null,
    current_started_at: row.current_started_at || null,
    completed_at: row.completed_at || null,
    sort_order: Number(row.sort_order || 0),
  };
}

export async function loadTopicTodos(db: SqliteDatabase, topicId: string): Promise<TopicTodo[]> {
  const result = await db.prepare(`SELECT * FROM topic_todos
    WHERE topic_id = ?
    ORDER BY CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END,
      CASE WHEN is_current = 1 AND completed_at IS NULL THEN 0 ELSE 1 END,
      sort_order ASC, created_at ASC`).bind(topicId).all<TopicTodo>();
  return result.results.map(todoRowToRecord);
}

export async function loadAllTopicTodos(db: SqliteDatabase): Promise<TopicTodo[]> {
  const result = await db.prepare(`SELECT * FROM topic_todos
    ORDER BY topic_id ASC,
      CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END,
      CASE WHEN is_current = 1 AND completed_at IS NULL THEN 0 ELSE 1 END,
      sort_order ASC, created_at ASC`).all<TopicTodo>();
  return result.results.map(todoRowToRecord);
}

export async function loadCurrentTodosByTopicIds(
  db: SqliteDatabase,
  topicIds: string[]
): Promise<Map<string, TopicTodo>> {
  if (topicIds.length === 0) return new Map();
  const placeholders = topicIds.map(() => '?').join(',');
  const result = await db.prepare(`SELECT * FROM topic_todos
    WHERE topic_id IN (${placeholders}) AND is_current = 1 AND completed_at IS NULL`)
    .bind(...topicIds).all<TopicTodo>();
  return new Map(result.results.map((todo) => [todo.topic_id, todoRowToRecord(todo)]));
}

export function topicTodoStatement(db: SqliteDatabase, todo: TopicTodo): SqlitePreparedStatement {
  return bind(db, `INSERT INTO topic_todos (
    id, topic_id, title, notes, due_date, is_current, current_started_at,
    completed_at, sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    todo.id, todo.topic_id, todo.title, todo.notes, todo.due_date ?? null,
    todo.is_current, todo.current_started_at ?? null, todo.completed_at ?? null,
    todo.sort_order, todo.created_at, todo.updated_at,
  ]);
}

async function loadTodo(db: SqliteDatabase, id: string): Promise<TopicTodo | null> {
  const row = await db.prepare('SELECT * FROM topic_todos WHERE id = ?').bind(id).first<TopicTodo>();
  return row ? todoRowToRecord(row) : null;
}

async function loadMutationResult(db: SqliteDatabase, topicId: string): Promise<TopicTodoMutationResult> {
  const [topic, todos] = await Promise.all([loadTopic(db, topicId), loadTopicTodos(db, topicId)]);
  if (!topic) throw new TopicTodoNotFoundError('Topic not found');
  return { topic, todos };
}

async function nextPendingTodoId(db: SqliteDatabase, topicId: string, excludeId?: string): Promise<string | null> {
  const row = await db.prepare(`SELECT id FROM topic_todos
    WHERE topic_id = ? AND completed_at IS NULL ${excludeId ? 'AND id != ?' : ''}
    ORDER BY sort_order ASC, created_at ASC LIMIT 1`).bind(...(excludeId ? [topicId, excludeId] : [topicId])).first<{ id: string }>();
  return row?.id || null;
}

export async function getNextTodoSortOrder(db: SqliteDatabase, topicId: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM topic_todos WHERE topic_id = ?')
    .bind(topicId).first<{ value: number }>();
  return Number(row?.value || 0) + 1;
}

export async function insertTopicTodo(db: SqliteDatabase, todo: TopicTodo): Promise<TopicTodoMutationResult> {
  await db.batch([
    topicTodoStatement(db, todo),
    bind(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [todo.updated_at, todo.topic_id]),
  ]);
  return loadMutationResult(db, todo.topic_id);
}

export async function updateTopicTodo(
  db: SqliteDatabase,
  id: string,
  body: Pick<Partial<TopicTodo>, 'title' | 'notes' | 'due_date'>
): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  const fields = ['title', 'notes', 'due_date'].filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  const now = new Date().toISOString();
  const statements: SqlitePreparedStatement[] = [];
  if (fields.length > 0) {
    statements.push(bind(db, `UPDATE topic_todos SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [
      ...fields.map((field) => body[field as keyof typeof body]), now, id,
    ]));
  }
  statements.push(bind(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, existing.topic_id]));
  await db.batch(statements);
  return loadMutationResult(db, existing.topic_id);
}

export async function setCurrentTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  if (existing.completed_at) throw new TopicTodoInvalidStateError('Completed Todo cannot become current');
  const now = new Date().toISOString();
  await db.batch([
    bind(db, `UPDATE topic_todos SET is_current = 0, current_started_at = NULL, updated_at = ?
      WHERE topic_id = ? AND completed_at IS NULL`, [now, existing.topic_id]),
    bind(db, `UPDATE topic_todos SET is_current = 1, current_started_at = ?, updated_at = ?
      WHERE id = ? AND completed_at IS NULL`, [now, now, id]),
    bind(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, existing.topic_id]),
  ]);
  return loadMutationResult(db, existing.topic_id);
}

export async function completeTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  if (existing.completed_at) return loadMutationResult(db, existing.topic_id);
  const now = new Date().toISOString();
  const nextId = existing.is_current === 1 ? await nextPendingTodoId(db, existing.topic_id, existing.id) : null;
  await db.batch([
    bind(db, `UPDATE topic_todos SET completed_at = ?, is_current = 0,
      current_started_at = NULL, updated_at = ? WHERE id = ?`, [now, now, id]),
    ...(nextId ? [bind(db, `UPDATE topic_todos SET is_current = 1, current_started_at = ?, updated_at = ?
      WHERE id = ? AND completed_at IS NULL`, [now, now, nextId])] : []),
    bind(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, existing.topic_id]),
  ]);
  return loadMutationResult(db, existing.topic_id);
}

export async function reopenTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  if (!existing.completed_at) throw new TopicTodoInvalidStateError('Pending Todo cannot be reopened');
  const now = new Date().toISOString();
  await db.batch([
    bind(db, 'UPDATE topic_todos SET completed_at = NULL, is_current = 0, current_started_at = NULL, updated_at = ? WHERE id = ?', [now, id]),
    bind(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, existing.topic_id]),
  ]);
  return loadMutationResult(db, existing.topic_id);
}

export async function deleteTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  const now = new Date().toISOString();
  const nextId = existing.is_current === 1 ? await nextPendingTodoId(db, existing.topic_id, existing.id) : null;
  await db.batch([
    bind(db, 'DELETE FROM topic_todos WHERE id = ?', [id]),
    ...(nextId ? [bind(db, `UPDATE topic_todos SET is_current = 1, current_started_at = ?, updated_at = ?
      WHERE id = ? AND completed_at IS NULL`, [now, now, nextId])] : []),
    bind(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, existing.topic_id]),
  ]);
  return loadMutationResult(db, existing.topic_id);
}

export async function reorderTopicTodos(
  db: SqliteDatabase,
  topicId: string,
  ids: string[]
): Promise<TopicTodoMutationResult> {
  const existing = await loadTopicTodos(db, topicId);
  const existingIds = new Set(existing.filter((todo) => !todo.completed_at).map((todo) => todo.id));
  if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id)) || new Set(ids).size !== ids.length) {
    throw new TopicTodoInvalidStateError('Todo order does not match the topic pending list');
  }
  const now = new Date().toISOString();
  await db.batch([
    ...ids.map((id, index) => bind(db, 'UPDATE topic_todos SET sort_order = ?, updated_at = ? WHERE id = ? AND topic_id = ?', [index + 1, now, id, topicId])),
    bind(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, topicId]),
  ]);
  return loadMutationResult(db, topicId);
}
