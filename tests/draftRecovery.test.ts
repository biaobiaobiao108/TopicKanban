import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  cacheDraftLocally,
  clearStorageMemoryCaches,
  DraftConflictError,
  fetchDraftByTopicId,
  importBackupData,
  resolveDraftRecovery,
  saveDraft,
  saveDraftImmediatelyWithStatus,
} from '../src/lib/storageApi';
import type { Draft } from '../src/types';

const pendingKey = 'topic_kanban_pending_drafts_v3';
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let store: Map<string, string>;
let cloud: Draft;
let puts: Array<{ base_version: number; content_markdown: string }>;

beforeEach(() => {
  store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
  clearStorageMemoryCaches();
  puts = [];
  cloud = {
    id: 'draft-1',
    topic_id: 'topic-1',
    title: '云端标题',
    content_markdown: '云端正文',
    content_html: '<p>云端正文</p>',
    content_json: '{}',
    word_count: 4,
    version: 1,
    updated_at: new Date().toISOString(),
  };
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== 'PUT') return Response.json(cloud);
    const body = JSON.parse(init.body as string);
    puts.push(body);
    if (body.base_version !== cloud.version)
      return Response.json({ error: 'DRAFT_CONFLICT', current: cloud }, { status: 409 });
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
  clearStorageMemoryCaches();
});

const saveLocal = () => saveDraft('topic-1', '<p>旧本地稿</p>', '{}', 4, '本地标题', '旧本地稿');
const pending = () => JSON.parse(store.get(pendingKey) || '{}')['topic-1'];

async function createConflict() {
  await fetchDraftByTopicId('topic-1');
  cloud = { ...cloud, version: 2 };
  await expect(saveLocal()).rejects.toBeInstanceOf(DraftConflictError);
}

