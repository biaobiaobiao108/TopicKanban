import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createApp } from '../src/server/app';
import { AppKV } from '../src/server/appKv';
import { NativeApp } from '../src/server/native';
import { SqliteDatabase } from '../src/server/sqlite';
import type { ApiBindings } from '../src/server/apiShared';

describe('batch reorder validation', () => {
  let sqlite: Database;
  let app: NativeApp;
  let headers: { Authorization: string; 'Content-Type': string };

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    const db = new SqliteDatabase(sqlite);
    app = createApp({
      DB: db,
      KV: new AppKV(db),
      APP_PASSWORD: 'reorder-test-password',
      QUICK_DROP_TOKEN: 'reorder-test-drop-token',
    } satisfies ApiBindings);
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'reorder-test-password' }),
    });
    const { token } = await login.json() as { token: string };
    headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  });

  afterEach(() => sqlite.close());

  it('rejects unknown and duplicate topic IDs while preserving cross-stage moves', async () => {
    const create = async (title: string, status: string) => {
      const response = await app.request('/api/topics', {
        method: 'POST', headers, body: JSON.stringify({ title, status }),
      });
      expect(response.status).toBe(201);
      return await response.json() as { id: string };
    };
    const inbox = await create('收集箱选题', 'inbox');
    const scripting = await create('写稿中选题', 'scripting');

    const unknown = await app.request('/api/topics/reorder/batch', {
      method: 'PATCH', headers,
      body: JSON.stringify({ updates: [{ id: 'missing-topic', status: 'inbox', sort_order: 1 }] }),
    });
    expect(unknown.status).toBe(400);

    const duplicate = await app.request('/api/topics/reorder/batch', {
      method: 'PATCH', headers,
      body: JSON.stringify({ updates: [
        { id: inbox.id, status: 'inbox', sort_order: 1 },
        { id: inbox.id, status: 'scripting', sort_order: 1 },
      ] }),
    });
    expect(duplicate.status).toBe(400);

    const moved = await app.request('/api/topics/reorder/batch', {
      method: 'PATCH', headers,
      body: JSON.stringify({ updates: [{ id: inbox.id, status: 'scripting', sort_order: 1 }] }),
    });
    expect(moved.status).toBe(200);
    expect(sqlite.query('SELECT status, sort_order FROM topics WHERE id = ?').get(inbox.id)).toEqual({ status: 'scripting', sort_order: 1 });
    expect(sqlite.query('SELECT status, sort_order FROM topics WHERE id = ?').get(scripting.id)).toEqual({ status: 'scripting', sort_order: 2 });
  });

  it('rejects unknown, duplicate, and cross-topic source IDs', async () => {
    const now = new Date().toISOString();
    const topicInsert = sqlite.query('INSERT INTO topics (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)');
    topicInsert.run('source-topic-a', '素材选题 A', now, now);
    topicInsert.run('source-topic-b', '素材选题 B', now, now);
    const sourceInsert = sqlite.query(`INSERT INTO sources
      (id, topic_id, title, date_precision, verification_status, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, 'exact', 'confirmed', ?, ?, ?)`);
    sourceInsert.run('source-a-1', 'source-topic-a', 'A 素材 1', 1, now, now);
    sourceInsert.run('source-a-2', 'source-topic-a', 'A 素材 2', 2, now, now);
    sourceInsert.run('source-b-1', 'source-topic-b', 'B 素材 1', 1, now, now);

    const request = (sources: unknown[]) => app.request('/api/sources/reorder/batch', {
      method: 'PATCH', headers, body: JSON.stringify({ sources }),
    });

    expect((await request([{ id: 'missing-source', topic_id: 'source-topic-a' }])).status).toBe(400);
    expect((await request([
      { id: 'source-a-1', topic_id: 'source-topic-a' },
      { id: 'source-a-1', topic_id: 'source-topic-a' },
    ])).status).toBe(400);
    expect((await request([
      { id: 'source-a-1', topic_id: 'source-topic-a' },
      { id: 'source-b-1', topic_id: 'source-topic-b' },
    ])).status).toBe(400);

    expect((await request([
      { id: 'source-a-2', topic_id: 'source-topic-a' },
      { id: 'source-a-1', topic_id: 'source-topic-a' },
    ])).status).toBe(200);
    expect(sqlite.query('SELECT sort_order FROM sources WHERE id = ?').get('source-a-2')).toEqual({ sort_order: 1 });
    expect(sqlite.query('SELECT sort_order FROM sources WHERE id = ?').get('source-a-1')).toEqual({ sort_order: 2 });
  });

  it('rate-limits quick-drop ingestion and keeps its backing store bounded', async () => {
    const clientIp = `quick-drop-test-${Date.now()}-${Math.random()}`;
    const request = () => app.fetch(new Request('http://localhost/api/inbox/quick-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Quick-Drop-Token': 'reorder-test-drop-token',
      },
      body: JSON.stringify({ content: '快投测试内容' }),
    }), clientIp);

    for (let index = 0; index < 120; index += 1) {
      expect((await request()).status).toBe(201);
    }
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
    expect(sqlite.query("SELECT COUNT(*) AS count FROM _kv_store WHERE key LIKE 'drop:%'").get()).toEqual({ count: 100 });
  });
});
