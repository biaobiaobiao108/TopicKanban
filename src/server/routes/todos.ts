import type { NativeApp } from '../native';
import type { TopicTodo } from '../../types';
import {
  createId,
  jsonError,
  requireDb,
  validateTextFields,
} from '../apiShared';
import { isValidIsoDate } from '../../lib/dateInput';
import {
  completeTopicTodo,
  deleteTopicTodo,
  getNextTodoSortOrder,
  loadAllTopicTodos,
  insertTopicTodo,
  loadTopicTodos,
  reopenTopicTodo,
  reorderTopicTodos,
  setCurrentTopicTodo,
  updateTopicTodo,
} from '../repositories';

function isValidTodoDate(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (typeof value === 'string' && isValidIsoDate(value));
}

function validateTodoFields(body: Record<string, unknown>, requireTitle = false): string | null {
  const textError = validateTextFields(body, {
    title: [200, requireTitle],
    notes: [20_000],
  });
  if (textError) return textError;
  if (Object.prototype.hasOwnProperty.call(body, 'due_date') && !isValidTodoDate(body.due_date)) {
    return 'due_date must be YYYY-MM-DD or null';
  }
  return null;
}

export function registerTodoRoutes(app: NativeApp): void {
  app.get('/todos', async (c) => {
    try {
      return c.json(await loadAllTopicTodos(requireDb(c)));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/topics/:id/todos', async (c) => {
    try {
      return c.json(await loadTopicTodos(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/topics/:id/todos', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Record<string, unknown>>();
      const validationError = validateTodoFields(body, true);
      if (validationError) return c.json({ error: validationError }, 400);
      const now = new Date().toISOString();
      const todo: TopicTodo = {
        id: createId('todo'),
        topic_id: c.req.param('id'),
        title: String(body.title).trim(),
        notes: typeof body.notes === 'string' ? body.notes.trim() : '',
        due_date: typeof body.due_date === 'string' && body.due_date ? body.due_date : null,
        is_current: 0,
        current_started_at: null,
        completed_at: null,
        sort_order: await getNextTodoSortOrder(db, c.req.param('id')),
        created_at: now,
        updated_at: now,
      };
      return c.json(await insertTopicTodo(db, todo), 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/todos/:id', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const validationError = validateTodoFields(body);
      if (validationError) return c.json({ error: validationError }, 400);
      if (Object.prototype.hasOwnProperty.call(body, 'title') && !String(body.title).trim()) {
        return c.json({ error: 'title is required' }, 400);
      }
      return c.json(await updateTopicTodo(requireDb(c), c.req.param('id'), {
        ...(Object.prototype.hasOwnProperty.call(body, 'title') ? { title: String(body.title).trim() } : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'notes') ? { notes: String(body.notes).trim() } : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'due_date') ? { due_date: body.due_date ? String(body.due_date) : null } : {}),
      }));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/todos/:id/current', async (c) => {
    try {
      return c.json(await setCurrentTopicTodo(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/todos/:id/complete', async (c) => {
    try {
      return c.json(await completeTopicTodo(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/todos/:id/reopen', async (c) => {
    try {
      return c.json(await reopenTopicTodo(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/todos/:id', async (c) => {
    try {
      return c.json(await deleteTopicTodo(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/topics/:id/todos/reorder', async (c) => {
    try {
      const body = await c.req.json<{ ids?: unknown }>();
      if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string' || !id.trim())) {
        return c.json({ error: 'ids array is required' }, 400);
      }
      if (body.ids.length > 200 || new Set(body.ids).size !== body.ids.length) {
        return c.json({ error: 'Invalid Todo order' }, 400);
      }
      return c.json(await reorderTopicTodos(requireDb(c), c.req.param('id'), body.ids));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });
}
