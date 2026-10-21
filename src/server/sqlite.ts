import { Database } from 'bun:sqlite';
import { joinPath, resolvePath } from './bunPaths';

export const CURRENT_SCHEMA_VERSION = 6;

const QUICK_DROP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const QUICK_DROP_MAX_ITEMS = 100;

const REQUIRED_TABLES = [
  'topics',
  'topic_todos',
  'sources',
  'topic_reports',
  'people',
  'person_relationships',
  'topic_people',
  'drafts',
  'draft_citations',
  'tags',
  'topic_tags',
  'published_videos',
  'publish_packages',
  'commercial_deals',
  'commercial_deal_topics',
  'commercial_deal_activities',
  'quick_drops',
  'topic_search',
] as const;
const REQUIRED_INDEXES = [
  'idx_topics_target_publish_date',
  'idx_topics_deadline',
  'idx_topic_todos_topic_status_order',
  'idx_topic_todos_current',
  'idx_sources_topic_sort',
  'idx_sources_topic_event_date',
  'idx_topics_status_sort',
  'idx_topics_updated_at',
  'idx_topics_deleted_at',
  'idx_sources_topic_id',
  'idx_drafts_topic_id',
  'idx_draft_citations_topic_id',
  'idx_draft_citations_reference',
  'idx_tags_name_unique',
  'idx_topic_tags_unique',
  'idx_topic_tags_tag_id',
  'idx_topic_people_unique',
  'idx_topic_people_person_id',
  'idx_relationships_people',
  'idx_published_topic_id',
  'idx_published_page_order',
  'idx_publish_packages_updated_at',
  'idx_commercial_deals_status',
  'idx_commercial_deals_due_date',
  'idx_commercial_deals_publish_date',
  'idx_commercial_deals_next_action_due_date',
  'idx_commercial_deals_payment',
  'idx_commercial_deals_published_video',
  'idx_commercial_deal_topics_topic',
  'idx_commercial_deal_topics_deal',
  'idx_commercial_deal_primary_topic',
  'idx_commercial_deal_activities_deal',
  'idx_topics_active_updated',
  'idx_topics_active_focus',
  'idx_topic_todos_current_age',
  'idx_quick_drops_expiry_order',
] as const;
const REQUIRED_TRIGGERS = [
  'topic_search_ai',
  'topic_search_au',
  'topic_search_ad',
] as const;

function schemaObjectExists(database: Database, type: 'table' | 'index', name: string): boolean {
  return Boolean(database.query('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1').get(type, name));
}

function schemaTriggerExists(database: Database, name: string): boolean {
  return Boolean(database.query('SELECT 1 FROM sqlite_master WHERE type = \'trigger\' AND name = ? LIMIT 1').get(name));
}

