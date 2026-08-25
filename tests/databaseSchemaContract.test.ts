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

  it('repairs legacy local schemas before recording migrations', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-schema-'));
    const dbPath = path.join(tempDir, 'legacy.db');
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE topics (id TEXT PRIMARY KEY);
      CREATE TABLE sources (id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'fact');
      CREATE TABLE timeline_events (id TEXT PRIMARY KEY);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE published_videos (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        bvid TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        views INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        coins INTEGER NOT NULL DEFAULT 0,
        favorites INTEGER NOT NULL DEFAULT 0,
        comments INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
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

      const publishedColumns = sqlite.query('PRAGMA table_info(published_videos)').all() as Array<{ name: string; notnull: number }>;
      expect(publishedColumns.find((column) => column.name === 'topic_id')?.notnull).toBe(0);
      sqlite.query('INSERT INTO topics (id) VALUES (?)').run('legacy-topic');
      sqlite.query(`INSERT INTO publish_packages
        (id, topic_id, title_simplified, title_traditional, description_simplified, description_traditional, content_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('legacy-package', 'legacy-topic', '简体', '繁體', '', '', '{}', '2026-08-25T00:00:00.000Z');
      expect(sqlite.query('SELECT topic_id FROM publish_packages WHERE id = ?').get('legacy-package')).toEqual({ topic_id: 'legacy-topic' });
      sqlite.query(`INSERT INTO published_videos
        (id, topic_id, title, published_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('published-standalone', null, '独立归档视频', '2026-08-25', '2026-08-25T00:00:00.000Z');
      expect(sqlite.query('SELECT id FROM published_videos WHERE id = ?').get('published-standalone')).toEqual({ id: 'published-standalone' });

      const kvTable = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_kv_store'").get();
      expect(kvTable).not.toBeNull();

      const migrations = sqlite.query('SELECT name FROM _schema_migrations ORDER BY name').all() as Array<{ name: string }>;
      expect(migrations.map((migration) => migration.name)).toContain('0004_remove_settings_table.sql');
      expect(migrations.map((migration) => migration.name)).toContain('0005_create_publish_packages.sql');
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'publish_packages'").get()).not.toBeNull();
    } finally {
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
