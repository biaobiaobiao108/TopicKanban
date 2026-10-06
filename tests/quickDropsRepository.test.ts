import { afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { QuickDropItem } from '../src/types';
import { SqliteDatabase } from '../src/server/sqlite';
import { QuickDropRepository } from '../src/server/repositories/quickDrops';

describe('QuickDropRepository', () => {
  let sqlite: Database | null = null;

  afterEach(() => {
    sqlite?.close();
    sqlite = null;
  });

  async function createRepository(): Promise<QuickDropRepository> {
    sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
    return new QuickDropRepository(new SqliteDatabase(sqlite));
  }

  it('stores, lists, counts and deletes quick drops using explicit fields', async () => {
    const repository = await createRepository();
    const item: QuickDropItem = {
      id: 'drop-1', content: '灵感内容', url: 'https://example.com', source: '测试',
      created_at: new Date().toISOString(),
    };

    repository.save(item);
    expect(repository.list()).toEqual([item]);
    expect(repository.count()).toBe(1);
    repository.delete(item.id);
    expect(repository.list()).toEqual([]);
    expect(repository.count()).toBe(0);
  });

  it('expires old rows and retains only the newest 100 items', async () => {
    const repository = await createRepository();
    const insert = sqlite!.query(`INSERT INTO quick_drops (id, content, source, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)`);
    const now = Date.now();
    insert.run('expired', '过期', 'test', new Date(now - 2000).toISOString(), now - 1000);
    for (let index = 0; index < 101; index += 1) {
      repository.save({
        id: `drop-${index}`,
        content: String(index),
        source: 'test',
        created_at: new Date(now + index).toISOString(),
      });
    }
    expect(repository.count()).toBe(100);
    expect(repository.list()[0]?.id).toBe('drop-100');
    expect(sqlite!.query('SELECT COUNT(*) AS count FROM quick_drops').get()).toEqual({ count: 100 });
  });
});
