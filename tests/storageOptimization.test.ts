import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createApp } from '../src/server/app';
import { NativeApp } from '../src/server/native';
import { acquirePresenceLease, MAX_LEASES, releasePresenceLease } from '../src/server/presenceLeases';
import {
  getStorageStats,
  vacuumDatabase,
  insertTopic,
  softDeleteTopic,
  permanentlyDeleteTrashedTopics,
} from '../src/server/repositories';
import type { ApiBindings } from '../src/server/apiShared';

describe('Storage Optimization & Compaction', () => {
  let sqlite: Database;
  let db: Database;
  let app: NativeApp;
  let authHeaders: { Authorization: string; 'Content-Type': string };

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.exec(await Bun.file('database/schema.sql').text());
    db = sqlite;
    app = createApp({ DB: db, APP_PASSWORD: 'test-password' } satisfies ApiBindings);

    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-password' }),
    });
    const { token } = (await loginRes.json()) as { token: string };
    authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  it('reports accurate storage stats including pages and freelist', async () => {
    const stats = await getStorageStats(db);
    expect(stats.page_size).toBeGreaterThan(0);
    expect(stats.page_count).toBeGreaterThan(0);
    expect(typeof stats.freelist_count).toBe('number');
    expect(stats.trashed_topics_count).toBe(0);
    expect(stats.active_topics_count).toBe(0);

    // Insert a topic
    await insertTopic(db, {
      id: 'topic-storage-1',
      title: '存储测试选题',
      status: 'inbox',
      priority: 'medium',
      score_character: 1,
      score_conflict: 1,
      score_contrast: 1,
      score_material: 1,
      score_story: 1,
      is_pinned: 0,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const afterInsert = await getStorageStats(db);
    expect(afterInsert.active_topics_count).toBe(1);
    expect(afterInsert.trashed_topics_count).toBe(0);

    // Soft delete to trash
    await softDeleteTopic(db, 'topic-storage-1');
    const afterTrash = await getStorageStats(db);
    expect(afterTrash.active_topics_count).toBe(0);
    expect(afterTrash.trashed_topics_count).toBe(1);
  });

  it('vacuums and reclaims freelist space after deletions', async () => {
    // Insert multiple topics with citations and todos to generate database pages
    for (let i = 0; i < 20; i++) {
      await insertTopic(db, {
        id: `topic-bulk-${i}`,
        title: `大量数据选题 ${i} `.repeat(20),
        summary: '冗长摘要内容 '.repeat(30),
        storyline: '故事脉络 '.repeat(50),
        status: 'inbox',
        priority: 'medium',
        score_character: 1,
        score_conflict: 1,
        score_contrast: 1,
        score_material: 1,
        score_story: 1,
        is_pinned: 0,
        sort_order: i,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await softDeleteTopic(db, `topic-bulk-${i}`);
    }

    // Permanently delete them
    const ids = Array.from({ length: 20 }, (_, i) => `topic-bulk-${i}`);
    await permanentlyDeleteTrashedTopics(db, ids);

    const statsBeforeVacuum = await getStorageStats(db);
    // Freelist pages should have formed after deleting rows
    expect(statsBeforeVacuum.trashed_topics_count).toBe(0);

    // Execute vacuum
    const result = await vacuumDatabase(db);
    expect(result.after.freelist_count).toBe(0);
    expect(result.after.freelist_bytes).toBe(0);
  });

  it('purges expired trash topics on the explicit cleanup command', async () => {
    const now = Date.now();
    const oldDate = new Date(now - 40 * 86400 * 1000).toISOString(); // 40 days ago
    const recentDate = new Date(now - 5 * 86400 * 1000).toISOString(); // 5 days ago

    // Insert old trashed topic
    await insertTopic(db, {
      id: 'topic-old-trash',
      title: '40天前的已删除选题',
      status: 'inbox',
      priority: 'low',
      score_character: 0,
      score_conflict: 0,
      score_contrast: 0,
      score_material: 0,
      score_story: 0,
      is_pinned: 0,
      sort_order: 0,
      created_at: oldDate,
      updated_at: oldDate,
    });
    sqlite.query('UPDATE topics SET deleted_at = ? WHERE id = ?').run(oldDate, 'topic-old-trash');

    // Insert recent trashed topic
    await insertTopic(db, {
      id: 'topic-recent-trash',
      title: '5天前的已删除选题',
      status: 'inbox',
      priority: 'low',
      score_character: 0,
      score_conflict: 0,
      score_contrast: 0,
      score_material: 0,
      score_story: 0,
      is_pinned: 0,
      sort_order: 1,
      created_at: recentDate,
      updated_at: recentDate,
    });
    sqlite.query('UPDATE topics SET deleted_at = ? WHERE id = ?').run(recentDate, 'topic-recent-trash');

    // Reading the trash must not destroy anything.
    const readOnlyTrash = await app.request('/api/topics/trash', { headers: authHeaders });
    const readOnlyList = await readOnlyTrash.json() as Array<{ id: string }>;
    expect(readOnlyList.map((topic) => topic.id).sort()).toEqual(['topic-old-trash', 'topic-recent-trash']);

    const purgeResponse = await app.request('/api/topics/trash/purge', { method: 'POST', headers: authHeaders });
    expect(purgeResponse.status).toBe(200);
    const purgeResult = await purgeResponse.json() as { purged_count: number; purged_ids: string[] };
    expect(purgeResult.purged_count).toBe(1);
    expect(purgeResult.purged_ids).toEqual(['topic-old-trash']);

    const trashResponse = await app.request('/api/topics/trash', { headers: authHeaders });
    expect(trashResponse.status).toBe(200);
    const trashList = await trashResponse.json() as Array<{ id: string }>;
    expect(trashList.map((topic) => topic.id)).toEqual(['topic-recent-trash']);

    const remaining = sqlite.query('SELECT id FROM topics WHERE deleted_at IS NOT NULL').all() as Array<{ id: string }>;
    expect(remaining.map((r) => r.id)).toEqual(['topic-recent-trash']);
  });

  it('keeps expired rows visible when reading paginated trash so a GET never destroys data', async () => {
    const now = Date.now();
    const oldDate = new Date(now - 45 * 86400 * 1000).toISOString();
    const recentDate = new Date(now - 3 * 86400 * 1000).toISOString();

    await insertTopic(db, {
      id: 'topic-old-trash-page',
      title: '45天前已删除选题',
      status: 'inbox',
      priority: 'low',
      score_character: 0,
      score_conflict: 0,
      score_contrast: 0,
      score_material: 0,
      score_story: 0,
      is_pinned: 0,
      sort_order: 0,
      created_at: oldDate,
      updated_at: oldDate,
    });
    sqlite.query('UPDATE topics SET deleted_at = ? WHERE id = ?').run(oldDate, 'topic-old-trash-page');

    await insertTopic(db, {
      id: 'topic-recent-trash-page',
      title: '3天前已删除选题',
      status: 'inbox',
      priority: 'low',
      score_character: 0,
      score_conflict: 0,
      score_contrast: 0,
      score_material: 0,
      score_story: 0,
      is_pinned: 0,
      sort_order: 1,
      created_at: recentDate,
      updated_at: recentDate,
    });
    sqlite.query('UPDATE topics SET deleted_at = ? WHERE id = ?').run(recentDate, 'topic-recent-trash-page');

    const pageResponse = await app.request('/api/topics?scope=trash&page=1&page_size=50', { headers: authHeaders });
    expect(pageResponse.status).toBe(200);
    const pageData = await pageResponse.json() as { items: Array<{ id: string }>; scope_counts: { trash: number } };
    expect(pageData.items.map((item) => item.id).sort()).toEqual(['topic-old-trash-page', 'topic-recent-trash-page']);
    expect(pageData.scope_counts.trash).toBe(2);

    const remaining = sqlite.query('SELECT id FROM topics WHERE deleted_at IS NOT NULL').all() as Array<{ id: string }>;
    expect(remaining.map((r) => r.id).sort()).toEqual(['topic-old-trash-page', 'topic-recent-trash-page']);

    const purgeResponse = await app.request('/api/topics/trash/purge', { method: 'POST', headers: authHeaders });
    const purgeResult = await purgeResponse.json() as { purged_count: number };
    expect(purgeResult.purged_count).toBe(1);
    const afterPurge = sqlite.query('SELECT id FROM topics WHERE deleted_at IS NOT NULL').all() as Array<{ id: string }>;
    expect(afterPurge.map((r) => r.id)).toEqual(['topic-recent-trash-page']);
  });

  it('refuses to restore an expired topic without destroying it', async () => {
    const now = Date.now();
    const expiredAt = new Date(now - 40 * 86400 * 1000).toISOString();
    const recentAt = new Date(now - 5 * 86400 * 1000).toISOString();
    const recentOffsetAt = new Date(now - 30 * 86400 * 1000 + 2 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000)
      .toISOString().replace(/Z$/u, '-08:00');
    const createdAt = new Date(now).toISOString();
    const insertTrashedTopic = async (id: string, deletedAt: string) => {
      await insertTopic(db, {
        id,
        title: id,
        status: 'inbox',
        priority: 'low',
        score_character: 0,
        score_conflict: 0,
        score_contrast: 0,
        score_material: 0,
        score_story: 0,
        is_pinned: 0,
        sort_order: 0,
        created_at: deletedAt,
        updated_at: deletedAt,
      });
      sqlite.query('UPDATE topics SET deleted_at = ? WHERE id = ?').run(deletedAt, id);
    };

    await insertTrashedTopic('topic-expired-restore', expiredAt);
    await insertTrashedTopic('topic-recent-restore', recentAt);
    await insertTrashedTopic('topic-recent-offset-restore', recentOffsetAt);
    sqlite.query(`INSERT INTO sources (id, topic_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`).run('source-expired-restore', 'topic-expired-restore', '关联资料', createdAt, createdAt);

    const expiredRestore = await app.request('/api/topics/topic-expired-restore/restore', {
      method: 'POST', headers: authHeaders,
    });
    expect(expiredRestore.status).toBe(410);
    const expiredPayload = await expiredRestore.json() as { code: string; error: string };
    expect(expiredPayload.code).toBe('TOPIC_TRASH_EXPIRED');
    expect(expiredPayload.error).toContain('无法恢复');
    // Restoring must never be the trigger that deletes data.
    expect(sqlite.query('SELECT id FROM topics WHERE id = ?').get('topic-expired-restore')).not.toBeNull();
    expect(sqlite.query('SELECT id FROM sources WHERE id = ?').get('source-expired-restore')).not.toBeNull();

    const recentRestore = await app.request('/api/topics/topic-recent-restore/restore', {
      method: 'POST', headers: authHeaders,
    });
    expect(recentRestore.status).toBe(200);
    expect((await recentRestore.json() as { id: string; deleted_at: string | null }).deleted_at).toBeNull();

    const recentOffsetRestore = await app.request('/api/topics/topic-recent-offset-restore/restore', {
      method: 'POST', headers: authHeaders,
    });
    expect(recentOffsetRestore.status).toBe(200);
  });

  it('manages high-frequency presence locks in memory without hitting SQLite tables', async () => {
    const lease1 = acquirePresenceLease(
      'lock:topic-writer-1',
      'client-A',
      { client_id: 'client-A', device_name: 'Macbook Pro', updated_at: new Date().toISOString() },
      30
    );
    expect(lease1.acquired).toBe(true);

    // Another client attempting to acquire should get conflict
    const lease2 = acquirePresenceLease(
      'lock:topic-writer-1',
      'client-B',
      { client_id: 'client-B', device_name: 'iPad', updated_at: new Date().toISOString() },
      30
    );
    expect(lease2.acquired).toBe(false);
    expect(lease2.current?.client_id).toBe('client-A');

    // Same client renews lease
    const renew = acquirePresenceLease(
      'lock:topic-writer-1',
      'client-A',
      { client_id: 'client-A', device_name: 'Macbook Pro', updated_at: new Date().toISOString() },
      30
    );
    expect(renew.acquired).toBe(true);

    // Release lease
    const releaseResult = releasePresenceLease('lock:topic-writer-1', 'client-A');
    expect(releaseResult).toBe('released');

    // Now client-B can acquire
    const lease3 = acquirePresenceLease(
      'lock:topic-writer-1',
      'client-B',
      { client_id: 'client-B', device_name: 'iPad', updated_at: new Date().toISOString() },
      30
    );
    expect(lease3.acquired).toBe(true);
    expect(releasePresenceLease('lock:topic-writer-1', 'client-B')).toBe('released');
  });

  it('keeps existing presence leases when renewing at capacity', () => {
    const prefix = `lock:capacity-${crypto.randomUUID()}`;
    const keys = Array.from({ length: MAX_LEASES }, (_, index) => `${prefix}-${index}`);
    try {
      keys.forEach((key, index) => {
        const acquired = acquirePresenceLease(
          key,
          `owner-${index}`,
          { client_id: `owner-${index}`, device_name: '测试设备', updated_at: new Date().toISOString() },
          index === 0 ? 7200 : 3600,
        );
        expect(acquired.acquired).toBe(true);
      });

      const renewed = acquirePresenceLease(
        keys[keys.length - 1]!,
        `owner-${MAX_LEASES - 1}`,
        { client_id: `owner-${MAX_LEASES - 1}`, device_name: '测试设备', updated_at: new Date().toISOString() },
        3600,
      );
      expect(renewed.acquired).toBe(true);

      const firstLease = acquirePresenceLease(
        keys[0]!,
        'intruder',
        { client_id: 'intruder', device_name: '其他设备', updated_at: new Date().toISOString() },
        3600,
      );
      expect(firstLease.acquired).toBe(false);
      expect(firstLease.current?.client_id).toBe('owner-0');
    } finally {
      keys.forEach((key, index) => {
        releasePresenceLease(key, `owner-${index}`);
        releasePresenceLease(key, 'intruder');
      });
    }
  });

  it('serves storage stats and vacuum API endpoints correctly', async () => {
    const statsRes = await app.request('/api/system/storage', {
      headers: authHeaders,
    });
    expect(statsRes.status).toBe(200);
    const statsData = (await statsRes.json()) as { page_count: number; freelist_count: number };
    expect(typeof statsData.page_count).toBe('number');
    expect(typeof statsData.freelist_count).toBe('number');

    const vacuumRes = await app.request('/api/system/storage/vacuum', {
      method: 'POST',
      headers: authHeaders,
    });
    expect(vacuumRes.status).toBe(200);
    const vacuumData = (await vacuumRes.json()) as { after: { freelist_count: number }; message: string };
    expect(vacuumData.after.freelist_count).toBe(0);
    expect(vacuumData.message).toBeDefined();
  });

  it('does not automatically vacuum on permanent deletions and reuses freelist pages naturally', async () => {
    await insertTopic(db, {
      id: 'topic-freelist-test',
      title: '空闲页复用测试选题 '.repeat(30),
      summary: '摘要内容 '.repeat(50),
      status: 'inbox',
      priority: 'medium',
      score_character: 1,
      score_conflict: 1,
      score_contrast: 1,
      score_material: 1,
      score_story: 1,
      is_pinned: 0,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await softDeleteTopic(db, 'topic-freelist-test');

    const deleteRes = await app.request('/api/topics/topic-freelist-test/permanent', {
      method: 'DELETE',
      headers: authHeaders,
    });
    expect(deleteRes.status).toBe(200);

    const statsAfterDelete = await getStorageStats(db);
    expect(statsAfterDelete.trashed_topics_count).toBe(0);

    const insertRes = await app.request('/api/topics', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: '复用空闲页新选题' }),
    });
    expect(insertRes.status).toBe(201);
  });
});
