import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { LocalD1Database } from '../src/server/adapters/localSqlite';

describe('LocalD1Database (SQLite Adapter)', () => {
  let sqlite: Database.Database;
  let db: LocalD1Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE test_topics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'inbox',
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
    db = new LocalD1Database(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('handles prepare, bind, run, first and all queries', async () => {
    // Run insert
    const insertRes = await db.prepare('INSERT INTO test_topics (id, title, sort_order) VALUES (?, ?, ?)')
      .bind('t-1', '测试选题 1', 1)
      .run();
    expect(insertRes.success).toBe(true);
    expect(insertRes.meta.changes).toBe(1);

    // Query single row
    const row = await db.prepare('SELECT * FROM test_topics WHERE id = ?').bind('t-1').first<{ id: string; title: string }>();
    expect(row).not.toBeNull();
    expect(row?.title).toBe('测试选题 1');

    // Query all rows
    await db.prepare('INSERT INTO test_topics (id, title, sort_order) VALUES (?, ?, ?)')
      .bind('t-2', '测试选题 2', 2)
      .run();

    const allRows = await db.prepare('SELECT * FROM test_topics ORDER BY sort_order ASC').all<{ id: string; title: string }>();
    expect(allRows.results.length).toBe(2);
    expect(allRows.results[0].id).toBe('t-1');
    expect(allRows.results[1].id).toBe('t-2');
  });

  it('handles atomic batch transactions and rollbacks on error', async () => {
    const batchStatements = [
      db.prepare('INSERT INTO test_topics (id, title, sort_order) VALUES (?, ?, ?)').bind('b-1', '批处理 1', 1),
      db.prepare('INSERT INTO test_topics (id, title, sort_order) VALUES (?, ?, ?)').bind('b-2', '批处理 2', 2),
    ];

    const results = await db.batch(batchStatements);
    expect(results.length).toBe(2);

    const countResult = await db.prepare("SELECT count(*) as count FROM test_topics WHERE id LIKE 'b-%'").first<{ count: number }>();
    expect(countResult?.count).toBe(2);

    // Test rollback on primary key conflict in batch
    const failingBatch = [
      db.prepare('INSERT INTO test_topics (id, title, sort_order) VALUES (?, ?, ?)').bind('b-3', '批处理 3', 3),
      db.prepare('INSERT INTO test_topics (id, title, sort_order) VALUES (?, ?, ?)').bind('b-1', '重复主键冲突', 4), // conflict with b-1
    ];

    await expect(db.batch(failingBatch)).rejects.toThrow();

    // b-3 should NOT exist due to transaction rollback
    const b3 = await db.prepare('SELECT * FROM test_topics WHERE id = ?').bind('b-3').first();
    expect(b3).toBeNull();
  });
});