function readSchemaVersion(database: Database): number {
  const versionRow = database.query('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return Number(versionRow?.user_version || 0);
}

function schemaVersionMismatch(actualVersion: number): Error {
  return new Error(
    `SQLite schema version mismatch: expected baseline v${CURRENT_SCHEMA_VERSION}, found v${actualVersion}. `
    + 'Only the v5 to v6 migration is supported; older or newer databases must be upgraded from a compatible release.',
  );
}

function assertSchemaObjects(
  database: Database,
  requiredTables: readonly string[],
  requiredIndexes: readonly string[],
  requiredTriggers: readonly string[],
): void {
  const missingTables = requiredTables.filter((name) => !schemaObjectExists(database, 'table', name));
  if (missingTables.length > 0) {
    throw new Error(
      `SQLite schema is incomplete: missing ${missingTables.join(', ')}. `
      + 'The existing database was left untouched; recover it from a compatible backup or release.',
    );
  }

  const missingIndexes = requiredIndexes.filter((name) => !schemaObjectExists(database, 'index', name));
  if (missingIndexes.length > 0) {
    throw new Error(
      `SQLite schema is incomplete: missing indexes ${missingIndexes.join(', ')}. `
      + 'The existing database was left untouched; recover it from a compatible backup or release.',
    );
  }

  const missingTriggers = requiredTriggers.filter((name) => !schemaTriggerExists(database, name));
  if (missingTriggers.length > 0) {
    throw new Error(
      `SQLite schema is incomplete: missing triggers ${missingTriggers.join(', ')}. `
      + 'The existing database was left untouched; recover it from a compatible backup or release.',
    );
  }
}

function assertCurrentSchema(database: Database): void {
  const actualVersion = readSchemaVersion(database);
  if (actualVersion !== CURRENT_SCHEMA_VERSION) {
    throw schemaVersionMismatch(actualVersion);
  }

  assertSchemaObjects(database, REQUIRED_TABLES, REQUIRED_INDEXES, REQUIRED_TRIGGERS);
}

type LegacyKvDropRow = {
  key: string;
  value: string;
  expires_at: number | null;
};

type MigratedQuickDrop = {
  id: string;
  content: string;
  url: string | null;
  source: string;
  created_at: string;
  expires_at: number;
};

function migrateLegacyQuickDrops(database: Database, now: number): void {
  if (!schemaObjectExists(database, 'table', '_kv_store')) return;

  const legacyRows = database.query(`SELECT key, value, expires_at FROM _kv_store
    WHERE key LIKE 'drop:%'`).all() as LegacyKvDropRow[];
  const migrated = legacyRows.flatMap((row): MigratedQuickDrop[] => {
    const id = row.key.slice('drop:'.length);
    if (!id || (row.expires_at !== null && row.expires_at <= now)) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      // A malformed old payload is still recoverable as plain text.
      parsed = row.value;
    }

    const item = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
    const content = typeof item?.content === 'string'
      ? item.content
      : typeof item?.text === 'string'
        ? item.text
        : typeof parsed === 'string'
          ? parsed
          : row.value;
    const parsedCreatedAt = typeof item?.created_at === 'string' ? Date.parse(item.created_at) : Number.NaN;
    const createdAt = Number.isFinite(parsedCreatedAt)
      ? new Date(parsedCreatedAt).toISOString()
      : new Date(now).toISOString();

    return [{
      id,
      content,
      url: typeof item?.url === 'string' && item.url.length > 0 ? item.url : null,
      source: typeof item?.source === 'string' ? item.source : '手机快捷投递',
      created_at: createdAt,
      // All old quick drops were written with a seven-day TTL. A null expiry
      // was technically allowed by AppKV, so give those recoverable records a
      // fresh seven-day lifetime when moving them into the typed table.
      expires_at: row.expires_at ?? now + QUICK_DROP_TTL_MS,
    }];
  });

  migrated.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  if (migrated.length > QUICK_DROP_MAX_ITEMS) {
    throw new Error(
      `Cannot migrate ${migrated.length} unexpired quick drops: the supported maximum is ${QUICK_DROP_MAX_ITEMS}. `
      + 'Legacy KV data has been left unchanged.',
    );
  }

  const insert = database.query(`INSERT INTO quick_drops (id, content, url, source, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  migrated.forEach((item) => {
    insert.run(item.id, item.content, item.url, item.source, item.created_at, item.expires_at);
  });

  // Preserve app_settings and any other legacy KV data; only the old quick-drop
  // namespace is retired after its rows have been copied successfully.
  database.query("DELETE FROM _kv_store WHERE key LIKE 'drop:%' OR key = 'quick_drops_index'").run();
}

function migrateV5ToV6(database: Database): void {
  const v5Tables = REQUIRED_TABLES.filter((name) => name !== 'quick_drops');
  const v5Indexes = REQUIRED_INDEXES.filter((name) => name !== 'idx_quick_drops_expiry_order');

  const migration = database.transaction(() => {
    // A second server process may have completed this step while this process
    // waited for the write lock.
    const currentVersion = readSchemaVersion(database);
    if (currentVersion === CURRENT_SCHEMA_VERSION) return;
    if (currentVersion !== 5) throw schemaVersionMismatch(currentVersion);

    // Refuse an incomplete v5 database before making any DDL or data changes.
    assertSchemaObjects(database, v5Tables, v5Indexes, REQUIRED_TRIGGERS);

    database.exec(`
      CREATE TABLE quick_drops (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        url TEXT,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_quick_drops_expiry_order
        ON quick_drops(expires_at, created_at DESC, id DESC);
    `);

    migrateLegacyQuickDrops(database, Date.now());
    database.exec('PRAGMA user_version = 6;');
  });

  migration.immediate();
}

type SchemaMigration = {
  sourceVersion: number;
  targetVersion: number;
  migrate: (database: Database) => void;
};

const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  { sourceVersion: 5, targetVersion: 6, migrate: migrateV5ToV6 },
];

function migrateSchema(database: Database): void {
  let version = readSchemaVersion(database);
  if (version > CURRENT_SCHEMA_VERSION) throw schemaVersionMismatch(version);

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = SCHEMA_MIGRATIONS.find((step) => step.sourceVersion === version);
    if (!migration || migration.targetVersion !== version + 1) throw schemaVersionMismatch(version);

    migration.migrate(database);
    const migratedVersion = readSchemaVersion(database);
    if (migratedVersion !== migration.targetVersion) throw schemaVersionMismatch(migratedVersion);
    version = migratedVersion;
  }
}

export async function initializeSqliteDatabase(dbFilePath: string, schemaPath?: string): Promise<Database> {
  const dbFile = Bun.file(dbFilePath);
  if (!(await dbFile.exists())) {
    await Bun.write(dbFilePath, '', { createPath: true });
  }

  const database = new Database(dbFilePath);
  try {
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;
    `);

    const tableCheck = database.query("SELECT count(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as { count: number };
    const actualVersion = readSchemaVersion(database);
    const resolvedSchemaPath = schemaPath || resolvePath(process.cwd(), 'database/schema.sql');
    if (tableCheck.count === 0 && actualVersion === 0) {
      const schema = Bun.file(resolvedSchemaPath);
      if (!(await schema.exists())) {
        throw new Error(`SQLite schema baseline not found: ${resolvedSchemaPath}`);
      }
      const schemaSql = await schema.text();
      database.transaction(() => database.exec(schemaSql))();
    } else {
      migrateSchema(database);
    }
    assertCurrentSchema(database);
  } catch (error) {
    database.close();
    throw error;
  }

  return database;
}
