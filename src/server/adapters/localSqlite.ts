import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

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
  private stmt: Database.Statement;
  private boundValues: unknown[];
  private query: string;

  constructor(stmt: Database.Statement, query: string, boundValues: unknown[] = []) {
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
        served_by: 'local-better-sqlite3',
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
        served_by: 'local-better-sqlite3',
        rows_read: rows.length,
        rows_written: 0,
        size_after: 0,
      },
    } as unknown as D1Result<T>;
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<any> {
    const rows = this.stmt.raw(true).all(...this.boundValues) as T[];
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
  public sqlite: Database.Database;

  constructor(sqlite: Database.Database) {
    this.sqlite = sqlite;
  }

  prepare(query: string): D1PreparedStatement {
    const stmt = this.sqlite.prepare(query);
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
              served_by: 'local-better-sqlite3',
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

export function initializeSqliteDatabase(dbFilePath: string, schemaDir?: string): { d1: D1Database; sqlite: Database.Database } {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbFilePath);
  // Enable WAL, foreign keys, busy timeout, and synchronous NORMAL
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  // Check if tables already exist
  const tableCheck = sqlite.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='topics'").get() as { count: number };

  if (tableCheck.count === 0) {
    // Run schema migrations
    const resolvedSchemaDir = schemaDir || path.resolve(process.cwd(), 'drizzle');
    const schemaFile = path.join(resolvedSchemaDir, '0000_schema.sql');
    if (fs.existsSync(schemaFile)) {
      const sql = fs.readFileSync(schemaFile, 'utf-8');
      sqlite.exec(sql);
    }
  } else {
    // Ensure contrast_tag column exists on existing timeline_events table
    try {
      const timelineColumns = sqlite.prepare("PRAGMA table_info(timeline_events)").all() as Array<{ name: string }>;
      if (!timelineColumns.some((col) => col.name === 'contrast_tag')) {
        sqlite.exec("ALTER TABLE timeline_events ADD COLUMN contrast_tag TEXT NOT NULL DEFAULT ''");
      }
    } catch {
      // ignore
    }
  }

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
