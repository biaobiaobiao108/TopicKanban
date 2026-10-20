import type { Database, SQLQueryBindings, Statement } from 'bun:sqlite';

export interface SqlCommand {
  statement: Statement;
  values: SQLQueryBindings[];
}

export function command(db: Database, sql: string, values: unknown[] = []): SqlCommand {
  return {
    statement: db.query(sql),
    values: values as SQLQueryBindings[],
  };
}

export function readAll<T>(db: Database, sql: string, values: unknown[] = []): T[] {
  return db.query(sql).all(...(values as SQLQueryBindings[])) as T[];
}

export function readOne<T>(db: Database, sql: string, values: unknown[] = []): T | null {
  return (db.query(sql).get(...(values as SQLQueryBindings[])) as T | null | undefined) ?? null;
}

export function execute(db: Database, sql: string, values: unknown[] = []): void {
  db.query(sql).run(...(values as SQLQueryBindings[]));
}

export function readTransaction(db: Database, queries: SqlCommand[]): unknown[][] {
  return db.transaction(() => queries.map(({ statement, values }) => (
    statement.all(...values) as unknown[]
  )))();
}

export function executeTransaction(db: Database, commands: SqlCommand[]): void {
  db.transaction(() => {
    commands.forEach(({ statement, values }) => statement.run(...values));
  })();
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
