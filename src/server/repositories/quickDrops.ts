import type { QuickDropItem } from '../../types';
import type { SqliteDatabase } from '../sqlite';

const QUICK_DROP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const QUICK_DROP_MAX_ITEMS = 100;

export class QuickDropRepository {
  constructor(private readonly db: SqliteDatabase) {}

  private pruneExpired(now = Date.now()): void {
    this.db.sqlite.query('DELETE FROM quick_drops WHERE expires_at <= ?').run(now);
  }

  save(item: QuickDropItem): void {
    const now = Date.now();
    const save = this.db.sqlite.transaction(() => {
      this.pruneExpired(now);
      this.db.sqlite.query(`INSERT INTO quick_drops (id, content, url, source, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET content = excluded.content, url = excluded.url,
          source = excluded.source, created_at = excluded.created_at, expires_at = excluded.expires_at`)
        .run(item.id, item.content, item.url ?? null, item.source ?? '', item.created_at, now + QUICK_DROP_TTL_MS);
      this.db.sqlite.query(`DELETE FROM quick_drops WHERE id IN (
        SELECT id FROM quick_drops ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?
      )`).run(QUICK_DROP_MAX_ITEMS);
    });
    save();
  }

  list(): QuickDropItem[] {
    const now = Date.now();
    this.pruneExpired(now);
    const rows = this.db.sqlite.query(`SELECT id, content, url, source, created_at FROM quick_drops
      WHERE expires_at > ? ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(now, QUICK_DROP_MAX_ITEMS) as Array<QuickDropItem & { url: string | null }>;
    return rows.map(({ url, ...item }) => ({ ...item, ...(url ? { url } : {}) }));
  }

  count(): number {
    const now = Date.now();
    this.pruneExpired(now);
    const row = this.db.sqlite.query('SELECT COUNT(*) AS count FROM quick_drops WHERE expires_at > ?').get(now) as { count: number };
    return Number(row.count);
  }

  delete(id: string): void {
    this.db.sqlite.query('DELETE FROM quick_drops WHERE id = ?').run(id);
  }
}
