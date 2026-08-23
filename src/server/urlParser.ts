import type { PlatformType } from '../types';

export interface ParsedUrlMetadata {
  title: string;
  author: string;
  content: string;
  published_at: string;
  platform: PlatformType;
  url: string;
  cover_url?: string;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function detectPlatformFromUrl(urlStr: string): PlatformType {
  const lower = urlStr.toLowerCase();
  if (lower.includes('bilibili.com') || lower.includes('b23.tv')) return 'bilibili';
  if (lower.includes('douyin.com') || lower.includes('iesdouyin.com')) return 'douyin';
  if (lower.includes('kuaishou.com')) return 'kuaishou';
  if (lower.includes('weibo.com') || lower.includes('weibo.cn')) return 'weibo';
  if (lower.includes('xiaohongshu.com') || lower.includes('xhslink.com')) return 'xiaohongshu';
  if (lower.includes('weixin.qq.com') || lower.includes('mp.weixin')) return 'wechat';
  if (lower.includes('zhihu.com')) return 'zhihu';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  return 'other';
}

/**
 * Extract clean BV id or av number from Bilibili URL string
 */
export function extractBilibiliId(input: string): { bvid?: string; aid?: string } | null {
  const bvMatch = input.match(/(BV[a-zA-Z0-9]{10})/i);
  if (bvMatch) {
    return { bvid: bvMatch[1] };
  }
  const avMatch = input.match(/av(\d+)/i);
  if (avMatch) {
    return { aid: avMatch[1] };
  }
  return null;
}

/**
 * Fetch and parse metadata from Bilibili open API
 */
async function parseBilibiliVideo(urlStr: string, bvid?: string, aid?: string): Promise<ParsedUrlMetadata | null> {
  try {
    const queryParam = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${encodeURIComponent(aid || '')}`;
    const apiUrl = `https://api.bilibili.com/x/web-interface/view?${queryParam}`;

    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      code: number;
      message: string;
      data?: {
        bvid: string;
        aid: number;
        title: string;
        desc: string;
        pubdate: number;
        pic: string;
        owner?: {
          name: string;
          mid: number;
        };
      };
    };

    if (json.code === 0 && json.data) {
      const d = json.data;
      const publishedAt = d.pubdate ? new Date(d.pubdate * 1000).toISOString().slice(0, 10) : '';
      return {
        title: decodeHtmlEntities(d.title || ''),
        author: d.owner?.name || '',
        content: decodeHtmlEntities(d.desc || ''),
        published_at: publishedAt,
        platform: 'bilibili',
        url: `https://www.bilibili.com/video/${d.bvid || bvid || urlStr}`,
        cover_url: d.pic || undefined,
      };
    }
  } catch {
    // network or parse error, fallback
  }
  return null;
}

/**
 * Fetch and parse HTML OpenGraph / Meta tags from general web URL
 */
async function parseGeneralWebUrl(urlStr: string): Promise<ParsedUrlMetadata> {
  const platform = detectPlatformFromUrl(urlStr);
  let title = '';
  let author = '';
  let content = '';
  let published_at = '';
  let cover_url = '';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();

      // Extract OpenGraph / Meta tags
      const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
      const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

      if (ogTitleMatch) {
        title = decodeHtmlEntities(ogTitleMatch[1]);
      } else if (titleTagMatch) {
        title = decodeHtmlEntities(titleTagMatch[1]);
      }

      const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
      if (ogDescMatch) {
        content = decodeHtmlEntities(ogDescMatch[1]);
      }

      const authorMatch = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i);
      if (authorMatch) {
        author = decodeHtmlEntities(authorMatch[1]);
      }

      const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (ogImageMatch) {
        cover_url = ogImageMatch[1];
      }
    }
  } catch {
    // Ignore fetch timeout/abort errors
  }

  return {
    title: title || urlStr,
    author,
    content,
    published_at,
    platform,
    url: urlStr,
    cover_url: cover_url || undefined,
  };
}

/**
 * Main URL Parser dispatcher
 */
export async function parseUrlMetadata(rawInput: string): Promise<ParsedUrlMetadata> {
  const trimmed = rawInput.trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
  const targetUrl = urlMatch ? urlMatch[0] : trimmed;

  // 1. Check if Bilibili (direct BV or short link)
  if (targetUrl.includes('bilibili.com') || targetUrl.includes('b23.tv')) {
    let resolvedUrl = targetUrl;
    // Follow short link if b23.tv
    if (targetUrl.includes('b23.tv') && !targetUrl.includes('BV')) {
      try {
        const res = await fetch(targetUrl, {
          method: 'HEAD',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
        });
        resolvedUrl = res.url || targetUrl;
      } catch {
        // ignore
      }
    }

    const bilibiliId = extractBilibiliId(resolvedUrl);
    if (bilibiliId) {
      const parsedBili = await parseBilibiliVideo(resolvedUrl, bilibiliId.bvid, bilibiliId.aid);
      if (parsedBili) {
        return parsedBili;
      }
    }
  }

  // 2. Generic Web URL parser
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    return parseGeneralWebUrl(targetUrl);
  }

  return {
    title: targetUrl,
    author: '',
    content: '',
    published_at: '',
    platform: detectPlatformFromUrl(targetUrl),
    url: targetUrl,
  };
}
