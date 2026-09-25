import type { TopicTodo, TopicTodoBoardLayout, TopicTodoMutationResult, TopicTodoStatus } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';
import { loadTopic } from './topics';

export class TopicTodoNotFoundError extends Error {}
export class TopicTodoInvalidStateError extends Error {}

const TODO_STATUS_ORDER: TopicTodoStatus[] = ['todo', 'in_progress', 'completed'];

function todoRowToRecord(row: TopicTodo): TopicTodo {
  return {
    ...row,
    status: row.status,
    is_current: Number(row.is_current) === 1 ? 1 : 0,
    current_started_at: row.current_started_at || null,
    completed_at: row.completed_at || null,
    sort_order: Number(row.sort_order || 0),
  };
}

async function loadTopicTodoRows(db: SqliteDatabase, topicId: string): Promise<TopicTodo[]> {
  const result = await db.prepare(`SELECT * FROM topic_todos
    WHERE topic_id = ?
    ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      sort_order ASC, created_at ASC`).bind(topicId).all<TopicTodo>();
  return result.results.map(todoRowToRecord);
}

export async function loadTopicTodos(db: SqliteDatabase, topicId: string): Promise<TopicTodo[]> {
  return loadTopicTodoRows(db, topicId);
}

export async function loadAllTopicTodos(db: SqliteDatabase): Promise<TopicTodo[]> {
  const result = await db.prepare(`SELECT * FROM topic_todos
    ORDER BY topic_id ASC,
      CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
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
    WHERE topic_id IN (${placeholders}) AND status = 'in_progress' AND is_current = 1
    ORDER BY topic_id ASC`)
    .bind(...topicIds).all<TopicTodo>();
  return new Map(result.results.map((row) => [row.topic_id, todoRowToRecord(row)]));
}

