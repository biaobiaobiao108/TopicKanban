import { beforeEach, afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/server/app';
import { AppKV } from '../src/server/appKv';
import { NativeApp } from '../src/server/native';
import { SqliteDatabase } from '../src/server/sqlite';
import type { ApiBindings } from '../src/server/apiShared';

describe('Topic pin API', () => {
  let sqlite: Database;
  let app: NativeApp;
  let headers: { Authorization: string; 'Content-Type': string };

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.exec(fs.readFileSync(path.resolve(process.cwd(), 'drizzle/0000_schema.sql'), 'utf8'));
    const db = new SqliteDatabase(sqlite);
    app = createApp({ DB: db, KV: new AppKV(db), APP_PASSWORD: 'pin-test-password' } satisfies ApiBindings);
    const response = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'pin-test-password' }),
    });
    const { token } = await response.json() as { token: string };
    headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  });

  afterEach(() => sqlite.close());

  it('allows only one active pinned topic and returns the cleared topic IDs', async () => {
    const create = async (title: string, status = 'production') => {
      const response = await app.request('/api/topics', {
        method: 'POST', headers, body: JSON.stringify({ title, status }),
      });
      expect(response.status).toBe(201);
      return await response.json() as { id: string };
    };
    const first = await create('第一个主推');
    const second = await create('第二个主推');

    const firstPin = await app.request(`/api/topics/${first.id}/pin`, {
      method: 'POST', headers, body: JSON.stringify({ is_pinned: 1 }),
    });
    expect(firstPin.status).toBe(200);
    expect((await firstPin.json() as { cleared_topic_ids: string[] }).cleared_topic_ids).toEqual([]);

    const secondPin = await app.request(`/api/topics/${second.id}/pin`, {
      method: 'POST', headers, body: JSON.stringify({ is_pinned: 1 }),
    });
    expect(secondPin.status).toBe(200);
    expect((await secondPin.json() as { cleared_topic_ids: string[] }).cleared_topic_ids).toEqual([first.id]);

    const page = await app.request('/api/topics?scope=active&page_size=20', { headers });
    const items = await page.json() as { items: Array<{ id: string; is_pinned: number }> };
    expect(items.items.find((item) => item.id === first.id)?.is_pinned).toBe(0);
    expect(items.items.find((item) => item.id === second.id)?.is_pinned).toBe(1);
  });

  it('rejects archived topics as the main topic and clears pin when archiving', async () => {
    const createResponse = await app.request('/api/topics', {
      method: 'POST', headers, body: JSON.stringify({ title: '活跃主推' }),
    });
    const active = await createResponse.json() as { id: string };
    const pinResponse = await app.request(`/api/topics/${active.id}/pin`, {
      method: 'POST', headers, body: JSON.stringify({ is_pinned: 1 }),
    });
    expect(pinResponse.status).toBe(200);

    const archiveResponse = await app.request(`/api/topics/${active.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ status: 'published' }),
    });
    expect(archiveResponse.status).toBe(200);
    expect((await archiveResponse.json() as { is_pinned: number }).is_pinned).toBe(0);

    const archivedCreate = await app.request('/api/topics', {
      method: 'POST', headers, body: JSON.stringify({ title: '已发布选题', status: 'published' }),
    });
    const archived = await archivedCreate.json() as { id: string };
    const rejected = await app.request(`/api/topics/${archived.id}/pin`, {
      method: 'POST', headers, body: JSON.stringify({ is_pinned: 1 }),
    });
    expect(rejected.status).toBe(400);
  });
});
