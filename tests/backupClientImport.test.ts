import { afterEach, describe, expect, it } from 'bun:test';
import { importBackupData } from '../src/lib/storageApi';

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('client backup import', () => {
  it('reports business restore success when saving local preferences fails', async () => {
    const requests: RequestInit[] = [];
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => key === 'topic_kanban_auth_token_v1' ? 'v1.test-token' : null,
        setItem: () => { throw new Error('storage unavailable'); },
        removeItem: () => undefined,
      },
    });
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init || {});
      return Response.json({ success: true });
    }) as typeof fetch;

    const result = await importBackupData(JSON.stringify({
      version: '5.0',
      topics: [],
      settings: { reading_speed: 280, theme: 'light' },
    }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('PUT');
    expect(result).toMatchObject({
      success: true,
      settingsWarning: '业务数据已恢复，但本地偏好设置未能保存。请检查浏览器存储权限后，在此浏览器重新设置。',
    });
  });
});
