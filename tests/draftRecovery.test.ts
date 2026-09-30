import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  cacheDraftLocally, clearRemoteStorageMemoryCaches, DraftConflictError,
  fetchDraftByTopicId, resolveDraftRecovery, saveDraft, saveDraftImmediatelyWithStatus,
} from '../src/lib/remoteStorage';
import type { Draft } from '../src/types';

const pendingKey = 'topic_kanban_pending_drafts_v3';
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let store: Map<string, string>;
let cloud: Draft;
let puts: Array<{ base_version: number; content_markdown: string }>;

beforeEach(() => {
  store = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  } });
  clearRemoteStorageMemoryCaches();
  puts = [];
  cloud = { id: 'draft-1', topic_id: 'topic-1', title: '云端标题', content_markdown: '云端正文',
    content_html: '<p>云端正文</p>', content_json: '{}', word_count: 4, version: 1,
    updated_at: new Date().toISOString() };
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== 'PUT') return Response.json(cloud);
    const body = JSON.parse(init.body as string);
    puts.push(body);
    if (body.base_version !== cloud.version) return Response.json({ error: 'DRAFT_CONFLICT', current: cloud }, { status: 409 });
    cloud = { ...cloud, ...body, version: cloud.version + 1 };
    return Response.json(cloud);
  }) as typeof fetch;
});

afterEach(async () => {
  // Drain background keepalive saves before restoring the shared globals.
  await new Promise(resolve => setTimeout(resolve, 0));
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  clearRemoteStorageMemoryCaches();
});

const saveLocal = () => saveDraft('topic-1', '<p>旧本地稿</p>', '{}', 4, '本地标题', '旧本地稿');
const pending = () => JSON.parse(store.get(pendingKey) || '{}')['topic-1'];

async function createConflict() {
  await fetchDraftByTopicId('topic-1');
  cloud = { ...cloud, version: 2 };
  await expect(saveLocal()).rejects.toBeInstanceOf(DraftConflictError);
}

describe('草稿冲突防覆盖与恢复', () => {
  it('409 后排队保存、后台同步和再次保存均不覆盖云端', async () => {
    await fetchDraftByTopicId('topic-1');
    cloud = { ...cloud, version: 2 };
    const first = saveLocal().catch(error => error);
    const queued = saveLocal().catch(error => error);
    const failures = await Promise.all([first, queued]);
    for (const failure of failures) expect(failure).toBeInstanceOf(DraftConflictError);
    saveDraftImmediatelyWithStatus('topic-1', '<p>修改后本地稿</p>', '{}', 6, '本地标题', '修改后本地稿');
    await expect(saveLocal()).rejects.toBeInstanceOf(DraftConflictError);
    expect(puts).toHaveLength(1);
    expect(cloud.content_markdown).toBe('云端正文');
    expect(pending().base_version).toBe(1);
    expect(pending().requires_resolution).toBe(true);
  });

  it('重新加载冲突时保留旧 base，后台仍只保留本地稿', async () => {
    await createConflict();
    clearRemoteStorageMemoryCaches();
    const result = await fetchDraftByTopicId('topic-1');
    expect(result.conflict?.base_version).toBe(1);
    cacheDraftLocally('topic-1', '<p>后续修改</p>', '{}', 4, '本地标题', '后续修改');
    expect(pending().base_version).toBe(1);
    await expect(saveLocal()).rejects.toBeInstanceOf(DraftConflictError);
    expect(puts).toHaveLength(1);
  });

  it('明确保留本地后才采用云端最新版本号上传', async () => {
    await createConflict();
    const result = await fetchDraftByTopicId('topic-1');
    const resolved = await resolveDraftRecovery('topic-1', result.conflict!, 'local');
    expect(puts.map(p => p.base_version)).toEqual([1, 2]);
    expect(resolved?.version).toBe(3);
    expect(cloud.content_markdown).toBe('旧本地稿');
    expect(pending()).toBeUndefined();
  });

  it('选择云端清除本地恢复记录，重新进入和刷新均无冲突', async () => {
    await createConflict();
    const result = await fetchDraftByTopicId('topic-1');
    const resolved = await resolveDraftRecovery('topic-1', result.conflict!, 'remote');
    expect(resolved).toEqual(cloud);
    expect(pending()).toBeUndefined();
    expect(puts).toHaveLength(1);
    expect(await fetchDraftByTopicId('topic-1')).toEqual({ draft: cloud, conflict: null });
    clearRemoteStorageMemoryCaches();
    expect(await fetchDraftByTopicId('topic-1')).toEqual({ draft: cloud, conflict: null });
  });
});
