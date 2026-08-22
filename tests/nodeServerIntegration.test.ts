import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { createApp } from '../src/server/createApp';
import { LocalD1Database } from '../src/server/adapters/localSqlite';
import { LocalKVNamespace } from '../src/server/adapters/localKv';
import type { ApiBindings } from '../src/server/apiShared';

describe('Node.js Server Integration (Local SQLite & API)', () => {
  let sqlite: Database.Database;
  let app: Hono;
  const testPassword = 'test_secret_pass';
  const testDropToken = 'test_drop_token';
  const publicBaseUrl = 'https://kanban.example.com';

  beforeEach(() => {
    sqlite = new Database(':memory:');
    // Load schema
    const schemaFile = path.resolve(process.cwd(), 'drizzle/0000_schema.sql');
    const schemaSql = fs.readFileSync(schemaFile, 'utf-8');
    sqlite.exec(schemaSql);

    const d1 = new LocalD1Database(sqlite);
    const kv = new LocalKVNamespace(sqlite);

    const bindings: ApiBindings = {
      DB: d1,
      KV: kv,
      APP_PASSWORD: testPassword,
      QUICK_DROP_TOKEN: testDropToken,
      PUBLIC_BASE_URL: publicBaseUrl,
    };

    const rootApp = new Hono();
    rootApp.use('*', async (c, next) => {
      c.env = { ...c.env, ...bindings };
      await next();
    });
    rootApp.route('/', createApp());
    app = rootApp;
  });

  afterEach(() => {
    sqlite.close();
  });

  it('runs full authentication, health check, topic CRUD and share flow', async () => {
    // 1. Health check
    const healthRes = await app.request('/api/health');
    expect(healthRes.status).toBe(200);
    const healthData = await healthRes.json() as { status: string; public_base_url: string; d1: { tables: number } };
    expect(healthData.status).toBe('online');
    expect(healthData.public_base_url).toBe(publicBaseUrl);
    expect(healthData.d1.tables).toBeGreaterThan(0);

    // 2. Login
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: testPassword }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json() as { success: boolean; token: string };
    expect(loginData.success).toBe(true);
    expect(loginData.token).toMatch(/^v1\./);
    const authToken = loginData.token;

    // 3. Create topic
    const createRes = await app.request('/api/topics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        title: '测试爆款人物解说',
        hook: '三年从顶流到退圈的戏剧反差',
        summary: '梳理核心争议事件与反转脉络',
        status: 'approved',
        priority: 'high',
      }),
    });
    expect(createRes.status).toBe(201);
    const topic = await createRes.json() as { id: string; title: string };
    expect(topic.title).toBe('测试爆款人物解说');

    // 4. Save Draft
    const draftRes = await app.request(`/api/topics/${topic.id}/draft`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        title: topic.title,
        content_html: '<h1>第一幕</h1><p>镜头拉远……</p>',
        content_json: JSON.stringify({ type: 'doc', content: [] }),
        word_count: 1500,
        base_version: 0,
      }),
    });
    expect(draftRes.status).toBe(200);

    // 5. Generate Share Review Link (Check reverse proxy public URL adaptation)
    const shareRes = await app.request(`/api/topics/${topic.id}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ ttl_seconds: 86400 }),
    });
    expect(shareRes.status).toBe(200);
    const shareData = await shareRes.json() as { success: boolean; token: string; url: string; full_url: string };
    expect(shareData.success).toBe(true);
    expect(shareData.token).toMatch(/^rv-/);
    // Verified that full_url uses configured publicBaseUrl instead of localhost
    expect(shareData.full_url).toBe(`https://kanban.example.com/share/${shareData.token}`);

    // 6. Public access to review snapshot (No auth required)
    const publicReviewRes = await app.request(`/api/public/share/${shareData.token}`);
    expect(publicReviewRes.status).toBe(200);
    const snapshot = await publicReviewRes.json() as { topic_title: string; word_count: number };
    expect(snapshot.topic_title).toBe('测试爆款人物解说');
    expect(snapshot.word_count).toBe(1500);

    // 7. Quick Drop Ingestion with token
    const dropRes = await app.request('/api/inbox/quick-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Quick-Drop-Token': testDropToken,
      },
      body: JSON.stringify({
        content: '某网红停播后续新料',
        url: 'https://www.bilibili.com/video/BV1xx411c7mD',
        source: 'iOS快捷指令',
      }),
    });
    expect(dropRes.status).toBe(201);

    // Fetch quick drops with auth
    const listDropsRes = await app.request('/api/inbox/quick-drops', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(listDropsRes.status).toBe(200);
    const dropList = await listDropsRes.json() as { items: Array<{ content: string }> };
    expect(dropList.items.length).toBe(1);
    expect(dropList.items[0].content).toBe('某网红停播后续新料');
  });
});
