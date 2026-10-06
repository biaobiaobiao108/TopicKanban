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
    const payload = { reading_speed: 300, theme: 'dark' };
    await kv.put('app_settings', JSON.stringify(payload));

    const data = await kv.get('app_settings', 'json');
    expect(data).toEqual(payload);
    expect(data.reading_speed).toBe(300);
  });

  it('round-trips arbitrary binary bytes through ArrayBuffer values', async () => {
    const bytes = new Uint8Array([0, 0xff, 0xc3, 0x28, 0x80, 42]);
    await kv.put('binary', bytes);

    const stored = await kv.get('binary', 'arrayBuffer');
    expect(stored).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(stored as ArrayBuffer))).toEqual(Array.from(bytes));
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

  it('throttles SQLite expiry sweeps while still checking accessed keys', async () => {
    await kv.put('live', 'keep');
    sqlite.query(`INSERT INTO _kv_store (key, value, expires_at) VALUES (?, ?, ?)`)
      .run('expired:unrelated', 'stale', Date.now() - 1);

    expect(await kv.get('live')).toBe('keep');
    expect(sqlite.query('SELECT key FROM _kv_store WHERE key = ?').get('expired:unrelated')).toBeDefined();
  });

  it('keeps SQLite expiry cleanup off the in-memory lease path', async () => {
    await kv.put('expired:test', 'stale value', { expirationTtl: 1 });
    sqlite.query('UPDATE _kv_store SET expires_at = ? WHERE key = ?').run(Date.now() - 1000, 'expired:test');

    await kv.acquireJsonLease('lock:topic-1', 'client-1', {
      client_id: 'client-1', device_name: 'Mac', updated_at: new Date().toISOString(),
    }, 30);
    await kv.releaseJsonLease('lock:topic-1', 'client-1');

    const staleRow = sqlite.query('SELECT key FROM _kv_store WHERE key = ?').get('expired:test');
    expect(staleRow).toBeDefined();
  });

  it('lists keys by prefix', async () => {
    await kv.put('drop:1', 'item 1');
    await kv.put('drop:2', 'item 2');
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

  it('counts only active quick drops and repairs stale index entries', async () => {
    await kv.putQuickDrop('active', JSON.stringify({ id: 'active' }), 3600);
    await kv.putQuickDrop('expired', JSON.stringify({ id: 'expired' }), 3600);
    await kv.putQuickDrop('missing', JSON.stringify({ id: 'missing' }), 3600);
    sqlite.query('UPDATE _kv_store SET expires_at = ? WHERE key = ?').run(Date.now() - 1, 'drop:expired');
    sqlite.query('DELETE FROM _kv_store WHERE key = ?').run('drop:missing');

    expect(await kv.getQuickDropCount()).toBe(1);
    expect(await kv.get<string[]>('quick_drops_index', 'json')).toEqual(['active']);
  });
});
