import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { BackupData, Topic, TopicTodo } from '../src/types';
import { validateBackupData } from '../src/lib/backupValidation';
import {
  assertBackupImportWithinLimits,
  exportAllData,
  getBackupImportSummary,
  MAX_IMPORT_STATEMENTS,
  replaceAllData,
} from '../src/server/repositories/backup';
import { SqliteDatabase } from '../src/server/sqlite';

function createBackup(overrides: Partial<BackupData> = {}): BackupData {
  return {
    version: '4.0',
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
    publish_packages: [],
    commercial_deals: [],
    commercial_deal_topics: [],
    commercial_deal_activities: [],
    todos: [],
    settings: { reading_speed: 280, theme: 'light' },
    ...overrides,
  };
}

describe('backup import limits', () => {
  it('counts fixed writes and relation writes before importing', () => {
    const backup = createBackup({
      topics: [{
        id: 'topic-1', title: '选题', summary: '', hook: '', storyline: '', why_now: '',
        status: 'inbox', priority: 'medium', score_character: 0,
        score_conflict: 0, score_contrast: 0, score_material: 0, score_story: 0,
        is_pinned: 0, sort_order: 1, created_at: '', updated_at: '',
        tags: [{ id: 'tag-1', name: '标签' }],
        people: [{ id: 'person-1', name: '人物', aliases: '', avatar_url: '', description: '', identity: '', platform_accounts: '', quotes: '', notes: '', created_at: '', updated_at: '' }],
      }],
    });

    expect(getBackupImportSummary(backup)).toMatchObject({ topics: 1, statements: 23 });
  });

  it('accepts a backup at the atomic statement limit', () => {
    const backup = createBackup({
      tags: Array.from({ length: MAX_IMPORT_STATEMENTS - 20 }, (_, index) => ({ id: `tag-${index}`, name: `标签 ${index}` })),
    });

    expect(assertBackupImportWithinLimits(backup).statements).toBe(MAX_IMPORT_STATEMENTS);
  });

  it('rejects a backup exceeding the atomic statement limit before writes begin', () => {
    const backup = createBackup({
      tags: Array.from({ length: MAX_IMPORT_STATEMENTS - 19 }, (_, index) => ({ id: `tag-${index}`, name: `标签 ${index}` })),
    });

    expect(() => assertBackupImportWithinLimits(backup)).toThrow('超过单次原子恢复上限');
  });

  it('round trips version 3 Todo states and each lane order', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    sqlite.exec('CREATE TABLE _kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)');
    const now = '2026-09-01T00:00:00.000Z';
    const topic: Topic = {
      id: 'topic-board', title: '看板备份', summary: '', hook: '', storyline: '', why_now: '',
      status: 'scripting', priority: 'medium', score_character: 0, score_conflict: 0,
      score_contrast: 0, score_material: 0, score_story: 0, is_pinned: 0, sort_order: 1,
      created_at: now, updated_at: now,
    };
    const makeTodo = (id: string, status: TopicTodo['status'], sort_order: number, extra: Partial<TopicTodo> = {}): TopicTodo => ({
      id, topic_id: topic.id, title: id, status,
      is_current: extra.is_current ?? 0,
      current_started_at: extra.current_started_at ?? null,
      completed_at: extra.completed_at ?? null,
      sort_order, created_at: now, updated_at: now,
      ...extra,
    });
    const todos = [
      makeTodo('todo-later', 'todo', 2),
      makeTodo('todo-first', 'todo', 1),
      makeTodo('doing-current', 'in_progress', 1, { is_current: 1, current_started_at: now }),
      makeTodo('doing-next', 'in_progress', 2),
      makeTodo('done-later', 'completed', 2, { completed_at: now }),
      makeTodo('done-first', 'completed', 1, { completed_at: now }),
    ];
    const backup = createBackup({ topics: [topic], todos });

    try {
      await replaceAllData(new SqliteDatabase(sqlite), backup);
      const exported = await exportAllData(new SqliteDatabase(sqlite));
      expect(exported.version).toBe('5.0');
      expect(exported.todos.map((todo) => [todo.id, todo.status, todo.sort_order])).toEqual([
        ['todo-first', 'todo', 1], ['todo-later', 'todo', 2],
        ['doing-current', 'in_progress', 1], ['doing-next', 'in_progress', 2],
        ['done-first', 'completed', 1], ['done-later', 'completed', 2],
      ]);
      expect(exported.topics[0].current_todo).toMatchObject({ id: 'doing-current', current_started_at: now });
    } finally {
      sqlite.close();
    }
  });

  it('restores version 4 timeline events as sources and remaps timeline citations', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    sqlite.exec('CREATE TABLE _kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)');
    const now = '2026-09-01T00:00:00.000Z';
    const topic: Topic = {
      id: 'topic-legacy-timeline', title: '旧时间线备份', summary: '', hook: '', storyline: '', why_now: '',
      status: 'scripting', priority: 'medium', score_character: 0, score_conflict: 0,
      score_contrast: 0, score_material: 0, score_story: 0, is_pinned: 0, sort_order: 1,
      created_at: now, updated_at: now,
    };
    const backup = createBackup({
      topics: [topic],
      sources: [{
        id: 'legacy-event-1', topic_id: topic.id, title: '现有素材', content: '现有素材内容', url: '', platform: 'news',
        author: '', published_at: '', verification_status: 'confirmed', notes: '', event_date: '', date_precision: 'unknown',
        sort_order: 5, created_at: now, updated_at: now,
      }],
      timeline: [{
        id: 'legacy-event-1', topic_id: topic.id, title: '时间线节点', description: '节点描述', event_date: '2024-03',
        date_precision: 'year_month', verification_status: 'unverified', sort_order: 6,
        contrast_tag: '公开说法与记录不符', person_ids: [], created_at: now, updated_at: now,
      }],
      citations: [{
        id: 'citation-legacy-timeline', topic_id: topic.id, reference_type: 'timeline', reference_id: 'legacy-event-1',
        reference_title: '时间线节点', reference_snapshot: '【2024-03】时间线节点：节点描述', quoted_text: '节点描述',
        verification_status: 'unverified', created_at: now,
      }],
    });

    try {
      const validated = validateBackupData(backup);
      expect(validated.success).toBe(true);
      if (!validated.success) throw new Error(validated.error);
      await replaceAllData(new SqliteDatabase(sqlite), validated.data);
      const sources = sqlite.query('SELECT id, title, content, event_date, date_precision, verification_status, sort_order, notes FROM sources ORDER BY sort_order').all() as Array<Record<string, unknown>>;
      expect(sources).toHaveLength(2);
      expect(sources[0]).toMatchObject({
        id: 'legacy-event-1', title: '现有素材', content: '现有素材内容',
      });
      expect(sources[1]).toMatchObject({
        id: expect.any(String), title: '时间线节点', content: '节点描述', event_date: '2024-03',
        date_precision: 'year_month', verification_status: 'unverified', sort_order: 6,
        notes: '原时间线对比标签：公开说法与记录不符',
      });
      expect(sources[1].id).not.toBe('legacy-event-1');
      const citation = sqlite.query('SELECT reference_type, reference_id, reference_snapshot, quoted_text FROM draft_citations').get() as Record<string, string>;
      expect(citation).toMatchObject({
        reference_type: 'source', reference_id: sources[1].id, reference_snapshot: '节点描述', quoted_text: '节点描述',
      });
      expect(() => sqlite.query(`INSERT INTO draft_citations (
        id, topic_id, reference_type, reference_id, reference_title, created_at
      ) VALUES ('bad-timeline-type', ?, 'timeline', 'missing', '旧类型', ?)`).run(topic.id, now)).toThrow();
    } finally {
      sqlite.close();
    }
  });

  it('rolls back the complete restore when a later write violates a constraint', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    sqlite.exec(`CREATE TABLE _kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)`);
    sqlite.query('INSERT INTO _kv_store (key, value) VALUES (?, ?)').run('app_settings', JSON.stringify({ theme: 'dark' }));
    sqlite.query('INSERT INTO _kv_store (key, value) VALUES (?, ?)').run('share:old-share', JSON.stringify({ topic_id: 'old-topic' }));
    sqlite.query(`INSERT INTO topics (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run('old-topic', '旧数据', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    const backup = createBackup({
      tags: [
        ...Array.from({ length: 39 }, (_, index) => ({ id: `new-tag-${index}`, name: `新标签 ${index}` })),
        { id: 'new-tag-0', name: '重复标签 ID' },
      ],
    });

    try {
      await expect(replaceAllData(new SqliteDatabase(sqlite), backup)).rejects.toThrow();
      expect(sqlite.query('SELECT id, title FROM topics WHERE id = ?').get('old-topic')).toEqual({ id: 'old-topic', title: '旧数据' });
      expect(sqlite.query('SELECT COUNT(*) AS count FROM tags').get()).toEqual({ count: 0 });
      expect(sqlite.query('SELECT value FROM _kv_store WHERE key = ?').get('app_settings')).toEqual({ value: JSON.stringify({ theme: 'dark' }) });
      expect(sqlite.query('SELECT key FROM _kv_store WHERE key = ?').get('share:old-share')).toEqual({ key: 'share:old-share' });
    } finally {
      sqlite.close();
    }
  });
});
