import { Database } from 'bun:sqlite';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolvePath } from './bunPaths';

export const CURRENT_SCHEMA_VERSION = 1;

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
const REQUIRED_TRIGGERS = ['topic_search_ai', 'topic_search_au', 'topic_search_ad'] as const;

function schemaObjectExists(database: Database, type: 'table' | 'index', name: string): boolean {
  return Boolean(database.query('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1').get(type, name));
}

function schemaTriggerExists(database: Database, name: string): boolean {
  return Boolean(database.query("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ? LIMIT 1").get(name));
}

function readSchemaVersion(database: Database): number {
  const versionRow = database.query('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return Number(versionRow?.user_version || 0);
}

function schemaVersionMismatch(actualVersion: number): Error {
  return new Error(
    `SQLite schema version mismatch: expected baseline v${CURRENT_SCHEMA_VERSION}, found v${actualVersion}. ` +
      'The existing database was left untouched; restore a database created from the current schema baseline.',
  );
}

function assertSchemaObjects(
  database: Database,
  requiredTables: readonly string[],
  requiredIndexes: readonly string[],
  requiredTriggers: readonly string[],
): void {
  const missingTables = requiredTables.filter(name => !schemaObjectExists(database, 'table', name));
  if (missingTables.length > 0) {
    throw new Error(
      `SQLite schema is incomplete: missing ${missingTables.join(', ')}. ` +
        'The existing database was left untouched; recover it from a compatible backup or release.',
    );
  }

  const missingIndexes = requiredIndexes.filter(name => !schemaObjectExists(database, 'index', name));
  if (missingIndexes.length > 0) {
    throw new Error(
      `SQLite schema is incomplete: missing indexes ${missingIndexes.join(', ')}. ` +
        'The existing database was left untouched; recover it from a compatible backup or release.',
    );
  }

  const missingTriggers = requiredTriggers.filter(name => !schemaTriggerExists(database, name));
  if (missingTriggers.length > 0) {
    throw new Error(
      `SQLite schema is incomplete: missing triggers ${missingTriggers.join(', ')}. ` +
        'The existing database was left untouched; recover it from a compatible backup or release.',
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

export async function initializeSqliteDatabase(dbFilePath: string, schemaPath?: string): Promise<Database> {
  if (dbFilePath !== ':memory:') await mkdir(dirname(dbFilePath), { recursive: true });

  const database = new Database(dbFilePath);
  try {
    database.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA synchronous = NORMAL;
    `);

    const tableCheck = database
      .query("SELECT count(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .get() as { count: number };
    const actualVersion = readSchemaVersion(database);
    const resolvedSchemaPath = schemaPath || resolvePath(process.cwd(), 'database/schema.sql');
    if (tableCheck.count === 0 && actualVersion === 0) {
      const schema = Bun.file(resolvedSchemaPath);
      if (!(await schema.exists())) {
        throw new Error(`SQLite schema baseline not found: ${resolvedSchemaPath}`);
      }
      const schemaSql = await schema.text();
      const initializeBaseline = database.transaction(() => {
        const currentTableCount = database
          .query("SELECT count(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
          .get() as { count: number };
        if (currentTableCount.count === 0 && readSchemaVersion(database) === 0) {
          database.exec(schemaSql);
        }
      });
      initializeBaseline.immediate();
    }
    assertCurrentSchema(database);
  } catch (error) {
    database.close();
    throw error;
  }

  return database;
}
