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

    expect(getBackupImportSummary(backup)).toMatchObject({ topics: 1, statements: 22 });
  });

  it('accepts a backup at the atomic statement limit', () => {
    const backup = createBackup({
      tags: Array.from({ length: MAX_IMPORT_STATEMENTS - 19 }, (_, index) => ({ id: `tag-${index}`, name: `标签 ${index}` })),
    });

    expect(assertBackupImportWithinLimits(backup).statements).toBe(MAX_IMPORT_STATEMENTS);
  });

  it('rejects a backup exceeding the atomic statement limit before writes begin', () => {
    const backup = createBackup({
      tags: Array.from({ length: MAX_IMPORT_STATEMENTS - 18 }, (_, index) => ({ id: `tag-${index}`, name: `标签 ${index}` })),
    });

    expect(() => assertBackupImportWithinLimits(backup)).toThrow('超过单次原子恢复上限');
  });

  it('round trips Todo states and each lane order', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
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

  it('restores current-format dated sources and citations without rewriting them', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    const now = '2026-09-01T00:00:00.000Z';
    const topic: Topic = {
      id: 'topic-current-backup', title: '当前格式备份', summary: '', hook: '', storyline: '', why_now: '',
      status: 'scripting', priority: 'medium', score_character: 0, score_conflict: 0,
      score_contrast: 0, score_material: 0, score_story: 0, is_pinned: 0, sort_order: 1,
      created_at: now, updated_at: now,
    };
    const source = {
      id: 'source-current-backup', topic_id: topic.id, title: '带日期的资料', content: '公开资料内容',
      url: 'https://example.com/source', platform: 'news' as const, author: '', published_at: '',
      verification_status: 'confirmed' as const, notes: '', event_date: '2026-08-20', date_precision: 'exact' as const,
      sort_order: 1, created_at: now, updated_at: now,
    };
    const backup = createBackup({
      topics: [topic],
      sources: [source],
      citations: [{
        id: 'citation-current-backup', topic_id: topic.id, reference_type: 'source', reference_id: source.id,
        reference_title: source.title, reference_snapshot: source.content, quoted_text: source.content,
        verification_status: 'confirmed', created_at: now,
      }],
    });

    try {
      const validated = validateBackupData(backup);
      expect(validated.success).toBe(true);
      if (!validated.success) throw new Error(validated.error);
      await replaceAllData(new SqliteDatabase(sqlite), validated.data);

      const exported = await exportAllData(new SqliteDatabase(sqlite));
      expect(exported.version).toBe('5.0');
      expect(exported.reports).toEqual([]);
      expect(exported).not.toHaveProperty('timeline');
      expect(exported.sources[0]).toMatchObject({
        id: source.id, event_date: source.event_date, date_precision: source.date_precision,
      });
      expect(exported.citations[0]).toMatchObject({
        reference_type: 'source', reference_id: source.id, reference_snapshot: source.content,
      });
    } finally {
      sqlite.close();
    }
  });

  it('rolls back the complete restore when a later write violates a constraint', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    sqlite.query(`INSERT INTO quick_drops (id, content, source, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run('keep-drop', '保留快投', 'test', '2026-01-01T00:00:00.000Z', Date.now() + 60_000);
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
      expect(sqlite.query('SELECT id, content FROM quick_drops WHERE id = ?').get('keep-drop')).toEqual({ id: 'keep-drop', content: '保留快投' });
    } finally {
      sqlite.close();
    }
  });
});
