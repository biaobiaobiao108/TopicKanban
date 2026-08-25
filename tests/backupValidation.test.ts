import { describe, expect, it } from 'bun:test';
import type { BackupData, Topic } from '../src/types';
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
    next_action: '',
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

describe('backup schema validation', () => {
  it('accepts a valid version 2 backup', () => {
    expect(validateBackupData(createBackup())).toMatchObject({ success: true });
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
});
