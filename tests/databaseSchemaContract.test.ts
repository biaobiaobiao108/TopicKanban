import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { joinPath, resolvePath } from '../src/server/bunPaths';
import { initializeSqliteDatabase } from '../src/server/sqlite';

const schemaSql = await Bun.file(joinPath(process.cwd(), 'drizzle/0000_schema.sql')).text();
const schemaDir = resolvePath(process.cwd(), 'drizzle');

function temporaryDatabasePath(prefix: string): string {
  const tempRoot = Bun.env.TMPDIR || Bun.env.TEMP || Bun.env.TMP || process.cwd();
  return joinPath(tempRoot, `${prefix}-${crypto.randomUUID()}.db`);
}

async function removeSqliteArtifacts(dbPath: string): Promise<void> {
  await Promise.all(['', '-wal', '-shm', '-journal'].map(async (suffix) => {
    const file = Bun.file(`${dbPath}${suffix}`);
    if (await file.exists()) await file.unlink();
  }));
}

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
        'published_videos', 'quick_drops', 'sources', 'tags', 'topic_people', 'topic_reports',
        'topic_search', 'topic_search_config', 'topic_search_content',
        'topic_search_data', 'topic_search_docsize', 'topic_search_idx', 'topic_tags',
        'topic_todos', 'topics',
      ]);

      const sourceColumns = sqlite.query('PRAGMA table_info(sources)').all() as Array<{ name: string }>;
      expect(sourceColumns.some((column) => column.name === 'type')).toBe(false);
      expect(sourceColumns.some((column) => column.name === 'event_date')).toBe(true);
      expect(sourceColumns.some((column) => column.name === 'date_precision')).toBe(true);
      expect(sourceColumns.some((column) => column.name === 'sort_order')).toBe(true);

      const topicColumns = sqlite.query('PRAGMA table_info(topics)').all() as Array<{ name: string }>;
      expect(topicColumns.some((column) => column.name === 'target_publish_date')).toBe(true);
      expect(topicColumns.some((column) => column.name === 'deadline')).toBe(true);
      expect(topicColumns.some((column) => column.name === 'next_action')).toBe(false);
      expect(topicColumns.some((column) => column.name === 'next_action_updated_at')).toBe(false);
      expect(topicColumns.some((column) => column.name === 'next_action_deferred_until')).toBe(false);

      const todoColumns = sqlite.query('PRAGMA table_info(topic_todos)').all() as Array<{ name: string }>;
      expect(todoColumns.map((column) => column.name)).toEqual([
        'id', 'topic_id', 'title', 'status', 'is_current', 'current_started_at',
        'completed_at', 'sort_order', 'created_at', 'updated_at',
      ]);
      const currentIndex = sqlite.query("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_topic_todos_current'").get() as { sql: string };
      expect(currentIndex.sql).toMatch(/WHERE is_current\s*=\s*1 AND completed_at IS NULL/);
      const todoTable = sqlite.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'topic_todos'").get() as { sql: string };
      expect(todoTable.sql).toContain("(is_current = 1) = (current_started_at IS NOT NULL)");
      const statusIndex = sqlite.query("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_topic_todos_topic_status_order'").get() as { sql: string };
      expect(statusIndex.sql).toContain('topic_id, status, sort_order');

      const publishedTopicColumn = sqlite.query('PRAGMA table_info(published_videos)')
        .all() as Array<{ name: string; notnull: number }>;
      expect(publishedTopicColumn.find((column) => column.name === 'topic_id')?.notnull).toBe(0);

      const commercialDealTableSql = sqlite.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'commercial_deals'").get() as { sql: string };
      expect(commercialDealTableSql.sql).toContain("status IN ('communicating', 'producing', 'delivered', 'archived')");
      const expectedPerformanceIndexes = [
        'idx_commercial_deals_publish_date',
        'idx_commercial_deals_next_action_due_date',
        'idx_published_page_order',
      ];
      const performanceIndexes = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as Array<{ name: string }>;
      for (const indexName of expectedPerformanceIndexes) {
        expect(performanceIndexes.some((index) => index.name === indexName)).toBe(true);
      }
      const citationTableSql = sqlite.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'draft_citations'").get() as { sql: string };
      expect(citationTableSql.sql).toContain("reference_type IN ('source', 'report', 'person', 'outline')");
      expect(citationTableSql.sql).not.toContain("'timeline'");
    } finally {
      sqlite.close();
    }
  });

  it('initializes a fresh local database from the current baseline schema', async () => {
    const dbPath = temporaryDatabasePath('kanban-schema');
    const { sqlite } = await initializeSqliteDatabase(dbPath, schemaDir);
    try {
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'publish_packages'").get()).not.toBeNull();
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commercial_deals'").get()).not.toBeNull();
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commercial_deal_topics'").get()).not.toBeNull();
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commercial_deal_activities'").get()).not.toBeNull();
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'topic_reports'").get()).not.toBeNull();

      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_schema_migrations'").get()).toBeNull();
      expect(sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 6 });
      sqlite.query("INSERT INTO commercial_deals (id, title, created_at, updated_at) VALUES ('valid', '有效商单', '2026-08-27', '2026-08-27')").run();
      expect(() => sqlite.query("INSERT INTO commercial_deals (id, title, status, created_at, updated_at) VALUES ('invalid', '非法阶段', 'reviewing', '2026-08-27', '2026-08-27')").run()).toThrow();
    } finally {
      sqlite.close();
      await removeSqliteArtifacts(dbPath);
    }
  });

  it('adds query indexes to an existing current-version database without changing its schema version', async () => {
    const dbPath = temporaryDatabasePath('kanban-existing-indexes');
    const existing = new Database(dbPath);
    existing.exec(schemaSql);
    existing.exec(`
      DROP INDEX idx_published_page_order;
      DROP INDEX idx_commercial_deals_publish_date;
      DROP INDEX idx_commercial_deals_next_action_due_date;
    `);
    existing.close();

    try {
      const { sqlite } = await initializeSqliteDatabase(dbPath, schemaDir);
      try {
        const indexes = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'index'")
          .all() as Array<{ name: string }>;
        for (const indexName of [
          'idx_published_page_order',
          'idx_commercial_deals_publish_date',
          'idx_commercial_deals_next_action_due_date',
        ]) {
          expect(indexes.some((index) => index.name === indexName)).toBe(true);
        }
        expect(sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 6 });
      } finally {
        sqlite.close();
      }
    } finally {
      await removeSqliteArtifacts(dbPath);
    }
  });

  it('rejects unsupported database schema versions', async () => {
    const dbPath = temporaryDatabasePath('kanban-outdated-schema');
    const outdated = new Database(dbPath);
    outdated.exec(`
      CREATE TABLE topics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      PRAGMA user_version = 1;
    `);
    outdated.close();

    try {
      await expect(initializeSqliteDatabase(dbPath, schemaDir)).rejects.toThrow('SQLite schema version mismatch: expected baseline v6');
      const unchanged = new Database(dbPath);
      try {
        expect(unchanged.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'quick_drops'").get()).toBeNull();
      } finally {
        unchanged.close();
      }
    } finally {
      await removeSqliteArtifacts(dbPath);
    }
  });
});
