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
        'id', 'topic_id', 'title', 'is_current', 'current_started_at',
        'completed_at', 'sort_order', 'created_at', 'updated_at',
      ]);
      const currentIndex = sqlite.query("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_topic_todos_current'").get() as { sql: string };
      expect(currentIndex.sql).toMatch(/WHERE is_current\s*=\s*1 AND completed_at IS NULL/);

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
      expect(sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 2 });
      sqlite.query("INSERT INTO commercial_deals (id, title, created_at, updated_at) VALUES ('valid', '有效商单', '2026-08-27', '2026-08-27')").run();
      expect(() => sqlite.query("INSERT INTO commercial_deals (id, title, status, created_at, updated_at) VALUES ('invalid', '非法阶段', 'reviewing', '2026-08-27', '2026-08-27')").run()).toThrow();
    } finally {
      sqlite.close();
      await removeSqliteArtifacts(dbPath);
    }
  });

  it('upgrades a legacy database in place and preserves its current action', async () => {
    const dbPath = temporaryDatabasePath('kanban-legacy-schema');
    const legacy = new Database(dbPath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE topics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        next_action TEXT NOT NULL DEFAULT '',
        next_action_updated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE timeline_events (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );
      CREATE TABLE published_videos (
        id TEXT PRIMARY KEY,
        topic_id TEXT,
        title TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );
      INSERT INTO topics (id, title, next_action, next_action_updated_at, created_at, updated_at)
      VALUES ('legacy-topic', '旧版选题', '整理采访素材', '2026-08-20T00:00:00.000Z', '2026-08-19T00:00:00.000Z', '2026-08-20T00:00:00.000Z');
      INSERT INTO timeline_events (id, topic_id, title, created_at, updated_at)
      VALUES ('legacy-event', 'legacy-topic', '旧版时间线', '2026-08-19T00:00:00.000Z', '2026-08-20T00:00:00.000Z');
    `);
    legacy.close();

    const first = await initializeSqliteDatabase(dbPath, schemaDir);
    try {
      expect(first.sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 2 });
      expect(first.sqlite.query('SELECT target_publish_date, deadline FROM topics WHERE id = ?').get('legacy-topic'))
        .toEqual({ target_publish_date: null, deadline: null });
      expect(first.sqlite.query('SELECT contrast_tag FROM timeline_events WHERE id = ?').get('legacy-event'))
        .toEqual({ contrast_tag: '' });
      expect(first.sqlite.query('SELECT title, is_current FROM topic_todos WHERE topic_id = ?').get('legacy-topic'))
        .toEqual({ title: '整理采访素材', is_current: 1 });
      expect(first.sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commercial_deals'").get())
        .not.toBeNull();
    } finally {
      first.sqlite.close();
    }

    const second = await initializeSqliteDatabase(dbPath, schemaDir);
    try {
      expect(second.sqlite.query('SELECT COUNT(*) AS count FROM topic_todos WHERE topic_id = ?').get('legacy-topic'))
        .toEqual({ count: 1 });
    } finally {
      second.sqlite.close();
      await removeSqliteArtifacts(dbPath);
    }
  });
});
