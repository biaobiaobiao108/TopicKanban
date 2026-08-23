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

export const MAX_METADATA_HTML_BYTES = 1 * 1024 * 1024;
export const DNS_LOOKUP_TIMEOUT_MS = 1500;
const MAX_SAFE_REDIRECTS = 3;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return _;
      }
    })
    .trim();
}

export function isLocalPrivateOrLoopbackIp(ip: string): boolean {
  const cleanIp = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();

  // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1
  if (cleanIp.startsWith('::ffff:')) {
    const v4Part = cleanIp.slice(7);
    return isLocalPrivateOrLoopbackIp(v4Part);
  }

  // IPv4 Check
  const v4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4Match) {
    const octets = v4Match.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255 || Number.isNaN(o))) return true;

    // 0.0.0.0/8 (Current network)
    if (octets[0] === 0) return true;
    // 10.0.0.0/8 (Private LAN)
    if (octets[0] === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (octets[0] === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata e.g. 169.254.169.254)
    if (octets[0] === 169 && octets[1] === 254) return true;
    // 172.16.0.0/12 (Private LAN, 172.16.0.0 - 172.31.255.255)
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    // 192.168.0.0/16 (Private LAN)
    if (octets[0] === 192 && octets[1] === 168) return true;

    return false;
  }

  // IPv6 Check
  if (cleanIp === '::1' || cleanIp === '::') return true;
  // Link-Local fe80::/10 (fe80:: - febf::)
  if (/^fe[89ab]/i.test(cleanIp)) return true;

  return false;
}

/**
 * Check whether an IP string is private, loopback, link-local, or reserved
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const cleanIp = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();

  // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1
  if (cleanIp.startsWith('::ffff:')) {
    const v4Part = cleanIp.slice(7);
    return isPrivateOrReservedIp(v4Part);
  }

  // IPv4 Check
  const v4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4Match) {
    const octets = v4Match.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255 || Number.isNaN(o))) return true;

    // 0.0.0.0/8 (Current network)
    if (octets[0] === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (octets[0] === 10) return true;
    // 100.64.0.0/10 (Carrier-grade NAT, 100.64.0.0 - 100.127.255.255)
    if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (octets[0] === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata e.g. 169.254.169.254)
    if (octets[0] === 169 && octets[1] === 254) return true;
    // 172.16.0.0/12 (Private network, 172.16.0.0 - 172.31.255.255)
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    // 192.0.0.0/24, 192.0.2.0/24 (Documentation / Test)
    if (octets[0] === 192 && octets[1] === 0 && (octets[2] === 0 || octets[2] === 2)) return true;
    // 192.168.0.0/16 (Private LAN)
    if (octets[0] === 192 && octets[1] === 168) return true;
    // 198.51.100.0/24 (Documentation)
    if (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) return true;
    // 203.0.113.0/24 (Documentation)
    if (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) return true;
    // 224.0.0.0/4 (Multicast 224-239) and 240.0.0.0/4 (Reserved 240-255)
    if (octets[0] >= 224) return true;

    return false;
  }

  // IPv6 Check
  if (cleanIp === '::1' || cleanIp === '::') return true;
  // Unique Local Address fc00::/7 (fc00:: - fdff::)
  if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;
  // Link-Local fe80::/10 (fe80:: - febf::)
  if (/^fe[89ab]/i.test(cleanIp)) return true;

  return false;
}

/**
 * SSRF Guard: Validate whether target URL is safe for public outgoing request
 */
