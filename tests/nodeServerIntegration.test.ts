import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { createApp } from '../src/server/createApp';
import { LocalD1Database } from '../src/server/adapters/localSqlite';
import { LocalKVNamespace } from '../src/server/adapters/localKv';
import type { ApiBindings } from '../src/server/apiShared';

describe('Bun Server Integration (Local SQLite & API)', () => {
  let sqlite: Database;
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
    const publishPackageMigration = path.resolve(process.cwd(), 'drizzle/0005_create_publish_packages.sql');
    sqlite.exec(fs.readFileSync(publishPackageMigration, 'utf-8'));

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
    // 1. Health check (Bun container)
    const healthRes = await app.request('/api/health');
    expect(healthRes.status).toBe(200);
    const healthData = await healthRes.json() as {
      status: string;
      environment: string;
      public_base_url: string;
      d1: { tables: number; message: string };
      kv: { connected: boolean; message: string };
    };
    expect(healthData.status).toBe('online');
    expect(healthData.environment).toBe('node_container');
    expect(healthData.public_base_url).toBe(publicBaseUrl);
    expect(healthData.d1.tables).toBeGreaterThan(0);
    expect(healthData.d1.message).toContain('本地 SQLite');
    expect(healthData.kv.message).toContain('本地 SQLite');

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
        title: '文案创作独立标题',
        content_html: '<h1>第一幕</h1><p>镜头拉远……</p>',
        content_json: JSON.stringify({ type: 'doc', content: [] }),
        word_count: 1500,
        base_version: 0,
      }),
    });
    expect(draftRes.status).toBe(200);
    const workspaceRes = await app.request(`/api/topics/${topic.id}/workspace`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(workspaceRes.status).toBe(200);
    const initialWorkspace = await workspaceRes.json() as {
      draft: { title: string } | null;
      publish_package: unknown;
    };
    expect(initialWorkspace.draft?.title).toBe('文案创作独立标题');
    expect(initialWorkspace.publish_package).toBeNull();

    const publishPackagePayload = {
      title_simplified: '简体发布标题',
      title_traditional: '簡體發布標題',
      description_simplified: '简体简介',
      description_traditional: '簡體簡介',
      title_traditional_auto: true,
      description_traditional_auto: true,
      content_json: JSON.stringify({
        title_candidates: ['候选标题'],
        cover_text: '封面短句',
        tags: ['测试'],
        chapters: [{ id: 'chapter-1', title: '开场', time: '00:00', start_seconds: 0, source: 'script-heading' }],
        pinned_comment: '欢迎讨论',
        included_source_ids: [],
      }),
      base_version: 0,
    };
    const publishPackageRes = await app.request(`/api/topics/${topic.id}/publish-package`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(publishPackagePayload),
    });
    expect(publishPackageRes.status).toBe(200);
    const savedPublishPackage = await publishPackageRes.json() as typeof publishPackagePayload & { id: string; version: number; updated_at: string };
    expect(savedPublishPackage.version).toBe(1);
    expect(savedPublishPackage.title_simplified).toBe('简体发布标题');
    expect(savedPublishPackage.title_traditional_auto).toBe(true);

    const packageConflictRes = await app.request(`/api/topics/${topic.id}/publish-package`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ ...publishPackagePayload, title_simplified: '过期版本' }),
    });
    expect(packageConflictRes.status).toBe(409);
    expect((await packageConflictRes.json() as { error: string }).error).toBe('PUBLISH_PACKAGE_CONFLICT');

    const persistedWorkspaceRes = await app.request(`/api/topics/${topic.id}/workspace`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const persistedWorkspace = await persistedWorkspaceRes.json() as { publish_package: { version: number; title_simplified: string } };
    expect(persistedWorkspace.publish_package.version).toBe(1);
    expect(persistedWorkspace.publish_package.title_simplified).toBe('简体发布标题');

    const topicPageRes = await app.request('/api/topics?scope=all&q=测试爆款', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(topicPageRes.status).toBe(200);
    const topicPage = await topicPageRes.json() as {
      total: number;
      summary: { total_words: number; in_scripting_count: number };
      scope_counts: { active: number; archived: number; trash: number };
    };
    expect(topicPage.total).toBe(1);
    expect(topicPage.summary.total_words).toBe(1500);
    expect(topicPage.summary.in_scripting_count).toBe(0);
    expect(topicPage.scope_counts.active).toBe(1);
    expect(topicPage.scope_counts.archived).toBe(0);
    expect(topicPage.scope_counts.trash).toBe(0);

    const statusUpdateRes = await app.request(`/api/topics/${topic.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ status: 'scripting' }),
    });
    expect(statusUpdateRes.status).toBe(200);
    const scriptingPageRes = await app.request('/api/topics?scope=all&q=测试爆款', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const scriptingPage = await scriptingPageRes.json() as { summary: { in_scripting_count: number } };
    expect(scriptingPage.summary.in_scripting_count).toBe(1);

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
    expect(shareData.token).toMatch(/^rv-[0-9a-f-]{36}$/);
    expect(shareData.token.length).toBeGreaterThan(35);
    // Verified that full_url uses configured publicBaseUrl instead of localhost
    expect(shareData.full_url).toBe(`https://kanban.example.com/share/${shareData.token}`);

    // 6. Public access to review snapshot (No auth required)
    const publicReviewRes = await app.request(`/api/public/share/${shareData.token}`);
    expect(publicReviewRes.status).toBe(200);
    const snapshot = await publicReviewRes.json() as { topic_title: string; word_count: number };
    expect(snapshot.topic_title).toBe('测试爆款人物解说');
    expect(snapshot.word_count).toBe(1500);

    const secondShareRes = await app.request(`/api/topics/${topic.id}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ ttl_seconds: 86400 }),
    });
    const secondShareData = await secondShareRes.json() as { token: string };
    expect(secondShareRes.status).toBe(200);
    expect(secondShareData.token).not.toBe(shareData.token);

    const invalidSourceRes = await app.request('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ topic_id: topic.id, title: '恶意链接', url: 'javascript:alert(1)' }),
    });
    expect(invalidSourceRes.status).toBe(400);

    const invalidPublishedRes = await app.request('/api/published', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ title: '恶意成片', url: 'data:text/html,<script>alert(1)</script>' }),
    });
    expect(invalidPublishedRes.status).toBe(400);

    const removedParserRes = await app.request('/api/sources/parse-url?url=https%3A%2F%2Fexample.com', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(removedParserRes.status).toBe(404);

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

    const invalidDropRes = await app.request('/api/inbox/quick-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Quick-Drop-Token': testDropToken,
      },
      body: JSON.stringify({ content: '恶意链接', url: 'file:///etc/passwd' }),
    });
    expect(invalidDropRes.status).toBe(400);

    // Fetch quick drops with auth
    const listDropsRes = await app.request('/api/inbox/quick-drops', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(listDropsRes.status).toBe(200);
    const dropList = await listDropsRes.json() as { items: Array<{ content: string }> };
    expect(dropList.items.length).toBe(1);
    expect(dropList.items[0].content).toBe('某网红停播后续新料');

    // 8. Settings Update & Persistence (including voiceover_cues)
    const customCues = ['停顿 3s', '高能预警', '压低声线'];
    const updateSettingsRes = await app.request('/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        reading_speed: 300,
        theme: 'dark',
        voiceover_cues: customCues,
      }),
    });
    expect(updateSettingsRes.status).toBe(200);
    const updatedSettings = await updateSettingsRes.json() as { reading_speed: number; voiceover_cues: string[] };
    expect(updatedSettings.voiceover_cues).toEqual(customCues);

    // Fetch settings again to ensure KV persistence
    const getSettingsRes = await app.request('/api/settings', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(getSettingsRes.status).toBe(200);
    const fetchedSettings = await getSettingsRes.json() as { reading_speed: number; voiceover_cues: string[] };
    expect(fetchedSettings.voiceover_cues).toEqual(customCues);

    // 9. Backup restore persists settings through KV without a relational settings table
    const backupRes = await app.request('/api/backup', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(backupRes.status).toBe(200);
    const backupPayload = await backupRes.json() as { data: { settings: Record<string, unknown> } };
    const fullBackupPayload = await (await app.request('/api/backup', {
      headers: { Authorization: `Bearer ${authToken}` },
    })).json() as { data: { publish_packages?: Array<{ topic_id: string; title_simplified: string; title_traditional_auto: boolean }> } };
    expect(fullBackupPayload.data.publish_packages?.[0]).toMatchObject({
      topic_id: topic.id,
      title_simplified: '简体发布标题',
      title_traditional_auto: true,
    });
    const restoreRes = await app.request('/api/backup', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          ...backupPayload.data,
          settings: { ...backupPayload.data.settings, reading_speed: 333 },
        },
      }),
    });
    expect(restoreRes.status).toBe(200);
    const restoredSettingsRes = await app.request('/api/settings', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect((await restoredSettingsRes.json() as { reading_speed: number }).reading_speed).toBe(333);
    expect(sqlite.query('SELECT title_simplified FROM publish_packages WHERE topic_id = ?').get(topic.id)).toEqual({ title_simplified: '简体发布标题' });
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get()).toBeNull();
  });

  it('fails explicitly when settings persistence has no KV binding', async () => {
    const noKvApp = new Hono();
    noKvApp.use('*', async (c, next) => {
      c.env = { DB: new LocalD1Database(sqlite), APP_PASSWORD: testPassword };
      await next();
    });
    noKvApp.route('/', createApp());

    const loginRes = await noKvApp.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: testPassword }),
    });
    const { token } = await loginRes.json() as { token: string };
    const settingsRes = await noKvApp.request('/api/settings', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(settingsRes.status).toBe(503);
  });

  it('correctly identifies Cloudflare Pages environment when ENVIRONMENT is cloudflare_pages or simulating D1/KV', async () => {
    const cfApp = new Hono();
    // Simulate Cloudflare environment without local sqlite adapter attachments
    const mockD1 = {
      prepare: (query: string) => ({
        bind: () => mockD1.prepare(query),
        first: async () => ({ count: 5 }),
        run: async () => ({ success: true, meta: { changes: 1 } }),
        all: async () => ({ results: [], success: true }),
      }),
    };
    const mockKv = {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [] }),
    };

    cfApp.use('*', async (c, next) => {
      c.env = {
        DB: mockD1 as unknown as D1Database,
        KV: mockKv as unknown as KVNamespace,
        ENVIRONMENT: 'cloudflare_pages',
      };
      await next();
    });
    cfApp.route('/', createApp());

    const res = await cfApp.request('/api/health');
    expect(res.status).toBe(200);
    const data = await res.json() as {
      status: string;
      environment: string;
      d1: { connected: boolean; message: string };
      kv: { connected: boolean; message: string };
    };
    expect(data.environment).toBe('cloudflare_pages');
    expect(data.d1.message).toContain('Cloudflare D1');
    expect(data.kv.message).toContain('Cloudflare KV');
  });

  it('rejects oversized unauthenticated login and quick-drop requests', async () => {
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'x'.repeat(20_000) }),
    });
    expect(loginRes.status).toBe(413);

    const dropRes = await app.request('/api/inbox/quick-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Quick-Drop-Token': testDropToken,
      },
      body: JSON.stringify({ content: 'x'.repeat(70_000) }),
    });
    expect(dropRes.status).toBe(413);
  });

  it('keeps the first active presence lease when another client reports', async () => {
    const first = await app.request('/api/topics/topic-1/presence', {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid' },
      body: JSON.stringify({ client_id: 'client-a', device_name: 'A' }),
    });
    expect(first.status).toBe(401);

    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: testPassword }),
    });
    const { token } = await loginRes.json() as { token: string };
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const a = await app.request('/api/topics/topic-1/presence', {
      method: 'POST', headers, body: JSON.stringify({ client_id: 'client-a', device_name: 'A' }),
    });
    expect((await a.json() as { is_locked: boolean }).is_locked).toBe(false);

    const b = await app.request('/api/topics/topic-1/presence', {
      method: 'POST', headers, body: JSON.stringify({ client_id: 'client-b', device_name: 'B' }),
    });
    const bData = await b.json() as { is_locked: boolean; active_editor?: { client_id: string } };
    expect(bData.is_locked).toBe(true);
    expect(bData.active_editor?.client_id).toBe('client-a');

    const aAgain = await app.request('/api/topics/topic-1/presence', {
      method: 'POST', headers, body: JSON.stringify({ client_id: 'client-a', device_name: 'A' }),
    });
    const aData = await aAgain.json() as { is_locked: boolean };
    expect(aData.is_locked).toBe(false);
  });

  it('handles batch permanent deletion across multiple chunk sizes correctly', async () => {
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: testPassword }),
    });
    const { token } = await loginRes.json() as { token: string };
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Create 30 topics (more than chunk size of 25)
    const topicIds: string[] = [];
    for (let i = 0; i < 30; i++) {
      const createRes = await app.request('/api/topics', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: `批量删除测试主题 ${i + 1}` }),
      });
      const topic = await createRes.json() as { id: string };
      topicIds.push(topic.id);
      // Soft delete it
      await app.request(`/api/topics/${topic.id}`, { method: 'DELETE', headers });
    }

    // Permanently delete all 30 topics in batch
    const batchDeleteRes = await app.request('/api/topics/batch/permanent', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: topicIds }),
    });
    expect(batchDeleteRes.status).toBe(200);
    const batchData = await batchDeleteRes.json() as { success: boolean; count: number };
    expect(batchData.success).toBe(true);
    expect(batchData.count).toBe(30);

    // Verify trash is now empty
    const trashRes = await app.request('/api/topics/trash', { headers });
    const trashList = await trashRes.json() as unknown[];
    expect(trashList.length).toBe(0);
  });

  it('safely handles resource DELETE endpoints idempotently', async () => {
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: testPassword }),
    });
    const { token } = await loginRes.json() as { token: string };
    const headers = { Authorization: `Bearer ${token}` };

    const deleteNonExistentSource = await app.request('/api/sources/non-existent-src-id', {
      method: 'DELETE',
      headers,
    });
    expect(deleteNonExistentSource.status).toBe(200);

    const deleteNonExistentTimeline = await app.request('/api/timeline/non-existent-time-id', {
      method: 'DELETE',
      headers,
    });
    expect(deleteNonExistentTimeline.status).toBe(200);
  });

  it('returns stable paginated published, people, tag and today-focus data', async () => {
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: testPassword }),
    });
    const { token } = await loginRes.json() as { token: string };
    const headers = { Authorization: `Bearer ${token}` };
    const now = new Date().toISOString();

    for (let index = 0; index < 31; index += 1) {
      sqlite.query(`INSERT INTO published_videos (id, title, published_at, updated_at)
        VALUES (?, ?, ?, ?)`).run(`published-${index}`, `归档视频 ${index}`, now, now);
      sqlite.query(`INSERT INTO people (id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?)`).run(`person-${index}`, `人物 ${index}`, now, now);
      sqlite.query(`INSERT INTO topics (id, title, status, created_at, updated_at)
        VALUES (?, ?, 'approved', ?, ?)`).run(`topic-${index}`, `分页选题 ${index}`, now, now);
    }
    sqlite.query(`INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)`)
      .run('tag-pagination', '分页赛道', 'rose', now);
    for (let index = 0; index < 31; index += 1) {
      sqlite.query(`INSERT INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)`)
        .run(`topic-tag-${index}`, `topic-${index}`, 'tag-pagination');
    }

    const publishedPageOne = await app.request('/api/published/page?page=1&page_size=30', { headers });
    const publishedPageTwo = await app.request('/api/published/page?page=2&page_size=30', { headers });
    expect(publishedPageOne.status).toBe(200);
    expect(publishedPageTwo.status).toBe(200);
    expect((await publishedPageOne.json() as { items: unknown[]; total: number; total_pages: number }).items).toHaveLength(30);
    expect(await publishedPageTwo.json()).toMatchObject({ page: 2, total: 31, total_pages: 2 });

    const analyticsPageOne = await app.request('/api/published/analytics?page=1&page_size=30&range=all', { headers });
    const analyticsPageTwo = await app.request('/api/published/analytics?page=2&page_size=30&range=all', { headers });
    expect(analyticsPageOne.status).toBe(200);
    expect(analyticsPageTwo.status).toBe(200);
    const analyticsDataOne = await analyticsPageOne.json() as {
      totalVideos: number;
      ranking_total: number;
      ranking_page: number;
      ranking_page_size: number;
      ranking: unknown[];
    };
    const analyticsDataTwo = await analyticsPageTwo.json() as { ranking: unknown[]; ranking_page: number };
    expect(analyticsDataOne).toMatchObject({
      totalVideos: 31,
      ranking_total: 31,
      ranking_page: 1,
      ranking_page_size: 30,
    });
    expect(analyticsDataOne.ranking).toHaveLength(30);
    expect(analyticsDataTwo.ranking).toHaveLength(1);
    expect(analyticsDataTwo.ranking_page).toBe(2);

    const peopleSearch = await app.request('/api/people/page?page=1&page_size=30&q=人物 3', { headers });
    expect(await peopleSearch.json()).toMatchObject({ total: 2, total_pages: 1 });

    const tagsPage = await app.request('/api/tags/page?page=1&page_size=1', { headers });
    const tagsData = await tagsPage.json() as {
      items: Array<{ stats: { count: number } }>;
      total: number;
      summary: { tagged_topics: number; total_topics: number };
    };
    expect(tagsData.total).toBe(1);
    expect(tagsData.items[0]?.stats.count).toBe(31);
    expect(tagsData.summary).toEqual({ tagged_topics: 31, total_topics: 31 });

    const todayFocus = await app.request('/api/today/focus', { headers });
    const todayData = await todayFocus.json() as { topics: unknown[]; total_active: number };
    expect(todayData.total_active).toBe(31);
    expect(todayData.topics.length).toBeLessThanOrEqual(13);
  });
});
