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

const EXPIRY_CLEANUP_INTERVAL_MS = 60_000;
const ARRAY_BUFFER_PREFIX = '\u0000appkv:arraybuffer:';

function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    for (const byte of chunk) binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class AppKV {
  private readonly db: SqliteDatabase;
  private readonly getStmt: SqliteStatement;
  private readonly putStmt: SqliteStatement;
  private readonly deleteStmt: SqliteStatement;
  private readonly listStmt: SqliteStatement;
  private readonly cleanupStmt: SqliteStatement;
  private readonly memoryLeases = new Map<string, { value: unknown; clientId: string; expiresAt: number }>();
  private lastExpiryCleanupAt = Number.NEGATIVE_INFINITY;

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

  private cleanExpiredMemoryLeases(now: number): void {
    for (const [key, lease] of this.memoryLeases) {
      if (lease.expiresAt <= now) this.memoryLeases.delete(key);
    }
  }

  private cleanExpired(): void {
    const now = Date.now();
    if (now - this.lastExpiryCleanupAt >= EXPIRY_CLEANUP_INTERVAL_MS) {
      // Advance before running the statement so a transient DB issue does not
      // make every KV access retry the same full-table cleanup.
      this.lastExpiryCleanupAt = now;
      try {
        this.cleanupStmt.run(now);
      } catch {
        // Expiry cleanup should never block normal reads.
      }
    }
    this.cleanExpiredMemoryLeases(now);
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
    if (type === 'arrayBuffer') {
      if (row.value.startsWith(ARRAY_BUFFER_PREFIX)) {
        try {
          return decodeBase64ToBytes(row.value.slice(ARRAY_BUFFER_PREFIX.length)).buffer as ArrayBuffer;
        } catch {
          return new TextEncoder().encode(row.value).buffer;
        }
      }
      return new TextEncoder().encode(row.value).buffer;
    }
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
      textValue = `${ARRAY_BUFFER_PREFIX}${encodeBytesToBase64(bytes)}`;
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

  private persistQuickDropsIndex(ids: string[], now: number, pruneUnindexedDrops = true): string[] {
    const normalized = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))).slice(0, 100);
    if (pruneUnindexedDrops) {
      const keepKeys = new Set(normalized.map((id) => `drop:${id}`));
      const dropRows = this.db.sqlite.query("SELECT key FROM _kv_store WHERE key LIKE 'drop:%'").all() as Array<{ key?: string }>;
      dropRows.forEach((dropRow) => {
        if (typeof dropRow.key === 'string' && !keepKeys.has(dropRow.key)) this.deleteStmt.run(dropRow.key);
      });
    }
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

  async getQuickDropCount(): Promise<number> {
    this.cleanExpired();
    const now = Date.now();
    const count = this.db.sqlite.transaction(() => {
      const indexRow = this.getStmt.get('quick_drops_index') as KvRow | undefined;
      if (!indexRow || (indexRow.expires_at !== null && indexRow.expires_at <= now)) return 0;

      let parsed: unknown;
      try {
        parsed = JSON.parse(indexRow.value);
      } catch {
        parsed = null;
      }
      const rawIds = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];
      const ids = Array.from(new Set(rawIds)).slice(0, 100);
      const idsChanged = !Array.isArray(parsed)
        || ids.length !== parsed.length
        || ids.some((id, index) => id !== parsed[index]);

      let validIds = ids;
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(', ');
        const rows = this.db.sqlite.query(`SELECT key FROM _kv_store
          WHERE key IN (${placeholders}) AND (expires_at IS NULL OR expires_at > ?)`)
          .all(...ids.map((id) => `drop:${id}`), now) as Array<{ key: string }>;
        const validKeys = new Set(rows.map((row) => row.key));
        validIds = ids.filter((id) => validKeys.has(`drop:${id}`));
      }

      if (idsChanged || validIds.length !== ids.length) {
        this.persistQuickDropsIndex(validIds, now, false);
      }
      return validIds.length;
    });
    return count();
  }

  async acquireJsonLease<T extends { client_id: string }>(
    key: string,
    clientId: string,
    value: T,
    expirationTtl: number,
  ): Promise<JsonLeaseResult<T>> {
    const now = Date.now();
    this.cleanExpiredMemoryLeases(now);
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
    this.cleanExpiredMemoryLeases(now);
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