export function isSafePublicUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    // 1. Protocol whitelist: only http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().trim();
    if (!hostname) return false;

    // 2. Reject internal/local domains
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan') ||
      hostname.endsWith('.corp') ||
      hostname.endsWith('.home') ||
      hostname.endsWith('.intranet') ||
      hostname.endsWith('.arpa')
    ) {
      return false;
    }

    // 3. Reject hex / octal / decimal IP trick attempts e.g. 0177.0.0.1, 2130706433
    if (/^0x[0-9a-f]+$/i.test(hostname) || /^\d+$/.test(hostname)) {
      return false;
    }

    // 4. If hostname is IP address, verify private/reserved IP
    if (isPrivateOrReservedIp(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function isSafePublicRequestUrl(urlStr: string): Promise<boolean> {
  if (!isSafePublicUrl(urlStr)) return false;

  // Cloudflare Workers cannot perform arbitrary DNS lookups. Its fetch runtime
  // still enforces outbound network policy, while Node performs an explicit
  // post-resolution check to prevent DNS rebinding to private addresses.
  if (typeof process === 'undefined' || !process.versions?.node) return true;

  try {
    type DnsModule = { lookup: (hostname: string, options: { all: true }) => Promise<Array<{ address: string }>> };
    const processWithBuiltin = process as typeof process & {
      getBuiltinModule?: (id: string) => DnsModule | undefined;
    };
    const dns = processWithBuiltin.getBuiltinModule?.('node:dns/promises') || await (async () => {
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string
      ) => Promise<DnsModule>;
      return dynamicImport('node:dns/promises');
    })();
    const hostname = new URL(urlStr).hostname;
    const lookupPromise = dns.lookup(hostname, { all: true }).catch(() => []);
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(null), DNS_LOOKUP_TIMEOUT_MS);
    });
    const addresses: Array<{ address: string }> | null = await Promise.race([lookupPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (!addresses) return false;
    // Guard against DNS rebinding to real LAN private / loopback addresses
    return addresses.length > 0 && addresses.every(({ address }) => !isLocalPrivateOrLoopbackIp(address));
  } catch {
    return false;
  }
}

async function fetchWithSafeRedirects(
  urlStr: string,
  init: RequestInit,
  maxRedirects = MAX_SAFE_REDIRECTS,
  initialUrlAlreadyValidated = false
): Promise<Response | null> {
  let target = urlStr;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (!(initialUrlAlreadyValidated && redirectCount === 0) && !(await isSafePublicRequestUrl(target))) return null;
    const response = await fetch(target, { ...init, redirect: 'manual' });
    if (!REDIRECT_STATUS_CODES.has(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || redirectCount === maxRedirects) return null;
    try {
      target = new URL(location, target).toString();
    } catch {
      return null;
    }
  }
  return null;
}

async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string | null> {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) return null;
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new TextDecoder().decode(bytes);
}

export function detectPlatformFromUrl(urlStr: string): PlatformType {
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
      const cleanDesc = decodeHtmlEntities(d.desc || '').trim();
      const cleanTitle = decodeHtmlEntities(d.title || '').trim();
      const authorName = d.owner?.name || '';
      const content = cleanDesc && cleanDesc !== '-' && cleanDesc.length > 3
        ? cleanDesc
        : `【Bilibili 视频】${cleanTitle}${authorName ? ` · UP主：${authorName}` : ''}${publishedAt ? ` · 发布于 ${publishedAt}` : ''}`;

      return {
        title: cleanTitle,
        author: authorName,
        content,
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
 * Fetch and parse metadata from YouTube official oEmbed API
 */
async function parseYoutubeOembed(urlStr: string): Promise<ParsedUrlMetadata | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlStr)}&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const json = (await res.json()) as {
      title?: string;
      author_name?: string;
      author_url?: string;
      thumbnail_url?: string;
      provider_name?: string;
    };

    if (json.title) {
      const title = decodeHtmlEntities(json.title || '');
      const author = decodeHtmlEntities(json.author_name || '');
      return {
        title,
        author,
        content: title ? `【YouTube 视频】${title}${author ? ` · 频道：${author}` : ''}` : '',
        published_at: '',
        platform: 'youtube',
        url: urlStr,
        cover_url: json.thumbnail_url || undefined,
      };
    }
  } catch {
    // fallback to general parser
  }
  return null;
}

/**
 * Fetch and parse HTML OpenGraph / Twitter Cards / Meta tags from general web URL
 */
