import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createApp } from '../src/server/app';
import { AppKV } from '../src/server/appKv';
import { NativeApp } from '../src/server/native';
import { SqliteDatabase } from '../src/server/sqlite';
import type { ApiBindings } from '../src/server/apiShared';
import type { TopicTodo, TopicTodoBoardLayout, TopicTodoMutationResult } from '../src/types';

describe('Topic Todo board API', () => {
  let sqlite: Database;
  let app: NativeApp;
  let headers: { Authorization: string; 'Content-Type': string };

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
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

  const createTopic = async (title: string, initialTodo?: string) => {
    const response = await app.request('/api/topics', {
      method: 'POST', headers,
      body: JSON.stringify({ title, ...(initialTodo ? { initial_todo: { title: initialTodo } } : {}) }),
    });
    expect(response.status).toBe(201);
    return await response.json() as { id: string; current_todo?: TopicTodo | null };
  };

  const createTodo = async (topicId: string, title: string) => {
    const response = await app.request(`/api/topics/${topicId}/todos`, {
      method: 'POST', headers, body: JSON.stringify({ title }),
    });
    expect(response.status).toBe(201);
    return await response.json() as TopicTodoMutationResult;
  };

  const updateBoard = (topicId: string, layout: TopicTodoBoardLayout) => app.request(`/api/topics/${topicId}/todos/board`, {
    method: 'PATCH', headers, body: JSON.stringify(layout),
  });

  it('creates the initial action in progress and adds later items to the end of todo', async () => {
    const topic = await createTopic('执行看板选题', '先看原始资料');
    expect(topic.current_todo).toMatchObject({ title: '先看原始资料', status: 'in_progress', is_current: 1 });

    const second = await createTodo(topic.id, '整理关键时间线');
    const third = await createTodo(topic.id, '写出开场段落');
    expect(second.todos.find((todo) => todo.title === '整理关键时间线')).toMatchObject({ status: 'todo', is_current: 0 });
    expect(third.todos.filter((todo) => todo.status === 'todo').map((todo) => todo.title)).toEqual(['整理关键时间线', '写出开场段落']);
    expect(third.topic.current_todo?.title).toBe('先看原始资料');
  });

  it('allows any number of in-progress items and keeps the first ordered item as current', async () => {
    const topic = await createTopic('多项并行选题', '第一个行动');
    await createTodo(topic.id, '第二个行动');
    const third = await createTodo(topic.id, '第三个行动');
    const todos = third.todos;
    const firstId = todos.find((todo) => todo.title === '第一个行动')!.id;
    const secondId = todos.find((todo) => todo.title === '第二个行动')!.id;
    const thirdId = todos.find((todo) => todo.title === '第三个行动')!.id;

    const moved = await updateBoard(topic.id, { todo_ids: [], in_progress_ids: [firstId, secondId, thirdId], completed_ids: [] });
    expect(moved.status).toBe(200);
    const movedData = await moved.json() as TopicTodoMutationResult;
    expect(movedData.todos.filter((todo) => todo.status === 'in_progress')).toHaveLength(3);
    expect(movedData.todos.filter((todo) => todo.is_current === 1).map((todo) => todo.id)).toEqual([firstId]);
    expect(movedData.topic.current_todo?.id).toBe(firstId);

    const oldStartedAt = movedData.topic.current_todo?.current_started_at;
    await Bun.sleep(3);
    const reordered = await updateBoard(topic.id, { todo_ids: [], in_progress_ids: [secondId, firstId, thirdId], completed_ids: [] });
    const reorderedData = await reordered.json() as TopicTodoMutationResult;
    expect(reorderedData.topic.current_todo?.id).toBe(secondId);
    expect(reorderedData.topic.current_todo?.current_started_at).not.toBe(oldStartedAt);
    expect(reorderedData.todos.find((todo) => todo.id === firstId)?.is_current).toBe(0);
  });

  it('promotes the next in-progress item and clears current action when the lane becomes empty', async () => {
    const topic = await createTopic('当前行动继任选题', '当前行动');
    const response = await createTodo(topic.id, '后续行动');
    const currentId = response.todos.find((todo) => todo.title === '当前行动')!.id;
    const nextId = response.todos.find((todo) => todo.title === '后续行动')!.id;
    await updateBoard(topic.id, { todo_ids: [], in_progress_ids: [currentId, nextId], completed_ids: [] });

    const movedOut = await updateBoard(topic.id, { todo_ids: [currentId], in_progress_ids: [nextId], completed_ids: [] });
    const movedOutData = await movedOut.json() as TopicTodoMutationResult;
    expect(movedOutData.topic.current_todo?.id).toBe(nextId);
    expect(movedOutData.todos.find((todo) => todo.id === currentId)).toMatchObject({ status: 'todo', is_current: 0, current_started_at: null });

    const emptyLane = await updateBoard(topic.id, { todo_ids: [currentId, nextId], in_progress_ids: [], completed_ids: [] });
    const emptyData = await emptyLane.json() as TopicTodoMutationResult;
    expect(emptyData.topic.current_todo).toBeNull();
    expect(emptyData.todos.every((todo) => todo.is_current === 0)).toBe(true);
  });

  it('completes current action, promotes the next in-progress item, and reopens into todo', async () => {
    const topic = await createTopic('完成与恢复选题', '先做的事');
    const created = await createTodo(topic.id, '继续做的事');
    const firstId = created.todos.find((todo) => todo.title === '先做的事')!.id;
    const nextId = created.todos.find((todo) => todo.title === '继续做的事')!.id;
    await updateBoard(topic.id, { todo_ids: [], in_progress_ids: [firstId, nextId], completed_ids: [] });

    const completed = await app.request(`/api/todos/${firstId}/complete`, { method: 'POST', headers });
    const completedData = await completed.json() as TopicTodoMutationResult;
    expect(completedData.topic.current_todo?.id).toBe(nextId);
    expect(completedData.todos.find((todo) => todo.id === firstId)).toMatchObject({ status: 'completed', is_current: 0 });
    expect(completedData.todos.find((todo) => todo.id === firstId)?.completed_at).toBeTruthy();

    const reopened = await app.request(`/api/todos/${firstId}/reopen`, { method: 'POST', headers });
    const reopenedData = await reopened.json() as TopicTodoMutationResult;
    expect(reopenedData.topic.current_todo?.id).toBe(nextId);
    expect(reopenedData.todos.find((todo) => todo.id === firstId)).toMatchObject({ status: 'todo', is_current: 0, completed_at: null });
  });

  it('rejects duplicate, omitted, and foreign Todo IDs in board updates', async () => {
    const topic = await createTopic('校验选题', '保留在进行中');
    const created = await createTodo(topic.id, '属于当前选题');
    const ownId = created.todos.find((todo) => todo.title === '属于当前选题')!.id;
    const otherTopic = await createTopic('另一个选题', '别处的行动');
    const foreignId = otherTopic.current_todo!.id;
    const currentId = created.topic.current_todo!.id;
    const valid = { todo_ids: [ownId], in_progress_ids: [currentId], completed_ids: [] };

    expect((await updateBoard(topic.id, { ...valid, todo_ids: [ownId, ownId] })).status).toBe(400);
    expect((await updateBoard(topic.id, { todo_ids: [], in_progress_ids: [currentId], completed_ids: [] })).status).toBe(400);
    expect((await updateBoard(topic.id, { ...valid, completed_ids: [foreignId] })).status).toBe(400);
    expect((await updateBoard(topic.id, valid)).status).toBe(200);
  });

  it('supports title updates, rejects empty titles, and promotes after deleting current', async () => {
    const topic = await createTopic('基本操作选题', '即将删除');
    const created = await createTodo(topic.id, '继任行动');
    const currentId = created.todos.find((todo) => todo.title === '即将删除')!.id;
    const nextId = created.todos.find((todo) => todo.title === '继任行动')!.id;
    await updateBoard(topic.id, { todo_ids: [], in_progress_ids: [currentId, nextId], completed_ids: [] });

    const updateResponse = await app.request(`/api/todos/${nextId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ title: '已更新标题' }),
    });
    expect((await updateResponse.json() as TopicTodoMutationResult).todos.find((todo) => todo.id === nextId)?.title).toBe('已更新标题');

    const emptyTitle = await app.request(`/api/topics/${topic.id}/todos`, {
      method: 'POST', headers, body: JSON.stringify({ title: '   ' }),
    });
    expect(emptyTitle.status).toBe(400);

    const deleted = await app.request(`/api/todos/${currentId}`, { method: 'DELETE', headers });
    expect((await deleted.json() as TopicTodoMutationResult).topic.current_todo?.id).toBe(nextId);
  });

  it('allows unlimited in-progress rows while enforcing only one current marker in SQLite', async () => {
    sqlite.query(`INSERT INTO topics (id, title, created_at, updated_at) VALUES ('topic-direct', '直接校验', '2026-09-01', '2026-09-01')`).run();
    const insert = sqlite.query(`INSERT INTO topic_todos (id, topic_id, title, status, is_current, current_started_at, created_at, updated_at, sort_order)
      VALUES (?, 'topic-direct', ?, 'in_progress', ?, ?, '2026-09-01', '2026-09-01', ?)`);
    insert.run('todo-direct-1', '第一条', 1, '2026-09-01', 1);
    insert.run('todo-direct-2', '第二条', 0, null, 2);
    insert.run('todo-direct-3', '第三条', 0, null, 3);
    expect(sqlite.query(`SELECT COUNT(*) AS count FROM topic_todos WHERE status = 'in_progress'`).get()).toEqual({ count: 3 });
    expect(() => insert.run('todo-direct-4', '重复当前行动', 1, '2026-09-02', 4)).toThrow();
    sqlite.query(`DELETE FROM topics WHERE id = 'topic-direct'`).run();
    expect(sqlite.query(`SELECT id FROM topic_todos WHERE topic_id = 'topic-direct'`).all()).toEqual([]);
  });

  it('places newly created and reopened todos in the backlog', async () => {
    const topic = await createTopic('待办列选题');
    const created = await createTodo(topic.id, '需要安排的事项');
    const todoId = created.todos[0].id;
    expect(created.todos[0]).toMatchObject({ status: 'todo', is_current: 0 });
    expect(created.topic.current_todo).toBeNull();

    await updateBoard(topic.id, { todo_ids: [], in_progress_ids: [todoId], completed_ids: [] });
    await app.request(`/api/todos/${todoId}/complete`, { method: 'POST', headers });
    const reopened = await app.request(`/api/todos/${todoId}/reopen`, { method: 'POST', headers });
    expect((await reopened.json() as TopicTodoMutationResult).todos[0].status).toBe('todo');
  });
});
