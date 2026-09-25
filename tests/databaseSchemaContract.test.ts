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
        'published_videos', 'sources', 'tags', 'timeline_event_people', 'timeline_events',
        'topic_people', 'topic_search', 'topic_search_config', 'topic_search_content',
        'topic_search_data', 'topic_search_docsize', 'topic_search_idx', 'topic_tags',
        'topic_todos', 'topics',
      ]);

      const sourceColumns = sqlite.query('PRAGMA table_info(sources)').all() as Array<{ name: string }>;
      expect(sourceColumns.some((column) => column.name === 'type')).toBe(false);

      const timelineColumns = sqlite.query('PRAGMA table_info(timeline_events)').all() as Array<{ name: string }>;
      expect(timelineColumns.some((column) => column.name === 'contrast_tag')).toBe(true);

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

      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_schema_migrations'").get()).toBeNull();
      expect(sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 3 });
      sqlite.query("INSERT INTO commercial_deals (id, title, created_at, updated_at) VALUES ('valid', '有效商单', '2026-08-27', '2026-08-27')").run();
      expect(() => sqlite.query("INSERT INTO commercial_deals (id, title, status, created_at, updated_at) VALUES ('invalid', '非法阶段', 'reviewing', '2026-08-27', '2026-08-27')").run()).toThrow();
    } finally {
      sqlite.close();
      await removeSqliteArtifacts(dbPath);
    }
  });

  it('rejects a database outside the current baseline instead of migrating it', async () => {
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
      await expect(initializeSqliteDatabase(dbPath, schemaDir)).rejects.toThrow('no longer migrates legacy databases');
    } finally {
      await removeSqliteArtifacts(dbPath);
    }
  });
});
