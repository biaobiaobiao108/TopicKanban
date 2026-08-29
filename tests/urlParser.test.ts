import { describe, expect, it } from 'bun:test';
import { detectPlatformFromText, extractUrlFromText } from '../src/lib/clientUrlParser';
import { isSafeExternalHttpUrl, sanitizeExternalHttpUrl } from '../src/lib/urlSafety';

describe('External URL safety', () => {
  it('allows public HTTP(S) URLs and rejects executable schemes', () => {
    expect(isSafeExternalHttpUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(true);
    expect(isSafeExternalHttpUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isSafeExternalHttpUrl('http://example.com/article')).toBe(true);
    expect(isSafeExternalHttpUrl('https://x.com/home https://x.com/home')).toBe(false);
    expect(isSafeExternalHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeExternalHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalHttpUrl('ftp://example.com/file')).toBe(false);
  });

  it('rejects private and reserved IPv4, IPv6, and IPv4-mapped IPv6 addresses', () => {
    expect(isSafeExternalHttpUrl('http://127.0.0.1:8787/')).toBe(false);
    expect(isSafeExternalHttpUrl('http://192.168.1.1/admin')).toBe(false);
    expect(isSafeExternalHttpUrl('http://[::1]/')).toBe(false);
    expect(isSafeExternalHttpUrl('http://[::ffff:127.0.0.1]/')).toBe(false);
    expect(isSafeExternalHttpUrl('http://[::ffff:7f00:1]/')).toBe(false);
    expect(isSafeExternalHttpUrl('http://[::ffff:c0a8:101]/')).toBe(false);
  });

  it('returns an empty renderable URL for unsafe values', () => {
    expect(sanitizeExternalHttpUrl(' javascript:alert(1) ')).toBe('');
    expect(sanitizeExternalHttpUrl(' https://example.com/article ')).toBe('https://example.com/article');
    expect(sanitizeExternalHttpUrl('')).toBe('');
  });
});

describe('Client-side URL parser', () => {
  it('detects supported platforms without server fetching', () => {
    expect(detectPlatformFromText('https://www.bilibili.com/video/BV123')).toBe('bilibili');
    expect(detectPlatformFromText('https://www.youtube.com/watch?v=123')).toBe('youtube');
    expect(detectPlatformFromText('https://www.douyin.com/video/123')).toBe('douyin');
    expect(detectPlatformFromText('https://www.xiaohongshu.com/explore/123')).toBe('xiaohongshu');
  });

  it('extracts URLs from share text locally', () => {
    expect(extractUrlFromText('看这个视频 https://example.com/article 真有意思')).toBe('https://example.com/article');
    expect(extractUrlFromText('BV1xx411c7mD')).toBe('https://www.bilibili.com/video/BV1xx411c7mD');
  });
});
