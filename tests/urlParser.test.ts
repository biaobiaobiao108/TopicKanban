import { describe, it, expect } from 'vitest';
import { extractBilibiliId, parseUrlMetadata } from '../src/server/urlParser';

describe('URL Parser & Metadata Ingestion', () => {
  it('extracts BV id and av id from various Bilibili URL formats', () => {
    const bv1 = extractBilibiliId('https://www.bilibili.com/video/BV1xx411c7mD');
    expect(bv1).toEqual({ bvid: 'BV1xx411c7mD' });

    const bv2 = extractBilibiliId('【独家】测试视频 https://b23.tv/BV1234567890 赶快看');
    expect(bv2).toEqual({ bvid: 'BV1234567890' });

    const av1 = extractBilibiliId('https://www.bilibili.com/video/av170001');
    expect(av1).toEqual({ aid: '170001' });
  });

  it('detects platforms and handles generic URLs gracefully', async () => {
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
