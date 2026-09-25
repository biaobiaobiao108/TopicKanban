import { Database } from 'bun:sqlite';
import { joinPath, resolvePath } from './bunPaths';

export interface SqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  values(...params: unknown[]): unknown[][];
  columns(): Array<{ name: string }>;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface SqliteResult<T = unknown> {
  results: T[];
  success: boolean;
  meta: {
    changes: number;
    last_row_id: number;
    duration: number;
  };
}

export class SqlitePreparedStatement {
  private readonly stmt: SqliteStatement;
  private readonly boundValues: unknown[];
  private readonly query: string;

  constructor(stmt: SqliteStatement, query: string, boundValues: unknown[] = []) {
    this.stmt = stmt;
    this.query = query;
    this.boundValues = boundValues;
  }

  bind(...values: unknown[]): SqlitePreparedStatement {
    return new SqlitePreparedStatement(this.stmt, this.query, values);
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const row = this.stmt.get(...this.boundValues) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) return (row[colName] as T) ?? null;
    return row as T;
  }

  async run<T = Record<string, unknown>>(): Promise<SqliteResult<T>> {
    const start = performance.now();
    const info = this.stmt.run(...this.boundValues);
    return {
      results: [] as T[],
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        duration: performance.now() - start,
      },
    };
  }

  async all<T = Record<string, unknown>>(): Promise<SqliteResult<T>> {
    const start = performance.now();
    const rows = this.stmt.all(...this.boundValues) as T[];
    return {
      results: rows,
      success: true,
      meta: {
        changes: 0,
        last_row_id: 0,
        duration: performance.now() - start,
      },
    };
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<any> {
    const rows = this.stmt.values(...this.boundValues) as T[];
    if (options?.columnNames) {
      const colNames = this.stmt.columns().map((column) => column.name);
      return [colNames, ...rows];
    }
    return rows;
  }

  executeSync(): SqliteResult {
    const start = performance.now();
    const isSelect = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(this.query);
    if (isSelect) {
      const rows = this.stmt.all(...this.boundValues);
      return {
        results: rows,
        success: true,
        meta: { changes: 0, last_row_id: 0, duration: performance.now() - start },
      };
    }
    const info = this.stmt.run(...this.boundValues);
    return {
      results: [],
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        duration: performance.now() - start,
      },
    };
  }
}

export class SqliteDatabase {
  readonly sqlite: Database;
  readonly dbFilePath?: string;

  constructor(sqlite: Database, dbFilePath?: string) {
    this.sqlite = sqlite;
    this.dbFilePath = dbFilePath;
  }

  prepare(query: string): SqlitePreparedStatement {
    return new SqlitePreparedStatement(this.sqlite.query(query) as unknown as SqliteStatement, query);
  }

  async batch(statements: SqlitePreparedStatement[]): Promise<SqliteResult[]> {
    const executeBatch = this.sqlite.transaction((items: SqlitePreparedStatement[]) => {
      return items.map((statement) => statement.executeSync());
    });
    return executeBatch(statements);
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    const start = performance.now();
    this.sqlite.exec(query);
    return { count: 1, duration: performance.now() - start };
  }

  close(): void {
    this.sqlite.close();
  }
}

export const CURRENT_SCHEMA_VERSION = 3;

function schemaObjectExists(sqlite: Database, name: string): boolean {
  return Boolean(sqlite.query("SELECT 1 FROM sqlite_master WHERE name = ? LIMIT 1").get(name));
}

function assertCurrentSchema(sqlite: Database): void {
  const versionRow = sqlite.query('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const actualVersion = Number(versionRow?.user_version || 0);
  if (actualVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `SQLite schema version mismatch: expected baseline v${CURRENT_SCHEMA_VERSION}, found v${actualVersion}. `
      + 'This project no longer migrates legacy databases; recreate the local database from drizzle/0000_schema.sql.',
    );
  }

  const requiredObjects = ['topics', 'topic_todos', 'topic_search', 'publish_packages', 'commercial_deals', '_kv_store'];
  const missingObjects = requiredObjects.filter((name) => !schemaObjectExists(sqlite, name));
  if (missingObjects.length > 0) {
    throw new Error(
      `SQLite schema is incomplete: missing ${missingObjects.join(', ')}. `
      + 'Recreate the local database from drizzle/0000_schema.sql.',
    );
  }
}

export async function initializeSqliteDatabase(dbFilePath: string, schemaDir?: string): Promise<{ db: SqliteDatabase; sqlite: Database }> {
  const dbFile = Bun.file(dbFilePath);
  if (!(await dbFile.exists())) {
    await Bun.write(dbFilePath, '', { createPath: true });
  }

  const sqlite = new Database(dbFilePath);
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);

  const tableCheck = sqlite.query("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='topics'").get() as { count: number };

  const resolvedSchemaDir = schemaDir || resolvePath(process.cwd(), 'drizzle');
  if (tableCheck.count === 0) {
    const schemaFile = joinPath(resolvedSchemaDir, '0000_schema.sql');
    const schema = Bun.file(schemaFile);
    if (await schema.exists()) sqlite.exec(await schema.text());
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_kv_expires_at ON _kv_store(expires_at);
  `);

  try {
    assertCurrentSchema(sqlite);
  } catch (error) {
    sqlite.close();
    throw error;
  }

  return { db: new SqliteDatabase(sqlite, dbFilePath), sqlite };
}
