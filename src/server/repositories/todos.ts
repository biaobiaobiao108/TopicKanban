import type { TopicTodo, TopicTodoMutationResult } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';
import { loadTopic } from './topics';

export class TopicTodoNotFoundError extends Error {}
export class TopicTodoInvalidStateError extends Error {}

function todoRowToRecord(row: TopicTodo): TopicTodo {
  return {
    ...row,
    is_current: Number(row.is_current) === 1 ? 1 : 0,
    current_started_at: row.current_started_at || null,
    completed_at: row.completed_at || null,
    sort_order: Number(row.sort_order || 0),
  };
}

async function loadTopicTodoRows(db: SqliteDatabase, topicId: string): Promise<TopicTodo[]> {
  const result = await db.prepare(`SELECT * FROM topic_todos
    WHERE topic_id = ?
    ORDER BY CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END,
      sort_order ASC, created_at ASC`).bind(topicId).all<TopicTodo>();
  return result.results.map(todoRowToRecord);
}

export async function loadTopicTodos(db: SqliteDatabase, topicId: string): Promise<TopicTodo[]> {
  return loadTopicTodoRows(db, topicId);
}

export async function loadAllTopicTodos(db: SqliteDatabase): Promise<TopicTodo[]> {
  const result = await db.prepare(`SELECT * FROM topic_todos
    ORDER BY topic_id ASC,
      CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END,
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
    WHERE topic_id IN (${placeholders}) AND completed_at IS NULL
    ORDER BY topic_id ASC, sort_order ASC, created_at ASC`)
    .bind(...topicIds).all<TopicTodo>();
  const currentByTopic = new Map<string, TopicTodo>();
  result.results.forEach((row) => {
    if (!currentByTopic.has(row.topic_id)) currentByTopic.set(row.topic_id, todoRowToRecord(row));
  });
  return currentByTopic;
}

