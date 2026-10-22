import type { TopicTodo, TopicTodoBoardLayout, TopicTodoMutationResult, TopicTodoStatus } from '../../types';
import type { Database } from 'bun:sqlite';
import { command, execute, readAll, readOne, type SqlCommand } from './shared';
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

function loadTopicTodoRows(db: Database, topicId: string): TopicTodo[] {
  const result = readAll<TopicTodo>(
    db,
    `SELECT * FROM topic_todos
    WHERE topic_id = ?
    ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      sort_order ASC, created_at ASC`,
    [topicId],
  );
  return result.map(todoRowToRecord);
}

export async function loadTopicTodos(db: Database, topicId: string): Promise<TopicTodo[]> {
  return loadTopicTodoRows(db, topicId);
}

export async function loadAllTopicTodos(db: Database): Promise<TopicTodo[]> {
  const result = readAll<TopicTodo>(
    db,
    `SELECT * FROM topic_todos
    ORDER BY topic_id ASC,
      CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      sort_order ASC, created_at ASC`,
  );
  return result.map(todoRowToRecord);
}

export async function loadCurrentTodosByTopicIds(db: Database, topicIds: string[]): Promise<Map<string, TopicTodo>> {
  if (topicIds.length === 0) return new Map();
  const placeholders = topicIds.map(() => '?').join(',');
  const result = readAll<TopicTodo>(
    db,
    `SELECT * FROM topic_todos
    WHERE topic_id IN (${placeholders}) AND status = 'in_progress' AND is_current = 1
    ORDER BY topic_id ASC`,
    topicIds,
  );
  return new Map(result.map(row => [row.topic_id, todoRowToRecord(row)]));
}

