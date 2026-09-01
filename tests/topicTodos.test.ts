import { beforeEach, afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/server/app';
import { AppKV } from '../src/server/appKv';
import { NativeApp } from '../src/server/native';
import { SqliteDatabase } from '../src/server/sqlite';
import type { ApiBindings } from '../src/server/apiShared';

describe('Topic Todo API', () => {
  let sqlite: Database;
  let app: NativeApp;
  let headers: { Authorization: string; 'Content-Type': string };

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.exec(fs.readFileSync(path.resolve(process.cwd(), 'drizzle/0000_schema.sql'), 'utf8'));
    const db = new SqliteDatabase(sqlite);
    app = createApp({ DB: db, KV: new AppKV(db), APP_PASSWORD: 'todo-test-password' } satisfies ApiBindings);
    const response = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'todo-test-password' }),
    });
    const { token } = await response.json() as { token: string };
    headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  });

  afterEach(() => sqlite.close());

  it('supports CRUD, ordering, unique current action and automatic promotion', async () => {
    const topicResponse = await app.request('/api/topics', {
      method: 'POST', headers, body: JSON.stringify({
        title: 'Todo 流程选题', initial_todo: { title: '先看原始资料' },
      }),
    });
    expect(topicResponse.status).toBe(201);
    const topic = await topicResponse.json() as { id: string; current_todo?: { title: string } };
    expect(topic.current_todo?.title).toBe('先看原始资料');

    const create = async (title: string) => {
      const response = await app.request(`/api/topics/${topic.id}/todos`, {
        method: 'POST', headers, body: JSON.stringify({ title }),
      });
      expect(response.status).toBe(201);
      return await response.json() as { todos: Array<{ id: string; title: string; is_current: number }> };
    };
    const secondResult = await create('整理关键时间线');
    const thirdResult = await create('写出开场段落');
    const initialTodos = secondResult.todos;
    const firstId = initialTodos.find((todo) => todo.title === '先看原始资料')!.id;
    const secondId = initialTodos.find((todo) => todo.title === '整理关键时间线')!.id;
    const thirdId = thirdResult.todos.find((todo) => todo.title === '写出开场段落')!.id;

    const reorderResponse = await app.request(`/api/topics/${topic.id}/todos/reorder`, {
      method: 'PATCH', headers, body: JSON.stringify({ ids: [secondId, firstId, thirdId] }),
    });
    expect(reorderResponse.status).toBe(200);

    const currentResponse = await app.request(`/api/todos/${secondId}/current`, { method: 'POST', headers });
    expect(currentResponse.status).toBe(200);
    expect((await currentResponse.json() as { topic: { current_todo?: { id: string } } }).topic.current_todo?.id).toBe(secondId);

    const updateResponse = await app.request(`/api/todos/${secondId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ title: '整理关键时间线（已更新）' }),
    });
    expect(updateResponse.status).toBe(200);
    expect((await updateResponse.json() as { todos: Array<{ id: string; title: string }> }).todos.find((todo) => todo.id === secondId)).toMatchObject({ title: '整理关键时间线（已更新）' });

    const completeCurrent = await app.request(`/api/todos/${secondId}/complete`, { method: 'POST', headers });
    expect(completeCurrent.status).toBe(200);
    expect((await completeCurrent.json() as { topic: { current_todo?: { id: string } } }).topic.current_todo?.id).toBe(firstId);

    const completeFirst = await app.request(`/api/todos/${firstId}/complete`, { method: 'POST', headers });
    expect((await completeFirst.json() as { topic: { current_todo?: { id: string } } }).topic.current_todo?.id).toBe(thirdId);

    const reopenFirst = await app.request(`/api/todos/${firstId}/reopen`, { method: 'POST', headers });
    expect((await reopenFirst.json() as { topic: { current_todo?: { id: string } } }).topic.current_todo?.id).toBe(thirdId);
    const reopenPending = await app.request(`/api/todos/${thirdId}/reopen`, { method: 'POST', headers });
    expect(reopenPending.status).toBe(400);
    const deleteCurrent = await app.request(`/api/todos/${thirdId}`, { method: 'DELETE', headers });
    expect((await deleteCurrent.json() as { topic: { current_todo?: { id: string } } }).topic.current_todo?.id).toBe(firstId);

    const emptyTitle = await app.request(`/api/topics/${topic.id}/todos`, {
      method: 'POST', headers, body: JSON.stringify({ title: '   ' }),
    });
    expect(emptyTitle.status).toBe(400);
  });

  it('prevents two current pending Todos at the database level and cascades with topic deletion', async () => {
    sqlite.query(`INSERT INTO topics (id, title, created_at, updated_at) VALUES ('topic-direct', '直接校验', '2026-09-01', '2026-09-01')`).run();
    const insert = sqlite.query(`INSERT INTO topic_todos (id, topic_id, title, created_at, updated_at, is_current, sort_order) VALUES (?, 'topic-direct', ?, '2026-09-01', '2026-09-01', 1, 1)`);
    insert.run('todo-direct-1', '第一条');
    expect(() => insert.run('todo-direct-2', '第二条')).toThrow();
    sqlite.query(`DELETE FROM topics WHERE id = 'topic-direct'`).run();
    expect(sqlite.query(`SELECT id FROM topic_todos WHERE topic_id = 'topic-direct'`).all()).toEqual([]);
  });

  it('derives current action from the first pending Todo and keeps completed items at the end', async () => {
    const topicResponse = await app.request('/api/topics', {
      method: 'POST', headers, body: JSON.stringify({ title: '单列排序选题', initial_todo: { title: '第一步' } }),
    });
    const topic = await topicResponse.json() as { id: string };
    const createResponse = await app.request(`/api/topics/${topic.id}/todos`, {
      method: 'POST', headers, body: JSON.stringify({ title: '第二步' }),
    });
    const created = await createResponse.json() as { todos: Array<{ id: string; title: string }> };
    const firstId = created.todos.find((todo) => todo.title === '第一步')!.id;
    const secondId = created.todos.find((todo) => todo.title === '第二步')!.id;

    const completed = await app.request(`/api/todos/${firstId}/complete`, { method: 'POST', headers });
    expect((await completed.json() as { topic: { current_todo?: { id: string } } }).topic.current_todo?.id).toBe(secondId);

    const reordered = await app.request(`/api/topics/${topic.id}/todos/reorder`, {
      method: 'PATCH', headers, body: JSON.stringify({ ids: [firstId, secondId] }),
    });
    const reorderedData = await reordered.json() as { topic: { current_todo?: { id: string } }; todos: Array<{ id: string; completed_at?: string | null; is_current: number }> };
    expect(reorderedData.topic.current_todo?.id).toBe(secondId);
    expect(reorderedData.todos.map((todo) => todo.id)).toEqual([secondId, firstId]);
    expect(reorderedData.todos.find((todo) => todo.id === secondId)?.is_current).toBe(1);
    expect(reorderedData.todos.find((todo) => todo.id === firstId)?.is_current).toBe(0);

    const reopened = await app.request(`/api/todos/${firstId}/reopen`, { method: 'POST', headers });
    const reopenedData = await reopened.json() as { topic: { current_todo?: { id: string } }; todos: Array<{ id: string }> };
    expect(reopenedData.topic.current_todo?.id).toBe(secondId);
    expect(reopenedData.todos.map((todo) => todo.id)).toEqual([secondId, firstId]);
  });
});
