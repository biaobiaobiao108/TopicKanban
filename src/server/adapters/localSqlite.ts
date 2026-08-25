import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface BunSqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  values(...params: unknown[]): unknown[][];
  columns(): Array<{ name: string }>;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface BunSqliteDatabase {
  query(query: string): BunSqliteStatement;
  exec(query: string): void;
  transaction<T>(callback: (statements: D1PreparedStatement[]) => T): (statements: D1PreparedStatement[]) => T;
  close(): void;
}

export interface LocalD1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: {
    changes: number;
    last_row_id: number;
    duration: number;
  };
}

export class LocalPreparedStatement implements D1PreparedStatement {
  private stmt: BunSqliteStatement;
  private boundValues: unknown[];
  private query: string;

  constructor(stmt: BunSqliteStatement, query: string, boundValues: unknown[] = []) {
    this.stmt = stmt;
    this.query = query;
    this.boundValues = boundValues;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new LocalPreparedStatement(this.stmt, this.query, values) as unknown as D1PreparedStatement;
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const row = this.stmt.get(...this.boundValues) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) return (row[colName] as T) ?? null;
    return row as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const start = performance.now();
    const info = this.stmt.run(...this.boundValues);
    return {
      results: [] as T[],
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        duration: performance.now() - start,
        served_by: 'local-bun-sqlite',
        rows_read: 0,
        rows_written: info.changes,
        size_after: 0,
      },
    } as unknown as D1Result<T>;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const start = performance.now();
    const rows = this.stmt.all(...this.boundValues) as T[];
    return {
      results: rows,
      success: true,
      meta: {
        changes: 0,
        last_row_id: 0,
        duration: performance.now() - start,
        served_by: 'local-bun-sqlite',
        rows_read: rows.length,
        rows_written: 0,
        size_after: 0,
      },
    } as unknown as D1Result<T>;
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<any> {
    const rows = this.stmt.values(...this.boundValues) as T[];
    if (options?.columnNames) {
      const colNames = this.stmt.columns().map((c) => c.name);
      return [colNames, ...rows];
    }
    return rows;
  }

  // Internal execution method for batch transactions
  _executeSync(): { results: unknown[]; meta: { changes: number; last_row_id: number; duration: number } } {
    const start = performance.now();
    const isSelect = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.query);
    if (isSelect) {
      const rows = this.stmt.all(...this.boundValues);
      return {
        results: rows,
        meta: { changes: 0, last_row_id: 0, duration: performance.now() - start },
      };
    }
    const info = this.stmt.run(...this.boundValues);
    return {
      results: [],
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        duration: performance.now() - start,
      },
    };
  }
}

export class LocalD1Database implements D1Database {
  public sqlite: BunSqliteDatabase;

  constructor(sqlite: BunSqliteDatabase) {
    this.sqlite = sqlite;
  }

  prepare(query: string): D1PreparedStatement {
    const stmt = this.sqlite.query(query);
    return new LocalPreparedStatement(stmt, query) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const executeBatch = this.sqlite.transaction((stmts: D1PreparedStatement[]) => {
      return stmts.map((stmt) => {
        if (stmt instanceof LocalPreparedStatement) {
          const res = stmt._executeSync();
          return {
            results: res.results as T[],
            success: true,
            meta: {
              ...res.meta,
              served_by: 'local-bun-sqlite',
              rows_read: res.results.length,
              rows_written: res.meta.changes,
              size_after: 0,
            },
          } as unknown as D1Result<T>;
        }
        throw new Error('Unsupported prepared statement in batch');
      });
    });

    return executeBatch(statements);
  }

  async exec(query: string): Promise<D1ExecResult> {
    const start = performance.now();
    this.sqlite.exec(query);
    return {
      count: 1,
      duration: performance.now() - start,
    };
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('dump is not supported in local sqlite');
  }

  withSession(_token?: string): any {
    return this;
  }
}

export function initializeSqliteDatabase(dbFilePath: string, schemaDir?: string): { d1: D1Database; sqlite: BunSqliteDatabase } {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbFilePath) as unknown as BunSqliteDatabase;
  // Enable WAL, foreign keys, busy timeout, and synchronous NORMAL
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);

  // Check if tables already exist
  const tableCheck = sqlite.query("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='topics'").get() as { count: number };

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const resolvedSchemaDir = schemaDir || path.resolve(process.cwd(), 'drizzle');
  if (tableCheck.count === 0) {
    // Run schema migrations
    const schemaFile = path.join(resolvedSchemaDir, '0000_schema.sql');
    if (fs.existsSync(schemaFile)) {
      const sql = fs.readFileSync(schemaFile, 'utf-8');
      sqlite.exec(sql);
    }
  }

  const appliedAt = new Date().toISOString();
  sqlite.query('INSERT OR IGNORE INTO _schema_migrations (name, applied_at) VALUES (?, ?)')
    .run('0000_schema.sql', appliedAt);

  // Older local databases may have a NOT NULL published_videos.topic_id.
  // Repair the actual schema before recording the migration as applied.
  const publishedColumns = sqlite.query("PRAGMA table_info(published_videos)").all() as Array<{ name: string; notnull: number }>;
  const publishedTopicColumn = publishedColumns.find((column) => column.name === 'topic_id');
  if (publishedTopicColumn?.notnull === 1) {
    const migrationFile = path.join(resolvedSchemaDir, '0001_optional_published_topic.sql');
    if (!fs.existsSync(migrationFile)) {
      throw new Error('Missing published_videos compatibility migration');
    }
    sqlite.exec(fs.readFileSync(migrationFile, 'utf-8'));
  }

  sqlite.query('INSERT OR IGNORE INTO _schema_migrations (name, applied_at) VALUES (?, ?)')
    .run('0001_optional_published_topic.sql', appliedAt);

  // Apply the only additive migration that older local databases may lack.
  const timelineColumns = sqlite.query("PRAGMA table_info(timeline_events)").all() as Array<{ name: string }>;
  if (!timelineColumns.some((col) => col.name === 'contrast_tag')) {
    sqlite.exec("ALTER TABLE timeline_events ADD COLUMN contrast_tag TEXT NOT NULL DEFAULT ''");
  }
  sqlite.query('INSERT OR IGNORE INTO _schema_migrations (name, applied_at) VALUES (?, ?)')
    .run('0002_add_timeline_contrast_tag.sql', appliedAt);

  // Remove the deprecated source type column from older local databases.
  const sourceColumns = sqlite.query("PRAGMA table_info(sources)").all() as Array<{ name: string }>;
  if (sourceColumns.some((column) => column.name === 'type')) {
    sqlite.exec('ALTER TABLE sources DROP COLUMN type');
  }
  sqlite.query('INSERT OR IGNORE INTO _schema_migrations (name, applied_at) VALUES (?, ?)')
    .run('0003_remove_source_type.sql', appliedAt);

  // Remove the deprecated relational settings table. App settings are stored
  // in the local KV adapter (_kv_store), matching the Cloudflare KV path.
  const settingsTable = sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get() as { name?: string } | null;
  if (settingsTable?.name === 'settings') {
    sqlite.exec('DROP TABLE settings');
  }
  sqlite.query('INSERT OR IGNORE INTO _schema_migrations (name, applied_at) VALUES (?, ?)')
    .run('0004_remove_settings_table.sql', appliedAt);

  // Ensure _kv_store table exists for local KV adapter
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_kv_expires_at ON _kv_store(expires_at);
  `);

  return {
    d1: new LocalD1Database(sqlite) as unknown as D1Database,
    sqlite,
  };
}