export function topicTodoStatement(db: SqliteDatabase, todo: TopicTodo): SqlitePreparedStatement {
  return bind(db, `INSERT INTO topic_todos (
    id, topic_id, title, status, is_current, current_started_at,
    completed_at, sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    todo.id, todo.topic_id, todo.title, todo.status,
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
  return todos.find((todo) => todo.status === 'in_progress' && todo.is_current === 1)?.id || null;
}

function boardLayoutFromTodos(todos: TopicTodo[]): TopicTodoBoardLayout {
  const byStatus = Object.fromEntries(TODO_STATUS_ORDER.map((status) => [
    status,
    todos.filter((todo) => todo.status === status)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      .map((todo) => todo.id),
  ])) as Record<TopicTodoStatus, string[]>;
  return {
    todo_ids: byStatus.todo,
    in_progress_ids: byStatus.in_progress,
    completed_ids: byStatus.completed,
  };
}

function validateBoardLayout(todos: TopicTodo[], layout: TopicTodoBoardLayout): void {
  const requestedIds = [...layout.todo_ids, ...layout.in_progress_ids, ...layout.completed_ids];
  const existingIds = new Set(todos.map((todo) => todo.id));
  if (
    requestedIds.length !== existingIds.size
    || new Set(requestedIds).size !== requestedIds.length
    || requestedIds.some((id) => !existingIds.has(id))
  ) {
    throw new TopicTodoInvalidStateError('Todo board layout must include each topic Todo exactly once');
  }
}

async function persistBoardLayout(
  db: SqliteDatabase,
  topicId: string,
  previousTodos: TopicTodo[],
  nextTodos: TopicTodo[],
  layout: TopicTodoBoardLayout,
  now: string,
  extraStatements: SqlitePreparedStatement[] = [],
): Promise<TopicTodoMutationResult> {
  const topic = await loadTopic(db, topicId);
  if (!topic) throw new TopicTodoNotFoundError('Topic not found');
  validateBoardLayout(nextTodos, layout);

  const previousCurrentId = getCurrentTodoId(previousTodos);
  const previousCurrent = previousTodos.find((todo) => todo.id === previousCurrentId);
  const currentId = layout.in_progress_ids[0] || null;
  const currentStartedAt = currentId
    ? currentId === previousCurrentId
      ? previousCurrent?.current_started_at || now
      : now
    : null;
  const nextTodoById = new Map(nextTodos.map((todo) => [todo.id, todo]));
  const orderedColumns: Array<[TopicTodoStatus, string[]]> = [
    ['todo', layout.todo_ids],
    ['in_progress', layout.in_progress_ids],
    ['completed', layout.completed_ids],
  ];

  const statements: SqlitePreparedStatement[] = [
    ...extraStatements,
    bind(db, `UPDATE topic_todos SET is_current = 0, current_started_at = NULL
      WHERE topic_id = ?`, [topicId]),
  ];

  orderedColumns.forEach(([status, ids]) => {
    ids.forEach((id, index) => {
      const todo = nextTodoById.get(id);
      if (!todo) return;
      const isCurrent = status === 'in_progress' && id === currentId;
      const completedAt = status === 'completed' ? (todo.completed_at || now) : null;
      const startedAt = isCurrent
        ? currentId === previousCurrentId ? previousCurrent?.current_started_at || now : currentStartedAt
        : null;
      statements.push(bind(db, `UPDATE topic_todos SET status = ?, is_current = ?,
        current_started_at = ?, completed_at = ?, sort_order = ?, updated_at = ?
        WHERE id = ? AND topic_id = ?`, [
        status,
        isCurrent ? 1 : 0,
        startedAt,
        completedAt,
        index + 1,
        now,
        id,
        topicId,
      ]));
    });
  });
  statements.push(bind(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, topicId]));

  await db.batch(statements);
  return loadMutationResult(db, topicId);
}

export async function updateTopicTodoBoard(
  db: SqliteDatabase,
  topicId: string,
  layout: TopicTodoBoardLayout,
): Promise<TopicTodoMutationResult> {
  const todos = await loadTopicTodoRows(db, topicId);
  return persistBoardLayout(db, topicId, todos, todos, layout, new Date().toISOString());
}

export async function insertTopicTodo(db: SqliteDatabase, todo: TopicTodo): Promise<TopicTodoMutationResult> {
  const existing = await loadTopicTodoRows(db, todo.topic_id);
  const nextTodo: TopicTodo = {
    ...todo,
    status: 'todo',
    is_current: 0,
    current_started_at: null,
    completed_at: null,
  };
  const layout = boardLayoutFromTodos(existing);
  layout.todo_ids = [...layout.todo_ids, nextTodo.id];
  const nextTodos = [...existing, nextTodo];
  return persistBoardLayout(db, todo.topic_id, existing, nextTodos, layout, todo.updated_at, [
    topicTodoStatement(db, nextTodo),
  ]);
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
  if (existing.status === 'completed') throw new TopicTodoInvalidStateError('Completed Todo cannot become current');
  const todos = await loadTopicTodoRows(db, existing.topic_id);
  const layout = boardLayoutFromTodos(todos);
  layout.todo_ids = layout.todo_ids.filter((todoId) => todoId !== id);
  layout.in_progress_ids = [id, ...layout.in_progress_ids.filter((todoId) => todoId !== id)];
  return persistBoardLayout(db, existing.topic_id, todos, todos, layout, new Date().toISOString());
}

export async function completeTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  if (existing.status === 'completed') return loadMutationResult(db, existing.topic_id);
  const todos = await loadTopicTodoRows(db, existing.topic_id);
  const layout = boardLayoutFromTodos(todos);
  layout.todo_ids = layout.todo_ids.filter((todoId) => todoId !== id);
  layout.in_progress_ids = layout.in_progress_ids.filter((todoId) => todoId !== id);
  layout.completed_ids = [...layout.completed_ids, id];
  return persistBoardLayout(db, existing.topic_id, todos, todos, layout, new Date().toISOString());
}

export async function reopenTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  if (existing.status !== 'completed') throw new TopicTodoInvalidStateError('Only completed Todo can be reopened');
  const todos = await loadTopicTodoRows(db, existing.topic_id);
  const layout = boardLayoutFromTodos(todos);
  layout.completed_ids = layout.completed_ids.filter((todoId) => todoId !== id);
  layout.todo_ids = [...layout.todo_ids, id];
  return persistBoardLayout(db, existing.topic_id, todos, todos, layout, new Date().toISOString());
}

export async function deleteTopicTodo(db: SqliteDatabase, id: string): Promise<TopicTodoMutationResult> {
  const existing = await loadTodo(db, id);
  if (!existing) throw new TopicTodoNotFoundError('Todo not found');
  const todos = await loadTopicTodoRows(db, existing.topic_id);
  const nextTodos = todos.filter((todo) => todo.id !== id);
  const layout = boardLayoutFromTodos(nextTodos);
  return persistBoardLayout(db, existing.topic_id, todos, nextTodos, layout, new Date().toISOString(), [
    bind(db, 'DELETE FROM topic_todos WHERE id = ?', [id]),
  ]);
}
