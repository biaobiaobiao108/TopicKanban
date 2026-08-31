import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';

export function bind(
  db: SqliteDatabase,
  sql: string,
  values: unknown[] = []
): SqlitePreparedStatement {
  return db.prepare(sql).bind(...values);
}
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