export function topicTodoStatement(db: Database, todo: TopicTodo): SqlCommand {
  return command(
    db,
    `INSERT INTO topic_todos (
    id, topic_id, title, status, is_current, current_started_at,
    completed_at, sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      todo.id,
      todo.topic_id,
      todo.title,
      todo.status,
      todo.is_current,
      todo.current_started_at ?? null,
      todo.completed_at ?? null,
      todo.sort_order,
      todo.created_at,
      todo.updated_at,
    ],
  );
}

function loadTodo(db: Database, id: string): TopicTodo | null {
  const row = readOne<TopicTodo>(db, 'SELECT * FROM topic_todos WHERE id = ?', [id]);
  return row ? todoRowToRecord(row) : null;
}

async function loadMutationResult(db: Database, topicId: string): Promise<TopicTodoMutationResult> {
  const [topic, todos] = await Promise.all([loadTopic(db, topicId), loadTopicTodos(db, topicId)]);
  if (!topic) throw new TopicTodoNotFoundError('Topic not found');
  return { topic, todos };
}

function getCurrentTodoId(todos: TopicTodo[]): string | null {
  return todos.find(todo => todo.status === 'in_progress' && todo.is_current === 1)?.id || null;
}

function boardLayoutFromTodos(todos: TopicTodo[]): TopicTodoBoardLayout {
  const byStatus = Object.fromEntries(
    TODO_STATUS_ORDER.map(status => [
      status,
      todos
        .filter(todo => todo.status === status)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
        .map(todo => todo.id),
    ]),
  ) as Record<TopicTodoStatus, string[]>;
  return {
    todo_ids: byStatus.todo,
    in_progress_ids: byStatus.in_progress,
    completed_ids: byStatus.completed,
  };
}

function validateBoardLayout(todos: TopicTodo[], layout: TopicTodoBoardLayout): void {
  const requestedIds = [...layout.todo_ids, ...layout.in_progress_ids, ...layout.completed_ids];
  const existingIds = new Set(todos.map(todo => todo.id));
  if (
    requestedIds.length !== existingIds.size ||
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some(id => !existingIds.has(id))
  ) {
    throw new TopicTodoInvalidStateError('Todo board layout must include each topic Todo exactly once');
  }
}

function persistBoardLayout(
  db: Database,
  topicId: string,
  previousTodos: TopicTodo[],
  nextTodos: TopicTodo[],
  layout: TopicTodoBoardLayout,
  now: string,
  extraStatements: SqlCommand[] = [],
): void {
  const topic = readOne<{ id: string }>(db, 'SELECT id FROM topics WHERE id = ?', [topicId]);
  if (!topic) throw new TopicTodoNotFoundError('Topic not found');
  validateBoardLayout(nextTodos, layout);

  const previousCurrentId = getCurrentTodoId(previousTodos);
  const previousCurrent = previousTodos.find(todo => todo.id === previousCurrentId);
  const currentId = layout.in_progress_ids[0] || null;
  const currentStartedAt = currentId
    ? currentId === previousCurrentId
      ? previousCurrent?.current_started_at || now
      : now
    : null;
  const nextTodoById = new Map(nextTodos.map(todo => [todo.id, todo]));
  const orderedColumns: Array<[TopicTodoStatus, string[]]> = [
    ['todo', layout.todo_ids],
    ['in_progress', layout.in_progress_ids],
    ['completed', layout.completed_ids],
  ];

  const statements: SqlCommand[] = [
    ...extraStatements,
    command(
      db,
      `UPDATE topic_todos SET is_current = 0, current_started_at = NULL
      WHERE topic_id = ?`,
      [topicId],
    ),
  ];

  orderedColumns.forEach(([status, ids]) => {
    ids.forEach((id, index) => {
      const todo = nextTodoById.get(id);
      if (!todo) return;
      const isCurrent = status === 'in_progress' && id === currentId;
      const completedAt = status === 'completed' ? todo.completed_at || now : null;
      const startedAt = isCurrent
        ? currentId === previousCurrentId
          ? previousCurrent?.current_started_at || now
          : currentStartedAt
        : null;
      statements.push(
        command(
          db,
          `UPDATE topic_todos SET status = ?, is_current = ?,
        current_started_at = ?, completed_at = ?, sort_order = ?, updated_at = ?
        WHERE id = ? AND topic_id = ?`,
          [status, isCurrent ? 1 : 0, startedAt, completedAt, index + 1, now, id, topicId],
        ),
      );
    });
  });
  statements.push(command(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, topicId]));

  // The caller owns the transaction, including the reads used to derive this layout.
  statements.forEach(({ statement, values }) => statement.run(...values));
}

export async function updateTopicTodoBoard(
  db: Database,
  topicId: string,
  layout: TopicTodoBoardLayout,
): Promise<TopicTodoMutationResult> {
  db.transaction(() => {
    const todos = loadTopicTodoRows(db, topicId);
    persistBoardLayout(db, topicId, todos, todos, layout, new Date().toISOString());
  }).immediate();
  return loadMutationResult(db, topicId);
}

export async function insertTopicTodo(db: Database, todo: TopicTodo): Promise<TopicTodoMutationResult> {
  if (todo.status !== 'todo' && todo.status !== 'in_progress') {
    throw new TopicTodoInvalidStateError('New Todo must be todo or in progress');
  }
  db.transaction(() => {
    const existing = loadTopicTodoRows(db, todo.topic_id);
    const nextTodo: TopicTodo = {
      ...todo,
      status: todo.status,
      is_current: 0,
      current_started_at: null,
      completed_at: null,
    };
    const layout = boardLayoutFromTodos(existing);
    const targetIds = todo.status === 'in_progress' ? layout.in_progress_ids : layout.todo_ids;
    targetIds.push(nextTodo.id);
    const nextTodos = [...existing, nextTodo];
    persistBoardLayout(db, todo.topic_id, existing, nextTodos, layout, todo.updated_at, [
      topicTodoStatement(db, nextTodo),
    ]);
  }).immediate();
  return loadMutationResult(db, todo.topic_id);
}

export async function updateTopicTodo(
  db: Database,
  id: string,
  body: Pick<Partial<TopicTodo>, 'title'>,
): Promise<TopicTodoMutationResult> {
  const topicId = db
    .transaction(() => {
      const existing = loadTodo(db, id);
      if (!existing) throw new TopicTodoNotFoundError('Todo not found');
      const fields = ['title'].filter(field => Object.prototype.hasOwnProperty.call(body, field));
      const now = new Date().toISOString();
      if (fields.length > 0) {
        execute(
          db,
          `UPDATE topic_todos SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
          [...fields.map(field => body[field as keyof typeof body]), now, id],
        );
      }
      execute(db, 'UPDATE topics SET updated_at = ? WHERE id = ?', [now, existing.topic_id]);
      return existing.topic_id;
    })
    .immediate();
  return loadMutationResult(db, topicId);
}

