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

const CURRENT_SCHEMA_VERSION = 1;

function tableExists(sqlite: Database, tableName: string): boolean {
  return Boolean(sqlite.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName));
}

function columnExists(sqlite: Database, tableName: string, columnName: string): boolean {
  if (!tableExists(sqlite, tableName)) return false;
  const columns = sqlite.query(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function migrateLegacySchema(sqlite: Database): void {
  const versionRow = sqlite.query('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const currentVersion = Number(versionRow?.user_version || 0);
  if (currentVersion >= CURRENT_SCHEMA_VERSION) return;

  const migrate = sqlite.transaction(() => {
    if (!columnExists(sqlite, 'topics', 'target_publish_date')) {
      sqlite.exec('ALTER TABLE topics ADD COLUMN target_publish_date TEXT');
    }
    if (!columnExists(sqlite, 'topics', 'deadline')) {
      sqlite.exec('ALTER TABLE topics ADD COLUMN deadline TEXT');
    }
    if (!columnExists(sqlite, 'timeline_events', 'contrast_tag')) {
      sqlite.exec("ALTER TABLE timeline_events ADD COLUMN contrast_tag TEXT NOT NULL DEFAULT ''");
    }

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_topics_target_publish_date ON topics(target_publish_date);
      CREATE INDEX IF NOT EXISTS idx_topics_deadline ON topics(deadline);

      CREATE TABLE IF NOT EXISTS topic_todos (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        title TEXT NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
        current_started_at TEXT,
        completed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (completed_at IS NULL OR is_current = 0),
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_topic_todos_topic_order ON topic_todos(topic_id, sort_order, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_todos_current
        ON topic_todos(topic_id)
        WHERE is_current = 1 AND completed_at IS NULL;

      CREATE TABLE IF NOT EXISTS publish_packages (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL UNIQUE,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
        title_simplified TEXT NOT NULL DEFAULT '',
        title_traditional TEXT NOT NULL DEFAULT '',
        description_simplified TEXT NOT NULL DEFAULT '',
        description_traditional TEXT NOT NULL DEFAULT '',
        title_traditional_auto INTEGER NOT NULL DEFAULT 1 CHECK (title_traditional_auto IN (0, 1)),
        description_traditional_auto INTEGER NOT NULL DEFAULT 1 CHECK (description_traditional_auto IN (0, 1)),
        content_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_publish_packages_updated_at ON publish_packages(updated_at);

      CREATE TABLE IF NOT EXISTS commercial_deals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        brand_name TEXT NOT NULL DEFAULT '',
        agency_name TEXT NOT NULL DEFAULT '',
        contact_name TEXT NOT NULL DEFAULT '',
        contact_channel TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'other' CHECK (source IN ('huahuo', 'brand_direct', 'agency', 'mcn', 'other')),
        deliverable_type TEXT NOT NULL DEFAULT 'custom_video' CHECK (deliverable_type IN ('custom_video', 'dynamic', 'live', 'offline_activity', 'other')),
        status TEXT NOT NULL DEFAULT 'communicating' CHECK (status IN ('communicating', 'producing', 'delivered', 'archived')),
        contract_status TEXT NOT NULL DEFAULT 'not_started' CHECK (contract_status IN ('not_started', 'drafting', 'signed')),
        contract_summary TEXT NOT NULL DEFAULT '',
        brief TEXT NOT NULL DEFAULT '',
        requirements TEXT NOT NULL DEFAULT '',
        restrictions TEXT NOT NULL DEFAULT '',
        amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
        payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
        paid_at TEXT,
        delivery_due_date TEXT,
        publish_date TEXT,
        next_action TEXT NOT NULL DEFAULT '',
        next_action_due_date TEXT,
        published_video_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (published_video_id) REFERENCES published_videos(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS commercial_deal_topics (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        topic_id TEXT NOT NULL,
        relation_role TEXT NOT NULL DEFAULT 'related' CHECK (relation_role IN ('primary', 'related')),
        created_at TEXT NOT NULL,
        UNIQUE (deal_id, topic_id),
        FOREIGN KEY (deal_id) REFERENCES commercial_deals(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS commercial_deal_activities (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'status_change', 'payment')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (deal_id) REFERENCES commercial_deals(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_commercial_deals_status ON commercial_deals(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_commercial_deals_due_date ON commercial_deals(delivery_due_date);
      CREATE INDEX IF NOT EXISTS idx_commercial_deals_payment ON commercial_deals(payment_status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_commercial_deals_published_video ON commercial_deals(published_video_id);
      CREATE INDEX IF NOT EXISTS idx_commercial_deal_topics_topic ON commercial_deal_topics(topic_id);
      CREATE INDEX IF NOT EXISTS idx_commercial_deal_topics_deal ON commercial_deal_topics(deal_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_deal_primary_topic
        ON commercial_deal_topics(deal_id)
        WHERE relation_role = 'primary';
      CREATE INDEX IF NOT EXISTS idx_commercial_deal_activities_deal ON commercial_deal_activities(deal_id, created_at);
    `);

    if (columnExists(sqlite, 'topics', 'next_action')) {
      const timestampExpression = columnExists(sqlite, 'topics', 'next_action_updated_at')
        ? 'COALESCE(next_action_updated_at, updated_at, created_at)'
        : 'COALESCE(updated_at, created_at)';
      sqlite.exec(`INSERT OR IGNORE INTO topic_todos (
          id, topic_id, title, is_current, current_started_at, sort_order, created_at, updated_at
        )
        SELECT 'legacy-todo-' || id, id, TRIM(next_action), 1, ${timestampExpression}, 0,
          ${timestampExpression}, ${timestampExpression}
        FROM topics
        WHERE TRIM(COALESCE(next_action, '')) != ''
          AND NOT EXISTS (SELECT 1 FROM topic_todos tt WHERE tt.topic_id = topics.id)`);
    }

    sqlite.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
  });
  migrate();
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
  migrateLegacySchema(sqlite);

  return { db: new SqliteDatabase(sqlite, dbFilePath), sqlite };
}
