import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeSqliteDatabase } from '../src/server/adapters/localSqlite';

const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'drizzle/0000_schema.sql'), 'utf8');

describe('Database schema contract', () => {
  it('keeps the single baseline schema aligned with the current business model', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(schemaSql);

      const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as Array<{ name: string }>;
      expect(tables.map((table) => table.name)).toEqual([
        'commercial_deal_activities', 'commercial_deal_topics', 'commercial_deals',
        'draft_citations', 'drafts', 'people', 'person_relationships', 'publish_packages',
        'published_videos', 'sources', 'tags', 'timeline_event_people', 'timeline_events',
        'topic_people', 'topic_tags', 'topics',
      ]);

      const sourceColumns = sqlite.query('PRAGMA table_info(sources)').all() as Array<{ name: string }>;
      expect(sourceColumns.some((column) => column.name === 'type')).toBe(false);

      const timelineColumns = sqlite.query('PRAGMA table_info(timeline_events)').all() as Array<{ name: string }>;
      expect(timelineColumns.some((column) => column.name === 'contrast_tag')).toBe(true);

      const topicColumns = sqlite.query('PRAGMA table_info(topics)').all() as Array<{ name: string }>;
      expect(topicColumns.some((column) => column.name === 'target_publish_date')).toBe(true);
      expect(topicColumns.some((column) => column.name === 'deadline')).toBe(true);

      const publishedTopicColumn = sqlite.query('PRAGMA table_info(published_videos)')
        .all() as Array<{ name: string; notnull: number }>;
      expect(publishedTopicColumn.find((column) => column.name === 'topic_id')?.notnull).toBe(0);

      const commercialDealTableSql = sqlite.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'commercial_deals'").get() as { sql: string };
      expect(commercialDealTableSql.sql).toContain("status IN ('communicating', 'producing', 'delivered', 'archived')");
    } finally {
      sqlite.close();
    }
  });

  it('initializes a fresh local database from the baseline without historical migration files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-schema-'));
    const dbPath = path.join(tempDir, 'fresh.db');
    const { sqlite } = await initializeSqliteDatabase(dbPath, path.resolve(process.cwd(), 'drizzle'));
    try {
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'publish_packages'").get()).not.toBeNull();
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commercial_deals'").get()).not.toBeNull();
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commercial_deal_topics'").get()).not.toBeNull();
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commercial_deal_activities'").get()).not.toBeNull();

      const migrations = sqlite.query('SELECT name FROM _schema_migrations ORDER BY name').all() as Array<{ name: string }>;
      expect(migrations).toEqual([{ name: '0000_schema.sql' }]);
      sqlite.query("INSERT INTO commercial_deals (id, title, created_at, updated_at) VALUES ('valid', '有效商单', '2026-08-27', '2026-08-27')").run();
      expect(() => sqlite.query("INSERT INTO commercial_deals (id, title, status, created_at, updated_at) VALUES ('invalid', '非法阶段', 'reviewing', '2026-08-27', '2026-08-27')").run()).toThrow();
    } finally {
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
