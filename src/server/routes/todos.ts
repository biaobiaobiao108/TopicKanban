import type { NativeApp } from '../native';
import type { TopicTodo, TopicTodoBoardLayout } from '../../types';
import {
  createId,
  jsonError,
  jsonValidationError,
  requireDb,
  validateTextFields,
} from '../apiShared';
import { parseWithZod, todoBoardLayoutSchema } from '../schemas';
import {
  completeTopicTodo,
  deleteTopicTodo,
  loadAllTopicTodos,
  insertTopicTodo,
  loadTopicTodos,
  reopenTopicTodo,
  setCurrentTopicTodo,
  updateTopicTodo,
  updateTopicTodoBoard,
} from '../repositories';

function validateTodoFields(body: Record<string, unknown>, requireTitle = false): string | null {
  const textError = validateTextFields(body, {
    title: [200, requireTitle],
  });
  return textError;
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
        status: 'todo',
        is_current: 0,
        current_started_at: null,
        completed_at: null,
        sort_order: 0,
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

  app.patch('/topics/:id/todos/board', async (c) => {
    try {
      const parsed = parseWithZod(todoBoardLayoutSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);
      return c.json(await updateTopicTodoBoard(
        requireDb(c),
        c.req.param('id'),
        parsed.data as TopicTodoBoardLayout,
      ));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });
}
