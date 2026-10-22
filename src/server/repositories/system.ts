import fs from 'node:fs';
import type { Database } from 'bun:sqlite';
import type { StorageStats, StorageOptimizeResult } from '../../types';
import { readAll, readOne } from './shared';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function countDatabaseTables(db: Database): Promise<number> {
  const row = readOne<{ count: number }>(db, "SELECT count(*) AS count FROM sqlite_master WHERE type='table'");
  return Number(row?.count || 0);
}

export function getStorageStatsSync(db: Database): StorageStats {
  const pageCountRow = readOne<{ page_count?: number }>(db, 'PRAGMA page_count');
  const pageSizeRow = readOne<{ page_size?: number }>(db, 'PRAGMA page_size');
  const freelistCountRow = readOne<{ freelist_count?: number }>(db, 'PRAGMA freelist_count');

  const pageCount = Number(pageCountRow?.page_count || 0);
  const pageSize = Number(pageSizeRow?.page_size || 4096);
  const freelistCount = Number(freelistCountRow?.freelist_count || 0);
  const freelistBytes = freelistCount * pageSize;

  let dbFileBytes = pageCount * pageSize;
  let walFileBytes = 0;

  if (db.filename && db.filename !== ':memory:') {
    try {
      if (fs.existsSync(db.filename)) {
        dbFileBytes = fs.statSync(db.filename).size;
      }
      const walPath = `${db.filename}-wal`;
      if (fs.existsSync(walPath)) {
        walFileBytes = fs.statSync(walPath).size;
      }
    } catch {
      // Fall back to page calculation when the files cannot be inspected.
    }
  }

  const trashedRow = readOne<{ count?: number }>(
    db,
    'SELECT COUNT(*) AS count FROM topics WHERE deleted_at IS NOT NULL',
  );
  const activeRow = readOne<{ count?: number }>(db, 'SELECT COUNT(*) AS count FROM topics WHERE deleted_at IS NULL');

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

export async function getStorageStats(db: Database): Promise<StorageStats> {
  return getStorageStatsSync(db);
}

export async function vacuumDatabase(db: Database): Promise<StorageOptimizeResult> {
  const before = getStorageStatsSync(db);

  db.exec(`
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
    message:
      reclaimedBytes > 0
        ? `已成功整理数据库，释放 ${formatBytes(reclaimedBytes)} 磁盘空间`
        : '数据库已处于最佳紧凑状态，无多余空闲页需要回收',
  };
}

export async function listExpiredTrashTopicIds(db: Database, retentionDays: number): Promise<string[]> {
  if (retentionDays <= 0) {
    return [];
  }

  const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000).toISOString();
  const rows = readAll<{ id?: string }>(db, 'SELECT id FROM topics WHERE deleted_at IS NOT NULL AND deleted_at <= ?', [
    cutoff,
  ]);
  return rows.map(row => String(row.id || '')).filter(Boolean);
}

export async function purgeExpiredTrashTopics(
  db: Database,
  retentionDays: number,
): Promise<{ purged_count: number; purged_ids: string[] }> {
  if (retentionDays <= 0) {
    return { purged_count: 0, purged_ids: [] };
  }

  const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000).toISOString();
  const purge = db.transaction(() => {
    const expiredIds = readAll<{ id: string }>(
      db,
      'SELECT id FROM topics WHERE deleted_at IS NOT NULL AND deleted_at <= ?',
      [cutoff],
    ).map(row => row.id);
    if (expiredIds.length === 0) return expiredIds;

    const trashedTopic = 'SELECT id FROM topics WHERE id = ? AND deleted_at IS NOT NULL';
    const dependentDeletes = [
      db.query(`DELETE FROM draft_citations WHERE topic_id IN (${trashedTopic})`),
      db.query(`DELETE FROM drafts WHERE topic_id IN (${trashedTopic})`),
      db.query(`DELETE FROM topic_reports WHERE topic_id IN (${trashedTopic})`),
      db.query(`DELETE FROM sources WHERE topic_id IN (${trashedTopic})`),
      db.query(`DELETE FROM topic_tags WHERE topic_id IN (${trashedTopic})`),
      db.query(`DELETE FROM topic_people WHERE topic_id IN (${trashedTopic})`),
      db.query(`DELETE FROM commercial_deal_topics WHERE topic_id IN (${trashedTopic})`),
      db.query(`DELETE FROM published_videos WHERE topic_id IN (${trashedTopic})`),
      db.query(`DELETE FROM topic_todos WHERE topic_id IN (${trashedTopic})`),
    ];
    const deleteTopic = db.query('DELETE FROM topics WHERE id = ? AND deleted_at IS NOT NULL');
    for (const id of expiredIds) {
      dependentDeletes.forEach(statement => statement.run(id));
      deleteTopic.run(id);
    }
    return expiredIds;
  });
  const purgedIds = purge.immediate();

  return { purged_count: purgedIds.length, purged_ids: purgedIds };
}
