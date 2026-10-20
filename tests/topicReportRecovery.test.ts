import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  clearTopicReportRecoveryIfMatches,
  readTopicReportRecovery,
  writeTopicReportRecovery,
} from '../src/lib/topicReportRecovery';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    },
  });
});

describe('topic report local recovery', () => {
  it('stores report content and the server version it was based on', () => {
    expect(writeTopicReportRecovery('topic/1', {
      markdown: '# 本机稿件',
      html: '<h1>本机稿件</h1>',
      json: '{"type":"doc"}',
      wordCount: 4,
      baseVersion: 7,
    })).toBe(true);

    expect(readTopicReportRecovery('topic/1')).toMatchObject({
      markdown: '# 本机稿件',
      html: '<h1>本机稿件</h1>',
      json: '{"type":"doc"}',
      wordCount: 4,
      baseVersion: 7,
    });
  });

  it('does not remove a newer recovery snapshot after an older save succeeds', () => {
    writeTopicReportRecovery('topic-2', {
      markdown: '# 新稿', html: '<h1>新稿</h1>', json: '{}', wordCount: 2, baseVersion: 8,
    });
    clearTopicReportRecoveryIfMatches('topic-2', {
      markdown: '# 旧稿', html: '<h1>旧稿</h1>', json: '{}', baseVersion: 7,
    });

    expect(readTopicReportRecovery('topic-2')?.markdown).toBe('# 新稿');
  });

  it('expires and removes recovery snapshots older than 90 days', () => {
    values.set('topic_report_recovery_v1:topic-old', JSON.stringify({
      markdown: '# 过期稿', html: '<h1>过期稿</h1>', json: '{}', wordCount: 3,
      baseVersion: 1, savedAt: '2025-01-01T00:00:00.000Z',
    }));

    expect(readTopicReportRecovery('topic-old')).toBeNull();
    expect(values.has('topic_report_recovery_v1:topic-old')).toBe(false);
  });
});

afterEach(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});
