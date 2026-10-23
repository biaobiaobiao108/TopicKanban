import { afterEach, describe, expect, it } from 'bun:test';
import { importBackupData } from '../src/lib/storageApi';
import {
  readTopicReportRecovery,
  topicReportRecoveryConflicts,
  writeTopicReportRecovery,
} from '../src/lib/topicReportRecovery';

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('client backup import', () => {
  const installStorage = (fail?: 'read' | 'write') => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => {
          if (fail === 'read' && key.startsWith('topic_report_recovery_v1:')) throw new Error('storage read failed');
          return key === 'topic_kanban_auth_token_v1' ? 'v1.test-token' : (values.get(key) ?? null);
        },
        setItem: (key: string, value: string) => {
          if (fail === 'write' && key.startsWith('topic_report_recovery_v1:')) throw new Error('storage write failed');
          values.set(key, value);
        },
        removeItem: (key: string) => values.delete(key),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
      },
    });
    return values;
  };

  it('reports business restore success when saving local preferences fails', async () => {
    const requests: RequestInit[] = [];
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => (key === 'topic_kanban_auth_token_v1' ? 'v1.test-token' : null),
        setItem: () => {
          throw new Error('storage unavailable');
        },
        removeItem: () => undefined,
      },
    });
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init || {});
      return Response.json({ success: true });
    }) as typeof fetch;

    const result = await importBackupData(
      JSON.stringify({
        version: '5.0',
        topics: [],
        settings: { reading_speed: 280, theme: 'light' },
      }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('PUT');
    expect(result).toMatchObject({
      success: true,
      settingsWarning: '业务数据已恢复，但本地偏好设置未能保存。请检查浏览器存储权限后，在此浏览器重新设置。',
    });
  });

  it.each(['read', 'write'] as const)(
    'does not send the backup when an existing report cannot be isolated (%s failure)',
    async failure => {
      const values = installStorage();
      expect(
        writeTopicReportRecovery('topic-restore', {
          markdown: '# 未同步报告',
          html: '<h1>未同步报告</h1>',
          json: '{}',
          wordCount: 5,
          baseVersion: 4,
        }),
      ).toBe(true);
      // Fail only after the recovery snapshot has been created.
      const storage = globalThis.localStorage;
      const originalGet = storage.getItem.bind(storage);
      const originalSet = storage.setItem.bind(storage);
      if (failure === 'read') {
        storage.getItem = (key: string) => {
          if (key.startsWith('topic_report_recovery_v1:')) throw new Error('storage read failed');
          return originalGet(key);
        };
      } else {
        storage.setItem = (key: string, value: string) => {
          if (key.startsWith('topic_report_recovery_v1:')) throw new Error('storage write failed');
          originalSet(key, value);
        };
      }
      const requests: RequestInit[] = [];
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(init || {});
        return Response.json({ success: true });
      }) as typeof fetch;

      const result = await importBackupData('{}');

      expect(requests).toHaveLength(0);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/本地报告/);
      expect(values.has('topic_report_recovery_v1:topic-restore')).toBe(true);
    },
  );

  it('isolates a same-version report before replacing the server backup', async () => {
    installStorage();
    writeTopicReportRecovery('topic-restore', {
      markdown: '# 未同步报告',
      html: '<h1>未同步报告</h1>',
      json: '{}',
      wordCount: 5,
      baseVersion: 4,
    });
    globalThis.fetch = (async () => Response.json({ success: true })) as unknown as typeof fetch;

    const result = await importBackupData('{}');
    const recovery = readTopicReportRecovery('topic-restore');

    expect(result.success).toBe(true);
    expect(recovery?.markdown).toBe('# 未同步报告');
    expect(topicReportRecoveryConflicts(recovery!, 4)).toBe(true);
  });
});
