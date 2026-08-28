import type { SqliteDatabase, SqliteStatement } from './sqlite';

interface KvRow {
  key: string;
  value: string;
  expires_at: number | null;
}

export type AppKvValueType = 'text' | 'json' | 'arrayBuffer';
export type AppKvGetOptions = AppKvValueType | { type?: AppKvValueType };

export class AppKV {
  private readonly db: SqliteDatabase;
  private readonly getStmt: SqliteStatement;
  private readonly putStmt: SqliteStatement;
  private readonly deleteStmt: SqliteStatement;
  private readonly listStmt: SqliteStatement;
  private readonly cleanupStmt: SqliteStatement;

  constructor(db: SqliteDatabase) {
    this.db = db;
    this.db.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS _kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_kv_expires_at ON _kv_store(expires_at);
    `);

    this.getStmt = this.db.sqlite.query('SELECT value, expires_at FROM _kv_store WHERE key = ?') as unknown as SqliteStatement;
    this.putStmt = this.db.sqlite.query(`
      INSERT INTO _kv_store (key, value, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
    `) as unknown as SqliteStatement;
    this.deleteStmt = this.db.sqlite.query('DELETE FROM _kv_store WHERE key = ?') as unknown as SqliteStatement;
    this.listStmt = this.db.sqlite.query('SELECT key, expires_at FROM _kv_store WHERE key LIKE ? ORDER BY key ASC LIMIT ?') as unknown as SqliteStatement;
    this.cleanupStmt = this.db.sqlite.query('DELETE FROM _kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?') as unknown as SqliteStatement;
  }

  private cleanExpired(): void {
    try {
      this.cleanupStmt.run(Date.now());
    } catch {
      // Expiry cleanup should never block normal reads.
    }
  }

  async get<T = unknown>(key: string, options: 'json'): Promise<T | null>;
  async get(key: string, options?: Exclude<AppKvGetOptions, 'json'>): Promise<string | ArrayBuffer | null>;
  async get<T = unknown>(key: string, options?: AppKvGetOptions): Promise<T | string | ArrayBuffer | null> {
    this.cleanExpired();
    const row = this.getStmt.get(key) as KvRow | undefined;
    if (!row) return null;

    if (row.expires_at && row.expires_at <= Date.now()) {
      this.deleteStmt.run(key);
      return null;
    }

    const type = typeof options === 'string' ? options : options?.type || 'text';
    if (type === 'json') {
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return null;
      }
    }
    if (type === 'arrayBuffer') return new TextEncoder().encode(row.value).buffer;
    return row.value;
  }

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: { expirationTtl?: number; expiration?: number }): Promise<void> {
    let textValue = '';
    if (typeof value === 'string') {
      textValue = value;
    } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      textValue = new TextDecoder().decode(bytes);
    } else {
      textValue = String(value);
    }

    let expiresAt: number | null = null;
    if (options?.expirationTtl) expiresAt = Date.now() + options.expirationTtl * 1000;
    else if (options?.expiration) expiresAt = options.expiration * 1000;
    this.putStmt.run(key, textValue, expiresAt);
  }

  async delete(key: string): Promise<void> {
    this.deleteStmt.run(key);
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<{ keys: Array<{ name: string; expiration?: number }>; list_complete: boolean }> {
    this.cleanExpired();
    const prefix = options?.prefix ? `${options.prefix}%` : '%';
    const limit = options?.limit ? Math.min(options.limit, 1000) : 1000;
    const rows = this.listStmt.all(prefix, limit) as Array<{ key: string; expires_at: number | null }>;
    const now = Date.now();
    const validRows = rows.filter((row) => !row.expires_at || row.expires_at > now);
    return {
      keys: validRows.map((row) => ({
        name: row.key,
        expiration: row.expires_at ? Math.floor(row.expires_at / 1000) : undefined,
      })),
      list_complete: true,
    };
  }
}
