import type { Database } from 'bun:sqlite';
import type { QuickDropItem } from '../../types';
import { execute, readAll, readOne } from './shared';

const QUICK_DROP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const QUICK_DROP_MAX_ITEMS = 100;

export class QuickDropRepository {
  constructor(private readonly db: Database) {}

  private pruneExpired(now = Date.now()): void {
    execute(this.db, 'DELETE FROM quick_drops WHERE expires_at <= ?', [now]);
  }

  save(item: QuickDropItem): void {
    const now = Date.now();
    this.db.transaction(() => {
      this.pruneExpired(now);
      execute(
        this.db,
        `INSERT INTO quick_drops (id, content, url, source, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET content = excluded.content, url = excluded.url,
          source = excluded.source, created_at = excluded.created_at, expires_at = excluded.expires_at`,
        [item.id, item.content, item.url ?? null, item.source ?? '', item.created_at, now + QUICK_DROP_TTL_MS],
      );
      execute(
        this.db,
        `DELETE FROM quick_drops WHERE id IN (
        SELECT id FROM quick_drops ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?
      )`,
        [QUICK_DROP_MAX_ITEMS],
      );
    })();
  }

  list(): QuickDropItem[] {
    const now = Date.now();
    const rows = readAll<QuickDropItem & { url: string | null }>(
      this.db,
      `SELECT id, content, url, source, created_at FROM quick_drops
      WHERE expires_at > ? ORDER BY created_at DESC, id DESC LIMIT ?`,
      [now, QUICK_DROP_MAX_ITEMS],
    );
    return rows.map(({ url, ...item }) => ({ ...item, ...(url ? { url } : {}) }));
  }

  count(): number {
    const now = Date.now();
    const row = readOne<{ count: number }>(this.db, 'SELECT COUNT(*) AS count FROM quick_drops WHERE expires_at > ?', [
      now,
    ]);
    return Number(row?.count || 0);
  }

  delete(id: string): void {
    execute(this.db, 'DELETE FROM quick_drops WHERE id = ?', [id]);
  }
}