async function parseGeneralWebUrl(urlStr: string, alreadyValidated = false): Promise<ParsedUrlMetadata> {
  const platform = detectPlatformFromUrl(urlStr);
  let title = '';
  let author = '';
  let content = '';
  let published_at = '';
  let cover_url = '';

  if (!alreadyValidated && !(await isSafePublicRequestUrl(urlStr))) {
    return {
      title: urlStr,
      author: '',
      content: '',
      published_at: '',
      platform,
      url: urlStr,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetchWithSafeRedirects(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    }, MAX_SAFE_REDIRECTS, alreadyValidated);
    if (res?.ok) {
      const html = await readResponseTextLimited(res, MAX_METADATA_HTML_BYTES);
      clearTimeout(timeoutId);
      if (html === null) return {
        title: urlStr,
        author: '',
        content: '',
        published_at: '',
        platform,
        url: urlStr,
      };

      // Extract Title: og:title -> twitter:title -> <title>
      const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
      const twitterTitleMatch = html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']/i);
      const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

      if (ogTitleMatch) {
        title = decodeHtmlEntities(ogTitleMatch[1]);
      } else if (twitterTitleMatch) {
        title = decodeHtmlEntities(twitterTitleMatch[1]);
      } else if (titleTagMatch) {
        title = decodeHtmlEntities(titleTagMatch[1]);
      }

      // Extract Description: og:description -> twitter:description -> description
      const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
      const twitterDescMatch = html.match(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:description["']/i);
      const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

      if (ogDescMatch) {
        content = decodeHtmlEntities(ogDescMatch[1]);
      } else if (twitterDescMatch) {
        content = decodeHtmlEntities(twitterDescMatch[1]);
      } else if (metaDescMatch) {
        content = decodeHtmlEntities(metaDescMatch[1]);
      }

      // Extract Author: author -> article:author -> og:site_name -> twitter:creator
      const authorMatch = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+name=["']twitter:creator["'][^>]+content=["']([^"']+)["']/i);
      if (authorMatch) {
        author = decodeHtmlEntities(authorMatch[1]);
      }

      // Extract Image Cover: og:image -> twitter:image -> thumbnail
      const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+name=["']thumbnail["'][^>]+content=["']([^"']+)["']/i);
      if (ogImageMatch) {
        cover_url = ogImageMatch[1];
      }

      // Extract Published Date
      const dateMatch = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+property=["']og:pubdate["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
      if (dateMatch) {
        const rawDate = dateMatch[1].trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
          published_at = rawDate.slice(0, 10);
        }
      }
    }
    clearTimeout(timeoutId);
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
  let targetUrl = trimmed;

  // 1. Check if raw input is pure BV ID
  const bvMatch = trimmed.match(/^(BV[a-zA-Z0-9]{10})$/i);
  if (bvMatch) {
    targetUrl = `https://www.bilibili.com/video/${bvMatch[1]}`;
  } else {
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      targetUrl = urlMatch[0];
    } else if (
      trimmed.includes('bilibili.com') ||
      trimmed.includes('b23.tv') ||
      trimmed.includes('youtube.com') ||
      trimmed.includes('youtu.be') ||
      trimmed.includes('douyin.com') ||
      trimmed.includes('xiaohongshu.com') ||
      trimmed.includes('zhihu.com') ||
      trimmed.includes('weibo.com')
    ) {
      targetUrl = `https://${trimmed.replace(/^\/+/, '')}`;
    }
  }

  // SSRF Check: if not safe, return safe fallback directly without fetching
  if (!(await isSafePublicRequestUrl(targetUrl))) {
    return {
      title: targetUrl,
      author: '',
      content: '',
      published_at: '',
      platform: detectPlatformFromUrl(targetUrl),
      url: targetUrl,
    };
  }

  // 1. Check if Bilibili (direct BV or short link)
  if (targetUrl.includes('bilibili.com') || targetUrl.includes('b23.tv')) {
    let resolvedUrl = targetUrl;
    // Follow short link if b23.tv
    if (targetUrl.includes('b23.tv') && !targetUrl.includes('BV')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetchWithSafeRedirects(targetUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        // Verify resolved URL is safe before proceeding
        if (res?.url && await isSafePublicRequestUrl(res.url)) {
          resolvedUrl = res.url;
        }
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

  // 2. Check if YouTube (official oEmbed parser)
  if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
    const parsedYoutube = await parseYoutubeOembed(targetUrl);
    if (parsedYoutube) {
      return parsedYoutube;
    }
  }

  // 3. Generic Web URL parser
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    return parseGeneralWebUrl(targetUrl, true);
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
