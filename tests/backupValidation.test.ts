import { describe, expect, it } from 'bun:test';
import type { BackupData, Topic, TopicTodo } from '../src/types';
import { validateBackupData } from '../src/lib/backupValidation';
import { Database } from 'bun:sqlite';
import { SqliteDatabase } from '../src/server/sqlite';
import { createApp } from '../src/server/app';

function createBackup(overrides: Partial<BackupData> = {}): BackupData {
  return {
    version: '5.0',
    export_at: '2026-01-01T00:00:00.000Z',
    topics: [],
    sources: [],
    reports: [],
    people: [],
    relationships: [],
    drafts: [],
    citations: [],
    tags: [],
    published: [],
    publish_packages: [],
    commercial_deals: [],
    commercial_deal_topics: [],
    commercial_deal_activities: [],
    todos: [],
    settings: { reading_speed: 280, theme: 'light' },
    ...overrides,
  };
}

function createTopic(id: string): Topic {
  return {
    id,
    title: `选题 ${id}`,
    summary: '',
    hook: '',
    storyline: '',
    why_now: '',
    status: 'inbox',
    priority: 'medium',
    score_character: 0,
    score_conflict: 0,
    score_contrast: 0,
    score_material: 0,
    score_story: 0,
    is_pinned: 0,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function createTodo(id: string, topicId: string, overrides: Partial<TopicTodo> = {}): TopicTodo {
  return {
    id,
    topic_id: topicId,
    title: `待办 ${id}`,
    status: 'todo',
    is_current: 0,
    current_started_at: null,
    completed_at: null,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('backup schema validation', () => {
  it('accepts a valid current backup with Markdown draft content', () => {
    expect(validateBackupData(createBackup())).toMatchObject({ success: true });
  });

  it('accepts individual JSON and HTML draft fields larger than 2 MiB within the total limit', () => {
    const topic = createTopic('topic-large-draft');
    const draft = {
      id: 'draft-large', topic_id: topic.id, title: '', content_markdown: '', content_json: '',
      content_html: '', word_count: 0, version: 1, updated_at: '2026-01-01T00:00:00.000Z',
    };
    for (const content of [
      { content_json: JSON.stringify({ text: 'x'.repeat(2 * 1024 * 1024 + 100) }) },
      { content_html: `<p>${'x'.repeat(2 * 1024 * 1024 + 100)}</p>` },
    ]) {
      expect(validateBackupData(createBackup({ topics: [topic], drafts: [{ ...draft, ...content }] })).success).toBe(true);
    }
    const tooLarge = validateBackupData(createBackup({ topics: [topic], drafts: [{
      ...draft, content_markdown: 'x'.repeat(2 * 1024 * 1024), content_html: 'x'.repeat(2 * 1024 * 1024 + 1),
    }] }));
    expect(tooLarge.success).toBe(false);
    if (!tooLarge.success) expect(tooLarge.error).toContain('草稿正文超过 4 MiB');
    expect(validateBackupData(createBackup({ topics: [topic], drafts: [{
      ...draft, content_markdown: '中'.repeat(4 * 1024 * 1024 / 3 + 1),
    }] })).success).toBe(false);
  });

  it('can restore an exported draft whose saved JSON exceeds 2 MiB', async () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
      const db = new SqliteDatabase(sqlite);
      const app = createApp({ DB: db, APP_PASSWORD: 'backup-test-password' });
      const login = await app.request('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'backup-test-password' }),
      });
      const { token } = await login.json() as { token: string };
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const topicResponse = await app.request('/api/topics', {
        method: 'POST', headers, body: JSON.stringify({ title: '大文案往返恢复' }),
      });
      const { id } = await topicResponse.json() as { id: string };
      const contentJson = JSON.stringify({ type: 'doc', text: 'x'.repeat(2 * 1024 * 1024 + 100) });
      const save = await app.request(`/api/topics/${id}/draft`, {
        method: 'PUT', headers,
        body: JSON.stringify({ content_markdown: '', content_json: contentJson, content_html: '', base_version: 0 }),
      });
      expect(save.status).toBe(200);
      const exportResponse = await app.request('/api/backup', { headers });
      const backup = (await exportResponse.json()).data;
      expect(validateBackupData(backup).success).toBe(true);
      const restore = await app.request('/api/backup', { method: 'PUT', headers, body: JSON.stringify({ data: backup }) });
      expect(restore.status).toBe(200);
      const restoredDraft = await (await app.request(`/api/topics/${id}/draft`, { headers })).json();
      expect(restoredDraft.content_json).toBe(contentJson);
    } finally {
      sqlite.close();
    }
  });

  it('rejects backups from older versions', () => {
    expect(validateBackupData({ ...createBackup(), version: '4.0' } as unknown as BackupData).success).toBe(false);
    expect(validateBackupData({ ...createBackup(), version: '3.0' } as unknown as BackupData).success).toBe(false);
  });

  it('requires the current complete structure and rejects legacy timeline fields', () => {
    const { reports: _reports, ...withoutReports } = createBackup();
    expect(validateBackupData(withoutReports).success).toBe(false);
    expect(validateBackupData({ ...createBackup(), timeline: [] } as unknown as BackupData).success).toBe(false);
    expect(validateBackupData(createBackup({
      citations: [{
        id: 'citation-legacy', topic_id: 'topic-1', reference_type: 'timeline' as never, reference_id: 'event-1',
        reference_title: '旧时间线', reference_snapshot: '', quoted_text: '',
        verification_status: 'unverified', created_at: '',
      }],
    })).success).toBe(false);
  });

  it('rejects invalid recycle-bin timestamps while accepting valid ISO timestamps', () => {
    const invalid = validateBackupData(createBackup({
      topics: [{ ...createTopic('topic-invalid-trash-date'), deleted_at: 'not-a-timestamp' }],
    }));
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error).toContain('topics.0.deleted_at');

    expect(validateBackupData(createBackup({
      topics: [{ ...createTopic('topic-valid-trash-date'), deleted_at: '2026-01-02T03:04:05.000Z' }],
    })).success).toBe(true);
  });

  it('does not expose hardcoded workflow preferences as backup settings', () => {
    const result = validateBackupData(createBackup({
      settings: { reading_speed: 280, theme: 'light', voiceover_cues: ['自定义气口'] } as never,
    }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.settings).not.toHaveProperty('stale_action_days');
      expect(result.data.settings).not.toHaveProperty('trash_retention_days');
      expect(result.data.settings).not.toHaveProperty('public_base_url');
      expect(result.data.settings).not.toHaveProperty('typewriter_mode_default');
      expect(result.data.settings).not.toHaveProperty('voiceover_cues');
    }
  });

  it('rejects version 3 backups because they do not include the Markdown draft contract', () => {
    const result = validateBackupData({ ...createBackup(), version: '3.0' } as unknown as BackupData);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('version');
  });

  it('validates Todo references and the single current action constraint', () => {
    const topic = createTopic('topic-todo');
    const current = createTodo('todo-current', topic.id, {
      status: 'in_progress',
      is_current: 1,
      current_started_at: '2026-01-02T00:00:00.000Z',
    });
    expect(validateBackupData(createBackup({ topics: [topic], todos: [current] })).success).toBe(true);

    const otherInProgress = createTodo('todo-in-progress', topic.id, { status: 'in_progress', sort_order: 2 });
    expect(validateBackupData(createBackup({ topics: [topic], todos: [current, otherInProgress] })).success).toBe(true);

    const duplicateCurrent = validateBackupData(createBackup({
      topics: [topic],
      todos: [current, createTodo('todo-duplicate', topic.id, { status: 'in_progress', is_current: 1, sort_order: 2 })],
    }));
    expect(duplicateCurrent.success).toBe(false);
    if (!duplicateCurrent.success) expect(duplicateCurrent.error).toContain('一个选题只能有一个当前 Todo');

  });

  it('requires the first in-progress Todo to be the current action', () => {
    const topic = createTopic('topic-todo-order');
    const result = validateBackupData(createBackup({
      topics: [topic],
      todos: [
        createTodo('todo-later', topic.id, { status: 'in_progress', sort_order: 2, is_current: 1 }),
        createTodo('todo-first', topic.id, { status: 'in_progress', sort_order: 1 }),
      ],
    }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('进行中首项必须是当前行动');
  });

  it('requires current_started_at to exist only on the current action', () => {
    const topic = createTopic('topic-current-time');
    const result = validateBackupData(createBackup({
      topics: [topic],
      todos: [createTodo('todo-without-current-time', topic.id, { status: 'in_progress', is_current: 1 })],
    }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('当前行动开始时间必须且只能记录在当前行动上');
  });

  it('rejects malformed entity fields before import', () => {
    const backup = createBackup() as unknown as Record<string, unknown>;
    backup.sources = [{ id: 'source-1', topic_id: 'topic-1' }];

    const result = validateBackupData(backup);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('sources.0.title');
  });

  it('rejects references to topics that are not present', () => {
    const backup = createBackup({
      sources: [{
        id: 'source-1', topic_id: 'missing-topic', title: '资料', content: '', url: '',
        platform: 'bilibili', author: '', published_at: '', verification_status: 'confirmed', notes: '',
        created_at: '', updated_at: '',
      }],
    });

    const result = validateBackupData(backup);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('引用了不存在的选题');
  });

  it('rejects duplicate IDs and invalid draft JSON', () => {
    const topic = createTopic('topic-1');
    const result = validateBackupData(createBackup({
      topics: [topic, { ...topic }],
      drafts: [{
        id: 'draft-1', topic_id: topic.id, title: '', content_markdown: '# 文案', content_json: '{bad json',
        content_html: '<p>正文</p>', word_count: 2, version: 1, updated_at: topic.updated_at,
      }],
    }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('重复 ID');
      expect(result.error).toContain('不是合法 JSON');
    }
  });

  it('accepts dated sources and supported theme presets', () => {
    const topic = createTopic('topic-1');
    const result = validateBackupData(createBackup({
      topics: [topic],
      sources: [{
        id: 'source-1',
        topic_id: topic.id,
        title: '关键反转',
        content: '情节反转描述',
        url: '',
        platform: 'other',
        author: '',
        published_at: '',
        event_date: '2026-05-01',
        date_precision: 'exact',
        verification_status: 'confirmed',
        sort_order: 1,
        notes: '',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      }],
      settings: {
        reading_speed: 300,
        theme: 'light',
      },
    }));

    expect(result.success).toBe(true);
  });

  it('rejects removed theme values instead of remapping them', () => {
    const result = validateBackupData(createBackup({
      settings: { reading_speed: 300, theme: 'nordic_frost' as never },
    }));

    expect(result.success).toBe(false);
  });

  it('accepts persisted publish packages and keeps the field shape bounded', () => {
    const topic = createTopic('topic-1');
    const result = validateBackupData(createBackup({
      topics: [topic],
      publish_packages: [{
        id: 'package-1',
        topic_id: topic.id,
        version: 2,
        title_simplified: '简体标题',
        title_traditional: '繁體標題',
        description_simplified: '简体简介',
        description_traditional: '繁體簡介',
        title_traditional_auto: true,
        description_traditional_auto: false,
        content_json: JSON.stringify({
          title_candidates: ['候选标题'],
          cover_text: '封面短句',
          tags: ['标签'],
          chapters: [],
          pinned_comment: '',
          included_source_ids: [],
        }),
        updated_at: topic.updated_at,
      }],
    }));

    expect(result.success).toBe(true);
  });

  it('accepts commercial deals with topic relations and published video links', () => {
    const topic = createTopic('topic-deal');
    const result = validateBackupData(createBackup({
      topics: [topic],
      published: [{
        id: 'published-deal', topic_id: topic.id, title: '商单成片', url: '', bvid: '',
        published_at: '2026-01-03', views: 0, likes: 0, coins: 0, favorites: 0, comments: 0,
        notes: '', updated_at: '2026-01-03T00:00:00.000Z',
      }],
      commercial_deals: [{
        id: 'deal-1', title: '品牌定制视频', brand_name: '测试品牌', agency_name: '', contact_name: '',
        contact_channel: '', source: 'brand_direct', deliverable_type: 'custom_video', status: 'delivered',
        contract_status: 'signed', contract_summary: '已确认需求', brief: '商单摘要', requirements: '', restrictions: '',
        amount_cents: 100000, payment_status: 'unpaid', paid_at: null, delivery_due_date: '2026-01-01',
        publish_date: '2026-01-03', next_action: '等待回款', next_action_due_date: null,
        published_video_id: 'published-deal', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z',
      }],
      commercial_deal_topics: [{
        id: 'deal-1:topic-deal', deal_id: 'deal-1', topic_id: topic.id, relation_role: 'primary',
        created_at: '2026-01-01T00:00:00.000Z',
      }],
      commercial_deal_activities: [{
        id: 'deal-activity-1', deal_id: 'deal-1', kind: 'payment', content: '已提交回款申请',
        created_at: '2026-01-03T00:00:00.000Z',
      }],
    }));

    expect(result.success).toBe(true);
  });

  it('rejects commercial relations that point to missing entities', () => {
    const result = validateBackupData(createBackup({
      commercial_deals: [{
        id: 'deal-1', title: '品牌合作', brand_name: '', agency_name: '', contact_name: '', contact_channel: '',
        source: 'other', deliverable_type: 'other', status: 'communicating', contract_status: 'not_started',
        contract_summary: '', brief: '', requirements: '', restrictions: '', amount_cents: 0,
        payment_status: 'unpaid', paid_at: null, delivery_due_date: null, publish_date: null, next_action: '',
        next_action_due_date: null, published_video_id: null, created_at: '', updated_at: '',
      }],
      commercial_deal_topics: [{
        id: 'deal-1:missing', deal_id: 'deal-1', topic_id: 'missing-topic', relation_role: 'primary', created_at: '',
      }],
    }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('引用了不存在的选题');
  });

  it('rejects malformed commercial calendar dates', () => {
    const result = validateBackupData(createBackup({
      commercial_deals: [{
        id: 'deal-invalid-date', title: '品牌合作', brand_name: '', agency_name: '', contact_name: '', contact_channel: '',
        source: 'other', deliverable_type: 'other', status: 'communicating', contract_status: 'not_started',
        contract_summary: '', brief: '', requirements: '', restrictions: '', amount_cents: 0,
        payment_status: 'unpaid', paid_at: null, delivery_due_date: '2026-02-30', publish_date: null,
        next_action: '', next_action_due_date: null, published_video_id: null, created_at: '', updated_at: '',
      }],
    }));
    expect(result.success).toBe(false);
  });
});
