import { describe, expect, it, vi } from 'bun:test';
import {
  loadTrashedTopics,
  permanentlyDeleteTrashedTopics,
  TopicNotInTrashError,
} from '../src/server/repositories/topics';
import type { SqliteDatabase } from '../src/server/sqlite';

type FakeStatement = {
  sql: string;
  values?: unknown[];
  bind: (...values: unknown[]) => FakeStatement;
  all: <T>() => Promise<{ results: T[] }>;
};

function statement(sql: string, results: unknown[] = []): FakeStatement {
  return {
    sql,
    bind(...values: unknown[]) {
      return { ...this, values };
    },
    async all<T>() {
      return { results: results as T[] };
    },
  };
}

describe('trash safety', () => {
  it('loads every trashed topic instead of truncating at 100', async () => {
    const topics = Array.from({ length: 101 }, (_, index) => ({ id: `topic-${index}` }));
    const db = {
      prepare: (sql: string) => statement(sql),
      batch: vi.fn(async () => [
        { results: topics },
        { results: [] },
        { results: [] },
        { results: [] },
        { results: [] },
      ]),
    } as unknown as SqliteDatabase;

    const result = await loadTrashedTopics(db);

    expect(result).toHaveLength(101);
    const firstBatch = (db.batch as { mock: { calls: unknown[][] } }).mock.calls[0][0] as FakeStatement[];
    expect(firstBatch[0].sql).toContain('WHERE t.deleted_at IS NOT NULL');
  });

  it('rejects a permanent-delete batch when any topic is not in trash', async () => {
    const batch = vi.fn();
    const db = {
      prepare: (sql: string) => statement(sql, [{ id: 'trash-1' }]),
      batch,
    } as unknown as SqliteDatabase;

    await expect(permanentlyDeleteTrashedTopics(db, ['trash-1', 'active-1']))
      .rejects.toBeInstanceOf(TopicNotInTrashError);
    expect(batch).not.toHaveBeenCalled();
  });

  it('guards every destructive statement with the trash condition', async () => {
    const batch = vi.fn(async () => []);
    const db = {
      prepare: (sql: string) => statement(sql, [{ id: 'trash-1' }]),
      batch,
    } as unknown as SqliteDatabase;

    await permanentlyDeleteTrashedTopics(db, ['trash-1']);

    const statements = batch.mock.calls[0][0] as FakeStatement[];
    expect(statements).toHaveLength(10);
    statements.forEach((item) => expect(item.sql).toContain('deleted_at IS NOT NULL'));
  });
});