describe('草稿冲突防覆盖与恢复', () => {
  it('会话清理后取消旧的排队上传，新会话仍可正常保存', async () => {
    await fetchDraftByTopicId('topic-1');
    const request = globalThis.fetch;
    const authorizations: Array<string | null> = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        authorizations.push(new Headers(init.headers).get('Authorization'));
        if (authorizations.length === 1) await gate;
      }
      return request(input, init);
    }) as typeof fetch;
    store.set('topic_kanban_auth_token_v1', 'v1.old-session');
    const first = saveLocal();
    const queued = saveLocal().catch(error => error);
    clearStorageMemoryCaches();
    store.set('topic_kanban_auth_token_v1', 'v1.new-session');
    release();
    await first;
    expect(await queued).toMatchObject({ message: '草稿保存所属会话已失效' });
    expect(authorizations).toEqual(['Bearer v1.old-session']);
    expect(pending().draft.content_markdown).toBe('旧本地稿');

    await fetchDraftByTopicId('topic-1');
    const recovered = await fetchDraftByTopicId('topic-1');
    await resolveDraftRecovery('topic-1', recovered.conflict!, 'local');
    expect(authorizations).toEqual(['Bearer v1.old-session', 'Bearer v1.new-session']);
    expect(pending()).toBeUndefined();
  });

  it('备份恢复后即使版本号相同，也要求显式选择旧本地稿', async () => {
    await fetchDraftByTopicId('topic-1');
    cacheDraftLocally('topic-1', '<p>导入前本地稿</p>', '{}', 6, '本地标题', '导入前本地稿');
    const request = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === '/api/backup') {
        cloud = { ...cloud, content_markdown: '备份中的正文', content_html: '<p>备份中的正文</p>' };
        return Response.json({ success: true });
      }
      return request(input, init);
    }) as typeof fetch;
    expect(await importBackupData('{}')).toEqual({ success: true });
    clearStorageMemoryCaches();
    const result = await fetchDraftByTopicId('topic-1');
    expect(result.draft?.content_markdown).toBe('备份中的正文');
    expect(result.conflict?.local.content_markdown).toBe('导入前本地稿');
    expect(result.conflict?.base_version).toBe(cloud.version);
    await expect(saveLocal()).rejects.toBeInstanceOf(DraftConflictError);
    expect(puts).toHaveLength(0);
    await resolveDraftRecovery('topic-1', result.conflict!, 'remote');
    expect(pending()).toBeUndefined();
    expect(cloud.content_markdown).toBe('备份中的正文');
  });

  it('无法持久化本地稿隔离标记时，在替换服务端数据前中止导入', async () => {
    await fetchDraftByTopicId('topic-1');
    cacheDraftLocally('topic-1', '<p>本地稿</p>', '{}', 3, '标题', '本地稿');
    localStorage.setItem = () => {
      throw new Error('quota exceeded');
    };
    let backupRequests = 0;
    globalThis.fetch = (async () => {
      backupRequests += 1;
      return Response.json({ success: true });
    }) as unknown as typeof fetch;
    expect(await importBackupData('{}')).toMatchObject({ success: false, error: expect.stringContaining('无法隔离') });
    expect(backupRequests).toBe(0);
    expect(pending().draft.content_markdown).toBe('本地稿');
  });

  it('备份替换等待已发出的上传完成，并取消尚未发出的旧稿', async () => {
    await fetchDraftByTopicId('topic-1');
    const request = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let backupRequests = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === '/api/backup') {
        backupRequests += 1;
        cloud = { ...cloud, content_markdown: '恢复后的正文', version: 1 };
        return Response.json({ success: true });
      }
      if (init?.method === 'PUT') await gate;
      return request(input, init);
    }) as typeof fetch;
    const first = saveLocal();
    const queued = saveLocal().catch(error => error);
    const importing = importBackupData('{}');
    expect(backupRequests).toBe(0);
    release();
    await first;
    expect(await queued).toBeInstanceOf(Error);
    expect(await importing).toEqual({ success: true });
    expect(puts).toHaveLength(1);
    expect(cloud.content_markdown).toBe('恢复后的正文');
    expect((await fetchDraftByTopicId('topic-1')).conflict?.local.content_markdown).toBe('旧本地稿');
  });

  it('旧快照上传成功后推进较新本地稿的基础版本，重新进入无需处理虚假冲突', async () => {
    await fetchDraftByTopicId('topic-1');
    const request = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') await gate;
      return request(input, init);
    }) as typeof fetch;

    const uploading = saveLocal();
    cacheDraftLocally('topic-1', '<p>较新本地稿</p>', '{}', 5, '新标题', '较新本地稿');
    release();
    await uploading;

    expect(pending()).toMatchObject({
      base_version: 2,
      draft: { version: 2, content_markdown: '较新本地稿', title: '新标题' },
    });
    clearStorageMemoryCaches();
    const recovered = await fetchDraftByTopicId('topic-1');
    expect(recovered.conflict).toBeNull();
    expect(recovered.draft?.content_markdown).toBe('较新本地稿');
    await saveDraft('topic-1', '<p>较新本地稿</p>', '{}', 5, '新标题', '较新本地稿');
    expect(cloud.version).toBe(3);
    expect(pending()).toBeUndefined();
  });

  it('后台保存的失败可见，重试后才清除本地恢复记录', async () => {
    await fetchDraftByTopicId('topic-1');
    const request = globalThis.fetch;
    let keepalive: boolean | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      keepalive = init?.keepalive;
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    await expect(saveDraft('topic-1', '<p>离线稿</p>', '{}', 3, '标题', '离线稿', true)).rejects.toThrow('offline');
    expect(keepalive).toBe(true);
    expect(pending().draft.content_markdown).toBe('离线稿');
    globalThis.fetch = request;
    await saveDraft('topic-1', '<p>离线稿</p>', '{}', 3, '标题', '离线稿', true);
    expect(pending()).toBeUndefined();
    expect(cloud.content_markdown).toBe('离线稿');
  });

  it('大文案后台保存不使用超过浏览器配额的 keepalive 请求', async () => {
    await fetchDraftByTopicId('topic-1');
    const request = globalThis.fetch;
    let keepalive: boolean | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      keepalive = init?.keepalive;
      return request(input, init);
    }) as typeof fetch;
    await saveDraft('topic-1', '', '{}', 30000, '标题', '文'.repeat(30000), true);
    expect(keepalive).toBe(false);
    expect(pending()).toBeUndefined();
  });

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
    clearStorageMemoryCaches();
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
    clearStorageMemoryCaches();
    expect(await fetchDraftByTopicId('topic-1')).toEqual({ draft: cloud, conflict: null });
  });

  it('兼容云端版本的本地草稿会标记待同步，上传成功后清除恢复记录', async () => {
    await fetchDraftByTopicId('topic-1');
    cacheDraftLocally('topic-1', '<p>待同步正文</p>', '{}', 5, '待同步标题', '待同步正文');

    const recovered = await fetchDraftByTopicId('topic-1');
    expect(recovered.draft).toMatchObject({
      content_markdown: '待同步正文',
      pending_sync: true,
    });

    await saveDraft('topic-1', '<p>待同步正文</p>', '{}', 5, '待同步标题', '待同步正文');
    expect(pending()).toBeUndefined();
    expect(cloud.content_markdown).toBe('待同步正文');
  });
});
