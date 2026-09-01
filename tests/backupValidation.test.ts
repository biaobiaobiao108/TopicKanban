import { describe, expect, it } from 'bun:test';
import type { BackupData, Topic, TopicTodo } from '../src/types';
import { validateBackupData } from '../src/lib/backupValidation';

function createBackup(overrides: Partial<BackupData> = {}): BackupData {
  return {
    version: '2.0',
    export_at: '2026-01-01T00:00:00.000Z',
    topics: [],
    sources: [],
    timeline: [],
    people: [],
    relationships: [],
    drafts: [],
    citations: [],
    tags: [],
    published: [],
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
    notes: '',
    due_date: '2026-01-05',
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
  it('accepts a valid version 2 backup', () => {
    expect(validateBackupData(createBackup())).toMatchObject({ success: true });
  });

  it('validates Todo references, dates, and the single current action constraint', () => {
    const topic = createTopic('topic-todo');
    const current = createTodo('todo-current', topic.id, {
      is_current: 1,
      current_started_at: '2026-01-02T00:00:00.000Z',
    });
    expect(validateBackupData(createBackup({ topics: [topic], todos: [current] })).success).toBe(true);

    const duplicateCurrent = validateBackupData(createBackup({
      topics: [topic],
      todos: [current, createTodo('todo-duplicate', topic.id, { is_current: 1 })],
    }));
    expect(duplicateCurrent.success).toBe(false);
    if (!duplicateCurrent.success) expect(duplicateCurrent.error).toContain('一个选题只能有一个当前 Todo');

    const invalidDate = validateBackupData(createBackup({
      topics: [topic],
      todos: [createTodo('todo-invalid-date', topic.id, { due_date: '2026-02-31' })],
    }));
    expect(invalidDate.success).toBe(false);
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
        id: 'draft-1', topic_id: topic.id, title: '', content_json: '{bad json',
        content_html: '<p>正文</p>', word_count: 2, version: 1, updated_at: topic.updated_at,
      }],
    }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('重复 ID');
      expect(result.error).toContain('不是合法 JSON');
    }
  });

  it('accepts timeline events with contrast_tag and theme presets', () => {
    const topic = createTopic('topic-1');
    const result = validateBackupData(createBackup({
      topics: [topic],
      timeline: [{
        id: 'time-1',
        topic_id: topic.id,
        title: '关键反转',
        description: '情节反转描述',
        event_date: '2026-05-01',
        date_precision: 'exact',
        verification_status: 'confirmed',
        sort_order: 1,
        contrast_tag: '荒诞反差',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      }],
      settings: {
        reading_speed: 300,
        theme: 'nordic_frost',
        reviewer_branding: '老编辑审稿',
      },
    }));

    expect(result.success).toBe(true);
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
