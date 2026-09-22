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
    sqlite.query(`INSERT INTO topic_todos (id, topic_id, title, is_current, current_started_at, created_at, updated_at)
      VALUES ('recent-action-todo', 'recent-action', '继续核对资料', 1, ?, ?, ?)`).run(startedAt, startedAt, startedAt);

    const focus = await loadTodayFocus(db, 5);
    expect(focus.action_progress.stale_action_count).toBe(0);
    expect(focus.attention_topics.some((topic) => topic.id === 'recent-action')).toBe(false);
  });
});
