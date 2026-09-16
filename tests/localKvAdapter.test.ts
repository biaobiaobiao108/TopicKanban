import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { AppKV } from '../src/server/appKv';
import { SqliteDatabase } from '../src/server/sqlite';

describe('AppKV (SQLite)', () => {
  let sqlite: Database;
  let kv: AppKV;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    kv = new AppKV(new SqliteDatabase(sqlite));
  });

  afterEach(() => {
    sqlite.close();
  });

  it('puts, gets, and deletes key-value pairs', async () => {
    await kv.put('test_key', 'hello world');
    const val = await kv.get('test_key');
    expect(val).toBe('hello world');

    await kv.delete('test_key');
    const afterDelete = await kv.get('test_key');
    expect(afterDelete).toBeNull();
  });

  it('supports JSON deserialization', async () => {
    const payload = { reading_speed: 300, theme: 'dark', reviewer_branding: '测试频道' };
    await kv.put('app_settings', JSON.stringify(payload));

    const data = await kv.get('app_settings', 'json');
    expect(data).toEqual(payload);
    expect(data.reading_speed).toBe(300);
  });

  it('honors expiration TTL and returns null for expired items', async () => {
    // Put item with 1 second TTL
    await kv.put('short_lived', 'expires soon', { expirationTtl: 1 });
    expect(await kv.get('short_lived')).toBe('expires soon');

    // Simulate expiration by manually updating expires_at in db
    sqlite.query('UPDATE _kv_store SET expires_at = ? WHERE key = ?').run(Date.now() - 1000, 'short_lived');

    const expiredVal = await kv.get('short_lived');
    expect(expiredVal).toBeNull();
  });

  it('lists keys by prefix', async () => {
    await kv.put('drop:1', 'item 1');
    await kv.put('drop:2', 'item 2');
    await kv.put('share:1', 'snapshot 1');

    const listRes = await kv.list({ prefix: 'drop:' });
    expect(listRes.keys.length).toBe(2);
    expect(listRes.keys.map((k) => k.name)).toEqual(['drop:1', 'drop:2']);
  });

  it('updates the quick-drop index transactionally and keeps every entry', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, index) => (
      kv.updateQuickDropsIndex((ids) => [`drop-${index}`, ...ids])
    )));

    const index = await kv.get<string[]>('quick_drops_index', 'json');
    expect(index).toHaveLength(20);
    expect(new Set(index)).toEqual(new Set(Array.from({ length: 20 }, (_, item) => `drop-${item}`)));
  });

  it('removes quick-drop backing rows that fall outside the bounded index', async () => {
    for (let index = 0; index < 101; index += 1) {
      await kv.put(`drop:${index}`, `item ${index}`);
      await kv.updateQuickDropsIndex((ids) => [String(index), ...ids]);
    }

    const index = await kv.get<string[]>('quick_drops_index', 'json');
    const backingRows = sqlite.query("SELECT key FROM _kv_store WHERE key LIKE 'drop:%'").all() as Array<{ key: string }>;
    expect(index).toHaveLength(100);
    expect(backingRows).toHaveLength(100);
    expect(new Set(backingRows.map((row) => row.key.slice('drop:'.length)))).toEqual(new Set(index));
  });
});
