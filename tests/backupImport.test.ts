import { describe, expect, it } from 'bun:test';
import type { BackupData } from '../src/types';
import {
  assertBackupImportWithinLimits,
  getBackupImportSummary,
  MAX_IMPORT_STATEMENTS,
} from '../src/server/database';

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

describe('backup import limits', () => {
  it('counts fixed writes and relation writes before importing', () => {
    const backup = createBackup({
      topics: [{
        id: 'topic-1', title: '选题', summary: '', hook: '', storyline: '', why_now: '',
        status: 'inbox', priority: 'medium', next_action: '', score_character: 0,
        score_conflict: 0, score_contrast: 0, score_material: 0, score_story: 0,
        is_pinned: 0, sort_order: 1, created_at: '', updated_at: '',
        tags: [{ id: 'tag-1', name: '标签' }],
        people: [{ id: 'person-1', name: '人物', aliases: '', avatar_url: '', description: '', identity: '', platform_accounts: '', quotes: '', notes: '', created_at: '', updated_at: '' }],
      }],
    });

    expect(getBackupImportSummary(backup)).toMatchObject({ topics: 1, statements: 18 });
  });

  it('accepts a backup at the atomic statement limit', () => {
    const backup = createBackup({
      tags: Array.from({ length: MAX_IMPORT_STATEMENTS - 15 }, (_, index) => ({ id: `tag-${index}`, name: `标签 ${index}` })),
    });

    expect(assertBackupImportWithinLimits(backup).statements).toBe(MAX_IMPORT_STATEMENTS);
  });

  it('rejects a backup exceeding the atomic statement limit before writes begin', () => {
    const backup = createBackup({
      tags: Array.from({ length: MAX_IMPORT_STATEMENTS - 14 }, (_, index) => ({ id: `tag-${index}`, name: `标签 ${index}` })),
    });

    expect(() => assertBackupImportWithinLimits(backup)).toThrow('超过单次原子恢复上限');
  });
});
