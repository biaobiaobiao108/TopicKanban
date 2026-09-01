import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/server/app';
import { AppKV } from '../src/server/appKv';
import { SqliteDatabase } from '../src/server/sqlite';
import { NativeApp } from '../src/server/native';
import type { ApiBindings } from '../src/server/apiShared';

describe('Bun Server Integration (Local SQLite & API)', () => {
  let sqlite: Database;
  let app: NativeApp;
  const testPassword = 'test_secret_pass';
  const testDropToken = 'test_drop_token';
  const publicBaseUrl = 'https://kanban.example.com';

  beforeEach(() => {
    sqlite = new Database(':memory:');
    // Load schema
    const schemaFile = path.resolve(process.cwd(), 'drizzle/0000_schema.sql');
    const schemaSql = fs.readFileSync(schemaFile, 'utf-8');
    sqlite.exec(schemaSql);

    const db = new SqliteDatabase(sqlite);
    const kv = new AppKV(db);

    const bindings: ApiBindings = {
      DB: db,
      KV: kv,
      APP_PASSWORD: testPassword,
      QUICK_DROP_TOKEN: testDropToken,
      PUBLIC_BASE_URL: publicBaseUrl,
    };

    app = createApp(bindings);
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
      runtime: string;
      public_base_url: string;
      database: { tables: number; message: string };
      kv: { connected: boolean; message: string };
    };
    expect(healthData.status).toBe('online');
    expect(healthData.runtime).toBe('bun');
    expect(healthData.public_base_url).toBe(publicBaseUrl);
    expect(healthData.database.tables).toBeGreaterThan(0);
    expect(healthData.database.message).toContain('SQLite');
    expect(healthData.kv.message).toContain('SQLite');

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
        initial_todo: { title: '核对核心争议原片' },
      }),
    });
    expect(createRes.status).toBe(201);
    const topic = await createRes.json() as { id: string; title: string; current_todo?: { title: string } };
    expect(topic.title).toBe('测试爆款人物解说');
    expect(topic.current_todo).toMatchObject({ title: '核对核心争议原片' });

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

    const invalidPersonRes = await app.request('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: '恶意头像人物', avatar_url: 'http://127.0.0.1/avatar.png' }),
    });
    expect(invalidPersonRes.status).toBe(400);

    const personRes = await app.request('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: '安全头像人物', avatar_url: 'https://images.example.com/avatar.png' }),
    });
    expect(personRes.status).toBe(201);
    const person = await personRes.json() as { id: string };
    const invalidPersonPatchRes = await app.request(`/api/people/${person.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ avatar_url: 'javascript:alert(1)' }),
    });
    expect(invalidPersonPatchRes.status).toBe(400);

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

    const duplicateUrlDropRes = await app.request('/api/inbox/quick-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Quick-Drop-Token': testDropToken,
      },
      body: JSON.stringify({
        content: '\n值得回看 https://x.com/home https://x.com/home\n',
        url: 'https://x.com/home https://x.com/home',
      }),
    });
    expect(duplicateUrlDropRes.status).toBe(201);
    const duplicateUrlDrop = await duplicateUrlDropRes.json() as { item: { content: string; url?: string } };
    expect(duplicateUrlDrop.item.content).toBe('\n值得回看 https://x.com/home https://x.com/home\n');
    expect(duplicateUrlDrop.item.url).toBe('https://x.com/home');

    const urlOnlyDropRes = await app.request('/api/inbox/quick-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Quick-Drop-Token': testDropToken,
      },
      body: JSON.stringify({ url: 'https://example.com/a https://example.com/a' }),
    });
    expect(urlOnlyDropRes.status).toBe(201);
    const urlOnlyDrop = await urlOnlyDropRes.json() as { item: { content: string; url?: string } };
    expect(urlOnlyDrop.item.content).toBe('');
    expect(urlOnlyDrop.item.url).toBe('https://example.com/a');

    const contentOnlyUrlRes = await app.request('/api/inbox/quick-drop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Quick-Drop-Token': testDropToken,
      },
      body: JSON.stringify({ content: 'https://example.com/from-content' }),
    });
    expect(contentOnlyUrlRes.status).toBe(201);
    const contentOnlyUrl = await contentOnlyUrlRes.json() as { item: { content: string; url?: string } };
    expect(contentOnlyUrl.item.content).toBe('https://example.com/from-content');
    expect(contentOnlyUrl.item.url).toBeUndefined();

    const invalidQuickDropUrls = [
      'file:///etc/passwd',
      'http://127.0.0.1:8787/',
      'this is not a URL',
    ];
    for (const url of invalidQuickDropUrls) {
      const invalidUrlRes = await app.request('/api/inbox/quick-drop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Quick-Drop-Token': testDropToken,
        },
        body: JSON.stringify({ content: '备注', url }),
      });
      expect(invalidUrlRes.status).toBe(400);
    }

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
    })).json() as { data: { publish_packages?: Array<{ topic_id: string; title_simplified: string; title_traditional_auto: boolean }>; todos?: Array<{ topic_id: string; title: string }> } };
    expect(fullBackupPayload.data.publish_packages?.[0]).toMatchObject({
      topic_id: topic.id,
      title_simplified: '简体发布标题',
      title_traditional_auto: true,
    });
    expect(fullBackupPayload.data.todos).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic_id: topic.id, title: '核对核心争议原片' }),
    ]));
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

  it('runs the commercial deal workflow without changing topic status', async () => {
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: testPassword }),
    });
    const { token } = await loginRes.json() as { token: string };
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const topicResponse = await app.request('/api/topics', {
      method: 'POST', headers,
      body: JSON.stringify({ title: '商单主选题', summary: '主选题摘要', status: 'inbox' }),
    });
    const topic = await topicResponse.json() as { id: string; status: string };
    const relatedTopicResponse = await app.request('/api/topics', {
      method: 'POST', headers,
      body: JSON.stringify({ title: '商单系列选题', status: 'approved' }),
    });
    const relatedTopic = await relatedTopicResponse.json() as { id: string };

    const invalidDealResponse = await app.request('/api/deals', {
      method: 'POST', headers,
      body: JSON.stringify({ title: '非法金额商单', amount_cents: -1 }),
    });
    expect(invalidDealResponse.status).toBe(400);

    const invalidStatusResponse = await app.request('/api/deals', {
      method: 'POST', headers,
      body: JSON.stringify({ title: '旧阶段商单', status: 'reviewing' }),
    });
    expect(invalidStatusResponse.status).toBe(400);

    const createDealResponse = await app.request('/api/deals', {
      method: 'POST', headers,
      body: JSON.stringify({
        title: '春季品牌定制视频', brand_name: '测试品牌', contact_name: '小林',
        source: 'brand_direct', deliverable_type: 'custom_video',
        brief: '围绕主选题做一条定制视频', amount_cents: 125000,
        delivery_due_date: '2026-01-01', next_action: '',
      }),
    });
    expect(createDealResponse.status).toBe(201);
    const deal = await createDealResponse.json() as { id: string; amount_cents: number; status: string; topics: unknown[] };
    expect(deal.amount_cents).toBe(125000);
    expect(deal.status).toBe('communicating');
    expect(deal.topics).toHaveLength(0);

    const createAuxiliaryDeal = async (title: string, status: string) => {
      const response = await app.request('/api/deals', {
        method: 'POST', headers,
        body: JSON.stringify({ title, status, source: 'other', deliverable_type: 'other' }),
      });
      expect(response.status).toBe(201);
      return await response.json() as { id: string };
    };
    await createAuxiliaryDeal('分页制作商单', 'producing');
    await createAuxiliaryDeal('分页归档商单', 'archived');
    const activeDealsPage = await app.request('/api/deals/page?page=1&page_size=1&scope=active', { headers });
    expect(activeDealsPage.status).toBe(200);
    expect(await activeDealsPage.json()).toMatchObject({ page: 1, page_size: 1, total: 2, total_pages: 2 });
    const allDealsPage = await app.request('/api/deals/page?page=2&page_size=2&scope=all', { headers });
    expect(allDealsPage.status).toBe(200);
    expect(await allDealsPage.json()).toMatchObject({ page: 2, page_size: 2, total: 3, total_pages: 2 });

    const bindResponse = await app.request(`/api/deals/${deal.id}/topics`, {
      method: 'PUT', headers,
      body: JSON.stringify({ primary_topic_id: topic.id, related_topic_ids: [relatedTopic.id] }),
    });
    expect(bindResponse.status).toBe(200);
    expect((await bindResponse.json() as { topics: Array<{ topic_id: string; relation_role: string }> }).topics).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic_id: topic.id, relation_role: 'primary' }),
      expect.objectContaining({ topic_id: relatedTopic.id, relation_role: 'related' }),
    ]));

    const topicDealsResponse = await app.request(`/api/topics/${topic.id}/deals`, { headers });
    expect(topicDealsResponse.status).toBe(200);
    expect(await topicDealsResponse.json()).toEqual([expect.objectContaining({ id: deal.id, relation_role: 'primary' })]);

    const statusResponse = await app.request(`/api/deals/${deal.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ status: 'producing' }),
    });
    expect(statusResponse.status).toBe(200);
    const invalidUpdateStatusResponse = await app.request(`/api/deals/${deal.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ status: 'scheduled' }),
    });
    expect(invalidUpdateStatusResponse.status).toBe(400);
    const unchangedTopic = await app.request(`/api/topics/${topic.id}`, { headers });
    expect((await unchangedTopic.json() as { status: string }).status).toBe('inbox');

    const focusResponse = await app.request('/api/deals/focus', { headers });
    expect(focusResponse.status).toBe(200);
    expect((await focusResponse.json() as { due_items: Array<{ id: string }> }).due_items).toEqual(expect.arrayContaining([expect.objectContaining({ id: deal.id })]));

    const activityResponse = await app.request(`/api/deals/${deal.id}/activities`, {
      method: 'POST', headers,
      body: JSON.stringify({ kind: 'note', content: '客户确认脚本方向，等待交付。' }),
    });
    expect(activityResponse.status).toBe(201);

    sqlite.query(`INSERT INTO published_videos (id, title, published_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run('deal-published-video', '商单成片', '2026-01-02', '2026-01-02T00:00:00.000Z');
    const linkResponse = await app.request(`/api/deals/${deal.id}/link-published`, {
      method: 'POST', headers,
      body: JSON.stringify({ published_video_id: 'deal-published-video' }),
    });
    expect(linkResponse.status).toBe(200);

    await app.request(`/api/deals/${deal.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ status: 'delivered' }),
    });
    const unpaidFocusResponse = await app.request('/api/deals/focus', { headers });
    expect((await unpaidFocusResponse.json() as { unpaid_items: Array<{ id: string }> }).unpaid_items).toEqual([expect.objectContaining({ id: deal.id })]);

    const replaceResponse = await app.request(`/api/deals/${deal.id}/topics`, {
      method: 'PUT', headers,
      body: JSON.stringify({ primary_topic_id: relatedTopic.id, related_topic_ids: [topic.id] }),
    });
    expect(replaceResponse.status).toBe(200);
    expect((await replaceResponse.json() as { topics: Array<{ topic_id: string; relation_role: string }> }).topics).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic_id: relatedTopic.id, relation_role: 'primary' }),
      expect.objectContaining({ topic_id: topic.id, relation_role: 'related' }),
    ]));

    const unlinkResponse = await app.request(`/api/deals/${deal.id}/topics`, {
      method: 'PUT', headers,
      body: JSON.stringify({ primary_topic_id: null, related_topic_ids: [] }),
    });
    expect(unlinkResponse.status).toBe(200);
    expect((await unlinkResponse.json() as { topics: unknown[] }).topics).toHaveLength(0);

    const paidResponse = await app.request(`/api/deals/${deal.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ payment_status: 'paid', paid_at: '2026-01-03' }),
    });
    expect(paidResponse.status).toBe(200);
    expect((await paidResponse.json() as { payment_status: string }).payment_status).toBe('paid');

    const deleteTargetResponse = await app.request('/api/deals', {
      method: 'POST', headers,
      body: JSON.stringify({ title: '待删除商单', status: 'communicating' }),
    });
    const deleteTarget = await deleteTargetResponse.json() as { id: string };
    await app.request(`/api/deals/${deleteTarget.id}/topics`, {
      method: 'PUT', headers,
      body: JSON.stringify({ primary_topic_id: topic.id, related_topic_ids: [] }),
    });
    await app.request(`/api/deals/${deleteTarget.id}/activities`, {
      method: 'POST', headers,
      body: JSON.stringify({ content: '删除前保留的活动记录' }),
    });
    sqlite.query(`INSERT INTO published_videos (id, title, published_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run('delete-target-video', '不应被删除的视频', '2026-01-04', '2026-01-04T00:00:00.000Z');
    await app.request(`/api/deals/${deleteTarget.id}/link-published`, {
      method: 'POST', headers,
      body: JSON.stringify({ published_video_id: 'delete-target-video' }),
    });
    const deleteResponse = await app.request(`/api/deals/${deleteTarget.id}`, { method: 'DELETE', headers });
    expect(deleteResponse.status).toBe(204);
    expect(await app.request(`/api/deals/${deleteTarget.id}`, { headers })).toHaveProperty('status', 404);
    expect(sqlite.query('SELECT COUNT(*) AS count FROM commercial_deal_topics WHERE deal_id = ?').get(deleteTarget.id)).toEqual({ count: 0 });
    expect(sqlite.query('SELECT COUNT(*) AS count FROM commercial_deal_activities WHERE deal_id = ?').get(deleteTarget.id)).toEqual({ count: 0 });
    expect(sqlite.query('SELECT id FROM topics WHERE id = ?').get(topic.id)).toEqual({ id: topic.id });
    expect(sqlite.query('SELECT id FROM published_videos WHERE id = ?').get('delete-target-video')).toEqual({ id: 'delete-target-video' });
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
    expect(todayData.topics).toHaveLength(31);
  });
});