export function topicTodoStatement(db: SqliteDatabase, todo: TopicTodo): SqlitePreparedStatement {
  return bind(db, `INSERT INTO topic_todos (
    id, topic_id, title, is_current, current_started_at,
    completed_at, sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    todo.id, todo.topic_id, todo.title,
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

function getCurrentTodoId(todos: TopicTodo[]): string | null {
  return todos.find((todo) => !todo.completed_at)?.id || null;
}

function normalizeOrder(todos: TopicTodo[], requestedIds?: string[]): string[] {
  const todoById = new Map(todos.map((todo) => [todo.id, todo]));
  const sourceIds = requestedIds || todos.map((todo) => todo.id);
  const seen = new Set<string>();
  const ordered = sourceIds.filter((id) => {
    if (!todoById.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const missing = todos.map((todo) => todo.id).filter((id) => !seen.has(id));
  const allIds = [...ordered, ...missing];
  return [
    ...allIds.filter((id) => !todoById.get(id)?.completed_at),
    ...allIds.filter((id) => Boolean(todoById.get(id)?.completed_at)),
  ];
}

function buildTodoOrderStatements(
  db: SqliteDatabase,
  topicId: string,
  todos: TopicTodo[],
  requestedIds: string[],
  previousCurrentId: string | null,
  now: string,
): SqlitePreparedStatement[] {
  const orderedIds = normalizeOrder(todos, requestedIds);
  const todoById = new Map(todos.map((todo) => [todo.id, todo]));
  const firstPendingId = orderedIds.find((id) => !todoById.get(id)?.completed_at) || null;
  const previousCurrent = previousCurrentId ? todoById.get(previousCurrentId) : undefined;
  const currentStartedAt = firstPendingId
    ? firstPendingId === previousCurrentId
      ? previousCurrent?.current_started_at || now
      : now
    : null;

  return [
    bind(db, `UPDATE topic_todos SET is_current = 0, current_started_at = NULL
      WHERE topic_id = ? AND completed_at IS NULL`, [topicId]),
    ...orderedIds.map((id, index) => {
      const isCurrent = id === firstPendingId;
      return bind(db, `UPDATE topic_todos SET sort_order = ?, is_current = ?,
        current_started_at = ?, updated_at = ? WHERE id = ? AND topic_id = ?`, [
        index + 1,
        isCurrent ? 1 : 0,
        isCurrent ? currentStartedAt : null,
        now,
        id,
        topicId,
      ]);
    }),
    bind(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, topicId]),
  ];
}

export async function getNextTodoSortOrder(db: SqliteDatabase, topicId: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM topic_todos WHERE topic_id = ?')
    .bind(topicId).first<{ value: number }>();
  return Number(row?.value || 0) + 1;
}

export async function insertTopicTodo(db: SqliteDatabase, todo: TopicTodo): Promise<TopicTodoMutationResult> {
  const existing = await loadTopicTodoRows(db, todo.topic_id);
  const previousCurrentId = getCurrentTodoId(existing);
  const allTodos = [...existing, { ...todo, is_current: 0, current_started_at: null }];
  const orderedIds = normalizeOrder(allTodos);
  await db.batch([
    topicTodoStatement(db, { ...todo, is_current: 0, current_started_at: null }),
    ...buildTodoOrderStatements(db, todo.topic_id, allTodos, orderedIds, previousCurrentId, todo.updated_at),
  ]);
  return loadMutationResult(db, todo.topic_id);
}

export async function updateTopicTodo(
  db: SqliteDatabase,
  id: string,
  body: Pick<Partial<TopicTodo>, 'title'>
): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  const fields = ['title'].filter((field) => Object.prototype.hasOwnProperty.call(body, field));
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
  const todos = await loadTopicTodoRows(db, existing.topic_id);
  const now = new Date().toISOString();
  const previousCurrentId = getCurrentTodoId(todos);
  const requestedIds = [id, ...todos.filter((todo) => todo.id !== id).map((todo) => todo.id)];
  await db.batch(buildTodoOrderStatements(db, existing.topic_id, todos, requestedIds, previousCurrentId, now));
  return loadMutationResult(db, existing.topic_id);
}

export async function completeTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  if (existing.completed_at) return loadMutationResult(db, existing.topic_id);
  const todos = await loadTopicTodoRows(db, existing.topic_id);
  const previousCurrentId = getCurrentTodoId(todos);
  const remaining = todos.filter((todo) => todo.id !== id);
  const now = new Date().toISOString();
  await db.batch([
    bind(db, `UPDATE topic_todos SET completed_at = ?, is_current = 0,
      current_started_at = NULL, updated_at = ? WHERE id = ?`, [now, now, id]),
    ...buildTodoOrderStatements(db, existing.topic_id, remaining, remaining.map((todo) => todo.id), previousCurrentId, now),
  ]);
  return loadMutationResult(db, existing.topic_id);
}

export async function reopenTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  if (!existing.completed_at) throw new TopicTodoInvalidStateError('Pending Todo cannot be reopened');
  const todos = await loadTopicTodoRows(db, existing.topic_id);
  const previousCurrentId = getCurrentTodoId(todos);
  const reopened = todos.map((todo) => todo.id === id
    ? { ...todo, completed_at: null, is_current: 0, current_started_at: null }
    : todo);
  const now = new Date().toISOString();
  await db.batch([
    bind(db, 'UPDATE topic_todos SET completed_at = NULL, is_current = 0, current_started_at = NULL, updated_at = ? WHERE id = ?', [now, id]),
    ...buildTodoOrderStatements(db, existing.topic_id, reopened, reopened.map((todo) => todo.id), previousCurrentId, now),
  ]);
  return loadMutationResult(db, existing.topic_id);
}

export async function deleteTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  const todos = await loadTopicTodoRows(db, existing.topic_id);
  const previousCurrentId = getCurrentTodoId(todos);
  const remaining = todos.filter((todo) => todo.id !== id);
  const now = new Date().toISOString();
  await db.batch([
    bind(db, 'DELETE FROM topic_todos WHERE id = ?', [id]),
    ...buildTodoOrderStatements(db, existing.topic_id, remaining, remaining.map((todo) => todo.id), previousCurrentId, now),
  ]);
  return loadMutationResult(db, existing.topic_id);
}

export async function reorderTopicTodos(
  db: SqliteDatabase,
  topicId: string,
  ids: string[]
): Promise<TopicTodoMutationResult> {
  const existing = await loadTopicTodoRows(db, topicId);
  const existingIds = new Set(existing.map((todo) => todo.id));
  if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id)) || new Set(ids).size !== ids.length) {
    throw new TopicTodoInvalidStateError('Todo order does not match the topic Todo list');
  }
  const now = new Date().toISOString();
  await db.batch(buildTodoOrderStatements(db, topicId, existing, ids, getCurrentTodoId(existing), now));
  return loadMutationResult(db, topicId);
}
