import { describe, it, expect } from 'vitest';
import {
  extractBilibiliId,
  parseUrlMetadata,
  isPrivateOrReservedIp,
  isSafePublicUrl,
  detectPlatformFromUrl,
} from '../src/server/urlParser';

describe('SSRF Protection & IP Security', () => {
  it('identifies private and reserved IPv4 addresses correctly', () => {
    // Loopback
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('127.255.255.254')).toBe(true);

    // Private networks (RFC 1918)
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.255.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.0.254')).toBe(true);

    // Cloud metadata / Link-local
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.1.1')).toBe(true);

    // Current network, Carrier-grade NAT, Documentation, Multicast, Broadcast
    expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
    expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.0.2.1')).toBe(true);
    expect(isPrivateOrReservedIp('198.51.100.1')).toBe(true);
    expect(isPrivateOrReservedIp('203.0.113.1')).toBe(true);
    expect(isPrivateOrReservedIp('224.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('240.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('255.255.255.255')).toBe(true);

    // Public IPv4 addresses
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrReservedIp('114.114.114.114')).toBe(false);
    expect(isPrivateOrReservedIp('172.15.0.1')).toBe(false);
    expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false);
  });

  it('identifies private and reserved IPv6 addresses correctly', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('::')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd12:3456:789a::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:192.168.1.1')).toBe(true);

    // Public IPv6
    expect(isPrivateOrReservedIp('2001:4860:4860::8888')).toBe(false);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });

  it('validates safe public URLs and blocks SSRF vectors', () => {
    // Blocks internal hosts & schemes
    expect(isSafePublicUrl('http://127.0.0.1:8787/api/settings')).toBe(false);
    expect(isSafePublicUrl('http://localhost:3000/')).toBe(false);
    expect(isSafePublicUrl('http://app.local/internal')).toBe(false);
    expect(isSafePublicUrl('http://metadata.internal')).toBe(false);
    expect(isSafePublicUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafePublicUrl('http://192.168.1.1/admin')).toBe(false);
    expect(isSafePublicUrl('http://10.0.0.1/')).toBe(false);
    expect(isSafePublicUrl('file:///etc/passwd')).toBe(false);
    expect(isSafePublicUrl('ftp://example.com/file')).toBe(false);
    expect(isSafePublicUrl('gopher://127.0.0.1:70/')).toBe(false);
    expect(isSafePublicUrl('javascript:alert(1)')).toBe(false);
    expect(isSafePublicUrl('http://0177.0.0.1')).toBe(false);
    expect(isSafePublicUrl('http://2130706433')).toBe(false);

    // Allows legitimate public URLs
    expect(isSafePublicUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(true);
    expect(isSafePublicUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isSafePublicUrl('https://zhihu.com/question/123456')).toBe(true);
    expect(isSafePublicUrl('http://example.com/article')).toBe(true);
  });
});

describe('URL Parser & Platform Detection', () => {
  it('extracts BV id and av id from various Bilibili URL formats', () => {
    const bv1 = extractBilibiliId('https://www.bilibili.com/video/BV1xx411c7mD');
    expect(bv1).toEqual({ bvid: 'BV1xx411c7mD' });

    const bv2 = extractBilibiliId('【独家】测试视频 https://b23.tv/BV1234567890 赶快看');
    expect(bv2).toEqual({ bvid: 'BV1234567890' });

    const av1 = extractBilibiliId('https://www.bilibili.com/video/av170001');
    expect(av1).toEqual({ aid: '170001' });
  });

  it('detects platform correctly from various URLs', () => {
    expect(detectPlatformFromUrl('https://www.bilibili.com/video/BV123')).toBe('bilibili');
    expect(detectPlatformFromUrl('https://b23.tv/xyz')).toBe('bilibili');
    expect(detectPlatformFromUrl('https://www.youtube.com/watch?v=123')).toBe('youtube');
    expect(detectPlatformFromUrl('https://youtu.be/123')).toBe('youtube');
    expect(detectPlatformFromUrl('https://www.douyin.com/video/123')).toBe('douyin');
    expect(detectPlatformFromUrl('https://v.douyin.com/abc/')).toBe('douyin');
    expect(detectPlatformFromUrl('https://www.kuaishou.com/short-video/123')).toBe('kuaishou');
    expect(detectPlatformFromUrl('https://weibo.com/123/456')).toBe('weibo');
    expect(detectPlatformFromUrl('https://www.xiaohongshu.com/explore/123')).toBe('xiaohongshu');
    expect(detectPlatformFromUrl('https://mp.weixin.qq.com/s/123')).toBe('wechat');
    expect(detectPlatformFromUrl('https://www.zhihu.com/question/123')).toBe('zhihu');
    expect(detectPlatformFromUrl('https://news.ycombinator.com')).toBe('other');
  });

  it('blocks SSRF targets immediately without throwing or leaking', async () => {
    const internal = await parseUrlMetadata('http://127.0.0.1:8787/api/settings');
    expect(internal.title).toBe('http://127.0.0.1:8787/api/settings');
    expect(internal.author).toBe('');
    expect(internal.content).toBe('');

    const cloudMeta = await parseUrlMetadata('http://169.254.169.254/latest/meta-data/');
    expect(cloudMeta.title).toBe('http://169.254.169.254/latest/meta-data/');
    expect(cloudMeta.author).toBe('');
  });

  it('handles generic public URLs gracefully', async () => {
    const zhihu = await parseUrlMetadata('https://www.zhihu.com/question/123456');
    expect(zhihu.platform).toBe('zhihu');
    expect(zhihu.url).toBe('https://www.zhihu.com/question/123456');

    const weibo = await parseUrlMetadata('https://weibo.com/123456/abcdef');
    expect(weibo.platform).toBe('weibo');

    const wechat = await parseUrlMetadata('https://mp.weixin.qq.com/s/abcdef');
    expect(wechat.platform).toBe('wechat');

    const douyin = await parseUrlMetadata('https://www.douyin.com/video/123456');
    expect(douyin.platform).toBe('douyin');
  });
});
