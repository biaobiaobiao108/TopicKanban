import fs from 'node:fs';
import type { SqliteDatabase } from '../sqlite';
import type { StorageStats, StorageOptimizeResult } from '../../types';
import { permanentlyDeleteTrashedTopics } from './topics';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function countDatabaseTables(db: SqliteDatabase): Promise<number> {
  const result = await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table'")
    .all<{ count: number }>();
  return Number(result.results[0]?.count || 0);
}

export function getStorageStatsSync(db: SqliteDatabase): StorageStats {
  const pageCountRow = db.sqlite.query('PRAGMA page_count').get() as { page_count?: number } | undefined;
  const pageSizeRow = db.sqlite.query('PRAGMA page_size').get() as { page_size?: number } | undefined;
  const freelistCountRow = db.sqlite.query('PRAGMA freelist_count').get() as { freelist_count?: number } | undefined;

  const pageCount = Number(pageCountRow?.page_count || 0);
  const pageSize = Number(pageSizeRow?.page_size || 4096);
  const freelistCount = Number(freelistCountRow?.freelist_count || 0);
  const freelistBytes = freelistCount * pageSize;

  let dbFileBytes = pageCount * pageSize;
  let walFileBytes = 0;

  if (db.dbFilePath && db.dbFilePath !== ':memory:') {
    try {
      if (fs.existsSync(db.dbFilePath)) {
        dbFileBytes = fs.statSync(db.dbFilePath).size;
      }
      const walPath = `${db.dbFilePath}-wal`;
      if (fs.existsSync(walPath)) {
        walFileBytes = fs.statSync(walPath).size;
      }
    } catch {
      // Fallback to page calculation on read error
    }
  }

  const trashedRow = db.sqlite.query('SELECT COUNT(*) AS count FROM topics WHERE deleted_at IS NOT NULL').get() as { count?: number } | undefined;
  const activeRow = db.sqlite.query('SELECT COUNT(*) AS count FROM topics WHERE deleted_at IS NULL').get() as { count?: number } | undefined;

  return {
    db_file_bytes: dbFileBytes,
    wal_file_bytes: walFileBytes,
    total_bytes: dbFileBytes + walFileBytes,
    page_size: pageSize,
    page_count: pageCount,
    freelist_count: freelistCount,
    freelist_bytes: freelistBytes,
    trashed_topics_count: Number(trashedRow?.count || 0),
    active_topics_count: Number(activeRow?.count || 0),
  };
}

export async function getStorageStats(db: SqliteDatabase): Promise<StorageStats> {
  return getStorageStatsSync(db);
}

export async function vacuumDatabase(db: SqliteDatabase): Promise<StorageOptimizeResult> {
  const before = getStorageStatsSync(db);

  db.sqlite.exec(`
    PRAGMA wal_checkpoint(TRUNCATE);
    VACUUM;
    PRAGMA wal_checkpoint(TRUNCATE);
  `);

  const after = getStorageStatsSync(db);
  const reclaimedBytes = Math.max(0, before.total_bytes - after.total_bytes);

  return {
    before,
    after,
    reclaimed_bytes: reclaimedBytes,
    message: reclaimedBytes > 0
      ? `已成功整理数据库，释放 ${formatBytes(reclaimedBytes)} 磁盘空间`
      : '数据库已处于最佳紧凑状态，无多余空闲页需要回收',
  };
}

export async function listExpiredTrashTopicIds(db: SqliteDatabase, retentionDays: number): Promise<string[]> {
  if (retentionDays <= 0) {
    return [];
  }

  const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000).toISOString();
  const rows = db.sqlite.query('SELECT id FROM topics WHERE deleted_at IS NOT NULL AND deleted_at <= ?').all(cutoff) as Array<{ id?: string }>;
  return rows.map((r) => String(r.id || '')).filter(Boolean);
}

export async function purgeExpiredTrashTopics(
  db: SqliteDatabase,
  retentionDays: number
): Promise<{ purged_count: number; purged_ids: string[] }> {
  const ids = await listExpiredTrashTopicIds(db, retentionDays);
  if (ids.length === 0) {
    return { purged_count: 0, purged_ids: [] };
  }

  await permanentlyDeleteTrashedTopics(db, ids);
  return { purged_count: ids.length, purged_ids: ids };
}
