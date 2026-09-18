import type { SqliteDatabase, SqliteStatement } from './sqlite';

interface KvRow {
  key: string;
  value: string;
  expires_at: number | null;
}

export interface JsonLeaseResult<T> {
  acquired: boolean;
  current: T | null;
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
  private readonly memoryLeases = new Map<string, { value: unknown; clientId: string; expiresAt: number }>();

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

    // Clean legacy lock rows from SQLite store to reduce database bloat
    try {
      this.db.sqlite.exec("DELETE FROM _kv_store WHERE key LIKE 'lock:%'");
    } catch {
      // Ignore cleanup error
    }

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
    const now = Date.now();
    try {
      this.cleanupStmt.run(now);
    } catch {
      // Expiry cleanup should never block normal reads.
    }
    for (const [key, lease] of this.memoryLeases) {
      if (lease.expiresAt <= now) this.memoryLeases.delete(key);
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
    this.cleanExpired();
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

  private readQuickDropsIndex(now: number): string[] {
    const row = this.getStmt.get('quick_drops_index') as KvRow | undefined;
    if (!row || (row.expires_at !== null && row.expires_at <= now)) return [];
    try {
      const parsed = JSON.parse(row.value);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  private persistQuickDropsIndex(ids: string[], now: number): string[] {
    const normalized = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))).slice(0, 100);
    const keepKeys = new Set(normalized.map((id) => `drop:${id}`));
    const dropRows = this.db.sqlite.query("SELECT key FROM _kv_store WHERE key LIKE 'drop:%'").all() as Array<{ key?: string }>;
    dropRows.forEach((dropRow) => {
      if (typeof dropRow.key === 'string' && !keepKeys.has(dropRow.key)) this.deleteStmt.run(dropRow.key);
    });
    this.putStmt.run('quick_drops_index', JSON.stringify(normalized), now + 86400 * 30 * 1000);
    return normalized;
  }

  async putQuickDrop(id: string, value: string, expirationTtl: number): Promise<void> {
    this.cleanExpired();
    const now = Date.now();
    const save = this.db.sqlite.transaction(() => {
      this.putStmt.run(`drop:${id}`, value, now + expirationTtl * 1000);
      const current = this.readQuickDropsIndex(now);
      this.persistQuickDropsIndex([id, ...current.filter((itemId) => itemId !== id)], now);
    });
    save();
  }

  async updateQuickDropsIndex(update: (ids: string[]) => string[]): Promise<string[]> {
    this.cleanExpired();
    const now = Date.now();
    const save = this.db.sqlite.transaction(() => {
      const current = this.readQuickDropsIndex(now);
      return this.persistQuickDropsIndex(update([...current]), now);
    });
    return save();
  }

  async replaceTopicShare(topicId: string, token: string, value: string, expirationTtl: number): Promise<void> {
    const expiresAt = Date.now() + expirationTtl * 1000;
    const replace = this.db.sqlite.transaction(() => {
      const shareRows = this.db.sqlite.query("SELECT key, value FROM _kv_store WHERE key LIKE 'share:%'")
        .all() as Array<Pick<KvRow, 'key' | 'value'>>;
      for (const row of shareRows) {
        try {
          const snapshot = JSON.parse(row.value) as { topic_id?: string };
          if (snapshot.topic_id === topicId) this.deleteStmt.run(row.key);
        } catch {
          // Leave unrelated malformed values untouched; normal expiry cleanup still applies.
        }
      }
      this.putStmt.run(`share:${token}`, value, expiresAt);
      this.putStmt.run(`topic_share:${topicId}`, token, expiresAt);
    });
    replace();
  }

  async deleteTopicShares(topicId: string): Promise<number> {
    const remove = this.db.sqlite.transaction(() => {
      const shareRows = this.db.sqlite.query("SELECT key, value FROM _kv_store WHERE key LIKE 'share:%'")
        .all() as Array<Pick<KvRow, 'key' | 'value'>>;
      let deleted = 0;
      for (const row of shareRows) {
        try {
          const snapshot = JSON.parse(row.value) as { topic_id?: string };
          if (snapshot.topic_id !== topicId) continue;
          deleted += Number(this.deleteStmt.run(row.key).changes || 0);
        } catch {
          // Ignore malformed snapshots that cannot be attributed to this topic.
        }
      }
      this.deleteStmt.run(`topic_share:${topicId}`);
      return deleted;
    });
    return remove();
  }

  async acquireJsonLease<T extends { client_id: string }>(
    key: string,
    clientId: string,
    value: T,
    expirationTtl: number,
  ): Promise<JsonLeaseResult<T>> {
    const now = Date.now();
    this.cleanExpired();
    const existing = this.memoryLeases.get(key);
    if (existing && existing.expiresAt > now) {
      if (existing.clientId !== clientId) {
        return { acquired: false, current: existing.value as T };
      }
    }
    this.memoryLeases.set(key, {
      value,
      clientId,
      expiresAt: now + expirationTtl * 1000,
    });
    return { acquired: true, current: value };
  }

  async releaseJsonLease(key: string, clientId: string): Promise<'released' | 'missing' | 'not_owner'> {
    const now = Date.now();
    this.cleanExpired();
    const existing = this.memoryLeases.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.memoryLeases.delete(key);
      return 'missing';
    }
    if (existing.clientId !== clientId) {
      return 'not_owner';
    }
    this.memoryLeases.delete(key);
    return 'released';
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
