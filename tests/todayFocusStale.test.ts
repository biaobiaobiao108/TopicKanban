import { afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { loadTodayFocus } from '../src/server/repositories/topics';
import { SqliteDatabase } from '../src/server/sqlite';

describe('Today focus stale action age', () => {
  let sqlite: Database | null = null;

  afterEach(() => {
    sqlite?.close();
    sqlite = null;
  });

  it('compares UTC instants without adding eight hours to elapsed time', async () => {
    sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    const db = new SqliteDatabase(sqlite);
    const now = new Date().toISOString();
    const startedAt = new Date(Date.now() - (5 * 24 - 1) * 60 * 60 * 1000).toISOString();
    sqlite.query(`INSERT INTO topics (id, title, status, created_at, updated_at)
      VALUES ('recent-action', '刚满四天二十三小时的行动', 'production', ?, ?)`).run(now, now);
    sqlite.query(`INSERT INTO topic_todos (id, topic_id, title, status, is_current, current_started_at, created_at, updated_at)
      VALUES ('recent-action-todo', 'recent-action', '继续核对资料', 'in_progress', 1, ?, ?, ?)`).run(startedAt, startedAt, startedAt);

    const focus = await loadTodayFocus(db, 5);
    expect(focus.action_progress.stale_action_count).toBe(0);
    expect(focus.attention_topics.some((topic) => topic.id === 'recent-action')).toBe(false);
  });

  it('uses the current marker instead of picking an older backlog item with the same lane order', async () => {
    sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    const db = new SqliteDatabase(sqlite);
    const now = new Date().toISOString();
    sqlite.query(`INSERT INTO topics (id, title, status, created_at, updated_at)
      VALUES ('lane-split', '分列后的当前行动', 'production', ?, ?)`).run(now, now);
    sqlite.query(`INSERT INTO topic_todos (id, topic_id, title, status, is_current, current_started_at, sort_order, created_at, updated_at)
      VALUES ('older-backlog', 'lane-split', '稍后安排', 'todo', 0, NULL, 1, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`).run();
    sqlite.query(`INSERT INTO topic_todos (id, topic_id, title, status, is_current, current_started_at, sort_order, created_at, updated_at)
      VALUES ('marked-current', 'lane-split', '正在推进', 'in_progress', 1, ?, 1, '2026-09-01T00:00:00.000Z', ?)`).run(now, now);

    const focus = await loadTodayFocus(db, 5);
    expect(focus.topics.find((topic) => topic.id === 'lane-split')?.current_todo).toMatchObject({
      id: 'marked-current', status: 'in_progress', is_current: 1,
    });
  });
});
