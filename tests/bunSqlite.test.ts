import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

describe('Bun SQLite native API', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE test_topics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('queries and writes with native Statement methods', () => {
    const insert = db.query('INSERT INTO test_topics (id, title, sort_order) VALUES (?, ?, ?)');
    expect(insert.run('t-1', '测试选题 1', 1).changes).toBe(1);
    expect(insert.run('t-2', '测试选题 2', 2).changes).toBe(1);

    const first = db.query('SELECT * FROM test_topics WHERE id = ?')
      .get('t-1') as { id: string; title: string } | null;
    const all = db.query('SELECT * FROM test_topics ORDER BY sort_order ASC')
      .all() as Array<{ id: string; title: string }>;

    expect(first?.title).toBe('测试选题 1');
    expect(all.map((topic) => topic.id)).toEqual(['t-1', 't-2']);
  });

  it('rolls back a native transaction when one statement fails', () => {
    const insert = db.query('INSERT INTO test_topics (id, title, sort_order) VALUES (?, ?, ?)');
    insert.run('b-1', '批处理 1', 1);

    const transaction = db.transaction(() => {
      insert.run('b-2', '批处理 2', 2);
      insert.run('b-1', '重复主键', 3);
    });

    expect(() => transaction()).toThrow();
    expect(db.query("SELECT COUNT(*) AS count FROM test_topics WHERE id LIKE 'b-%'").get())
      .toEqual({ count: 1 });
  });
});
