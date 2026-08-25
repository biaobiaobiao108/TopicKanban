import { describe, expect, it, beforeEach } from 'bun:test';
import {
  extractBvid,
  normalizeCoverUrl,
  getBilibiliCoverFromCache,
  setBilibiliCoverToCache,
} from '../src/lib/bilibili';

describe('Bilibili cover utilities and caching', () => {
  beforeEach(() => {
    // Clean up local mock or global localStorage if available
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('normalizes cover URLs correctly across different protocols', () => {
    expect(normalizeCoverUrl('http://i0.hdslb.com/bfs/archive/test.jpg')).toBe(
      'https://i0.hdslb.com/bfs/archive/test.jpg'
    );
    expect(normalizeCoverUrl('//i1.hdslb.com/bfs/archive/test2.jpg')).toBe(
      'https://i1.hdslb.com/bfs/archive/test2.jpg'
    );
    expect(normalizeCoverUrl('https://i2.hdslb.com/bfs/archive/test3.jpg')).toBe(
      'https://i2.hdslb.com/bfs/archive/test3.jpg'
    );
    expect(normalizeCoverUrl('')).toBe('');
    expect(normalizeCoverUrl(undefined)).toBe('');
  });

  it('extracts BV id from various URL and string formats', () => {
    expect(extractBvid('BV1xx411c7mD')).toBe('BV1xx411c7mD');
    expect(extractBvid('https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.999')).toBe('BV1xx411c7mD');
    expect(extractBvid('https://b23.tv/BV1xx411c7mD')).toBe('BV1xx411c7mD');
    expect(extractBvid('【【良子】峨眉山名场面】https://www.bilibili.com/video/BV17x411c7AA?vd_source=123')).toBe('BV17x411c7AA');
    expect(extractBvid('')).toBeNull();
    expect(extractBvid('invalid-string')).toBeNull();
  });

  it('sets and retrieves cover from localStorage cache', () => {
    const testBvid = 'BV1xx411c7mD';
    const testCover = 'https://i0.hdslb.com/bfs/archive/sample.jpg';

    expect(getBilibiliCoverFromCache(testBvid)).toBeNull();
    setBilibiliCoverToCache(testBvid, testCover);
    expect(getBilibiliCoverFromCache(testBvid)).toBe(testCover);
  });
});
