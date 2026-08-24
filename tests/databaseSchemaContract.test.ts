import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeSqliteDatabase } from '../src/server/adapters/localSqlite';

const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'drizzle/0000_schema.sql'), 'utf8');

describe('Database schema contract', () => {
  it('keeps the baseline schema aligned with the current business model', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(schemaSql);

      const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as Array<{ name: string }>;
      expect(tables.map((table) => table.name)).toEqual([
        'draft_citations', 'drafts', 'people', 'person_relationships', 'published_videos',
        'sources', 'tags', 'timeline_event_people', 'timeline_events', 'topic_people',
        'topic_tags', 'topics',
      ]);

      const sourceColumns = sqlite.query('PRAGMA table_info(sources)').all() as Array<{ name: string }>;
      expect(sourceColumns.some((column) => column.name === 'type')).toBe(false);

      const timelineColumns = sqlite.query('PRAGMA table_info(timeline_events)').all() as Array<{ name: string }>;
      expect(timelineColumns.some((column) => column.name === 'contrast_tag')).toBe(true);

      const publishedTopicColumn = sqlite.query('PRAGMA table_info(published_videos)')
        .all() as Array<{ name: string; notnull: number }>;
      expect(publishedTopicColumn.find((column) => column.name === 'topic_id')?.notnull).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it('removes legacy settings and source type from an existing local database', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-schema-'));
    const dbPath = path.join(tempDir, 'legacy.db');
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE topics (id TEXT PRIMARY KEY);
      CREATE TABLE sources (id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'fact');
      CREATE TABLE timeline_events (id TEXT PRIMARY KEY);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    legacy.close();

    const { sqlite } = initializeSqliteDatabase(dbPath, path.resolve(process.cwd(), 'drizzle'));
    try {
      const settingsTable = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get();
      expect(settingsTable).toBeNull();

      const sourceColumns = sqlite.query('PRAGMA table_info(sources)').all() as Array<{ name: string }>;
      expect(sourceColumns.some((column) => column.name === 'type')).toBe(false);

      const timelineColumns = sqlite.query('PRAGMA table_info(timeline_events)').all() as Array<{ name: string }>;
      expect(timelineColumns.some((column) => column.name === 'contrast_tag')).toBe(true);

      const kvTable = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_kv_store'").get();
      expect(kvTable).not.toBeNull();

      const migrations = sqlite.query('SELECT name FROM _schema_migrations ORDER BY name').all() as Array<{ name: string }>;
      expect(migrations.map((migration) => migration.name)).toContain('0004_remove_settings_table.sql');
    } finally {
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
