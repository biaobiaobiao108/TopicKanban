import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';

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

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
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

export async function initializeSqliteDatabase(dbFilePath: string, schemaDir?: string): Promise<{ db: SqliteDatabase; sqlite: Database }> {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const sqlite = new Database(dbFilePath);
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);

  const tableCheck = sqlite.query("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='topics'").get() as { count: number };

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const resolvedSchemaDir = schemaDir || path.resolve(process.cwd(), 'drizzle');
  if (tableCheck.count === 0) {
    const schemaFile = path.join(resolvedSchemaDir, '0000_schema.sql');
    const schema = Bun.file(schemaFile);
    if (await schema.exists()) sqlite.exec(await schema.text());
  } else {
    const columns = sqlite.query('PRAGMA table_info(topics)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'target_publish_date')) {
      sqlite.exec('ALTER TABLE topics ADD COLUMN target_publish_date TEXT;');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_topics_target_publish_date ON topics(target_publish_date);');
    }
    if (!columns.some((column) => column.name === 'deadline')) {
      sqlite.exec('ALTER TABLE topics ADD COLUMN deadline TEXT;');
      sqlite.exec('CREATE INDEX IF NOT EXISTS idx_topics_deadline ON topics(deadline);');
    }
  }

  sqlite.query('INSERT OR IGNORE INTO _schema_migrations (name, applied_at) VALUES (?, ?)')
    .run('0000_schema.sql', new Date().toISOString());

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_kv_expires_at ON _kv_store(expires_at);
  `);

  return { db: new SqliteDatabase(sqlite), sqlite };
}