export async function setCurrentTopicTodo(db: Database, id: string): Promise<TopicTodoMutationResult> {
  const topicId = db
    .transaction(() => {
      const existing = loadTodo(db, id);
      if (!existing) throw new TopicTodoNotFoundError('Todo not found');
      if (existing.status === 'completed') throw new TopicTodoInvalidStateError('Completed Todo cannot become current');
      const todos = loadTopicTodoRows(db, existing.topic_id);
      const layout = boardLayoutFromTodos(todos);
      layout.todo_ids = layout.todo_ids.filter(todoId => todoId !== id);
      layout.in_progress_ids = [id, ...layout.in_progress_ids.filter(todoId => todoId !== id)];
      persistBoardLayout(db, existing.topic_id, todos, todos, layout, new Date().toISOString());
      return existing.topic_id;
    })
    .immediate();
  return loadMutationResult(db, topicId);
}

export async function completeTopicTodo(db: Database, id: string): Promise<TopicTodoMutationResult> {
  const topicId = db
    .transaction(() => {
      const existing = loadTodo(db, id);
      if (!existing) throw new TopicTodoNotFoundError('Todo not found');
      if (existing.status === 'completed') return existing.topic_id;
      const todos = loadTopicTodoRows(db, existing.topic_id);
      const layout = boardLayoutFromTodos(todos);
      layout.todo_ids = layout.todo_ids.filter(todoId => todoId !== id);
      layout.in_progress_ids = layout.in_progress_ids.filter(todoId => todoId !== id);
      layout.completed_ids = [...layout.completed_ids, id];
      persistBoardLayout(db, existing.topic_id, todos, todos, layout, new Date().toISOString());
      return existing.topic_id;
    })
    .immediate();
  return loadMutationResult(db, topicId);
}

export async function reopenTopicTodo(db: Database, id: string): Promise<TopicTodoMutationResult> {
  const topicId = db
    .transaction(() => {
      const existing = loadTodo(db, id);
      if (!existing) throw new TopicTodoNotFoundError('Todo not found');
      if (existing.status !== 'completed') throw new TopicTodoInvalidStateError('Only completed Todo can be reopened');
      const todos = loadTopicTodoRows(db, existing.topic_id);
      const layout = boardLayoutFromTodos(todos);
      layout.completed_ids = layout.completed_ids.filter(todoId => todoId !== id);
      layout.todo_ids = [...layout.todo_ids, id];
      persistBoardLayout(db, existing.topic_id, todos, todos, layout, new Date().toISOString());
      return existing.topic_id;
    })
    .immediate();
  return loadMutationResult(db, topicId);
}

export async function deleteTopicTodo(db: Database, id: string): Promise<TopicTodoMutationResult> {
  const topicId = db
    .transaction(() => {
      const existing = loadTodo(db, id);
      if (!existing) throw new TopicTodoNotFoundError('Todo not found');
      const todos = loadTopicTodoRows(db, existing.topic_id);
      const nextTodos = todos.filter(todo => todo.id !== id);
      const layout = boardLayoutFromTodos(nextTodos);
      persistBoardLayout(db, existing.topic_id, todos, nextTodos, layout, new Date().toISOString(), [
        command(db, 'DELETE FROM topic_todos WHERE id = ?', [id]),
      ]);
      return existing.topic_id;
    })
    .immediate();
  return loadMutationResult(db, topicId);
}
