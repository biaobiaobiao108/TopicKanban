import type { SqliteDatabase } from '../sqlite';

export async function countDatabaseTables(db: SqliteDatabase): Promise<number> {
  const result = await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table'")
    .all<{ count: number }>();
  return Number(result.results[0]?.count || 0);
}
