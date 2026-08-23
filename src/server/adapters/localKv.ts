import type { BunSqliteDatabase, BunSqliteStatement } from './localSqlite';

interface KvRow {
  key: string;
  value: string;
  expires_at: number | null;
}

export class LocalKVNamespace {
  private sqlite: BunSqliteDatabase;
  private getStmt: BunSqliteStatement;
  private putStmt: BunSqliteStatement;
  private deleteStmt: BunSqliteStatement;
  private listStmt: BunSqliteStatement;
  private cleanupStmt: BunSqliteStatement;

  constructor(sqlite: BunSqliteDatabase) {
    this.sqlite = sqlite;

    // Ensure _kv_store table exists
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS _kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_kv_expires_at ON _kv_store(expires_at);
    `);

    this.getStmt = this.sqlite.query('SELECT value, expires_at FROM _kv_store WHERE key = ?');
    this.putStmt = this.sqlite.query(`
      INSERT INTO _kv_store (key, value, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
    `);
    this.deleteStmt = this.sqlite.query('DELETE FROM _kv_store WHERE key = ?');
    this.listStmt = this.sqlite.query('SELECT key, expires_at FROM _kv_store WHERE key LIKE ? ORDER BY key ASC LIMIT ?');
    this.cleanupStmt = this.sqlite.query('DELETE FROM _kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?');
  }

  private cleanExpired() {
    try {
      this.cleanupStmt.run(Date.now());
    } catch {
      // ignore
    }
  }

  async get(key: string | string[], options?: any): Promise<any> {
    if (Array.isArray(key)) {
      const results: Record<string, any> = {};
      for (const k of key) {
        results[k] = await this.get(k, options);
      }
      return results;
    }

    const row = this.getStmt.get(key) as KvRow | undefined;
    if (!row) return null;

    if (row.expires_at && row.expires_at <= Date.now()) {
      this.deleteStmt.run(key);
      return null;
    }

    const type = typeof options === 'string' ? options : options?.type || 'text';
    if (type === 'json') {
      try {
        return JSON.parse(row.value);
      } catch {
        return null;
      }
    }
    if (type === 'arrayBuffer') {
      return new TextEncoder().encode(row.value).buffer;
    }
    return row.value;
  }

  async getWithMetadata<Metadata = unknown>(key: string | string[], options?: any): Promise<any> {
    const value = await this.get(key, options);
    return {
      value,
      metadata: null,
      cacheStatus: null,
    };
  }

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: any): Promise<void> {
    let textValue = '';
    if (typeof value === 'string') {
      textValue = value;
    } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const buffer = value instanceof ArrayBuffer ? value : value.buffer;
      textValue = new TextDecoder().decode(buffer);
    } else {
      textValue = String(value);
    }

    let expiresAt: number | null = null;
    if (options?.expirationTtl) {
      expiresAt = Date.now() + options.expirationTtl * 1000;
    } else if (options?.expiration) {
      expiresAt = options.expiration * 1000;
    }

    this.putStmt.run(key, textValue, expiresAt);
  }

  async delete(key: string): Promise<void> {
    this.deleteStmt.run(key);
  }

  async list<Metadata = unknown>(options?: any): Promise<any> {
    this.cleanExpired();
    const prefix = options?.prefix ? `${options.prefix}%` : '%';
    const limit = options?.limit ? Math.min(options.limit, 1000) : 1000;

    const rows = this.listStmt.all(prefix, limit) as Array<{ key: string; expires_at: number | null }>;
    const now = Date.now();
    const validRows = rows.filter((r) => !r.expires_at || r.expires_at > now);

    return {
      keys: validRows.map((r) => ({
        name: r.key,
        expiration: r.expires_at ? Math.floor(r.expires_at / 1000) : undefined,
      })),
      list_complete: true,
      cacheStatus: null,
    };
  }
}

export function createLocalKVNamespace(sqlite: BunSqliteDatabase): KVNamespace {
  return new LocalKVNamespace(sqlite) as unknown as KVNamespace;
}
