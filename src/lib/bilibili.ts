export const formatBilibiliDate = (timestamp: number = Date.now()): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const datePart = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value || '';
  return `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
};

export interface BilibiliVideoMeta {
  bvid: string;
  title: string;
  author?: string;
  desc?: string;
  cover_url?: string;
  published_at: string;
  views: number;
  likes: number;
  coins: number;
  favorites: number;
  comments: number;
  url: string;
}

type BilibiliRawVideoData = {
  bvid?: string;
  title?: string;
  desc?: string;
  owner?: {
    name?: string;
    mid?: number;
  };
  pic?: string;
  pubdate?: number;
  stat?: {
    view?: number;
    like?: number;
    coin?: number;
    favorite?: number;
    reply?: number;
  };
};

type BilibiliApiResponse = {
  data?: BilibiliRawVideoData;
  message?: string;
  code?: number;
};

const pendingBilibiliRequests = new Map<string, Promise<BilibiliVideoMeta>>();

export const normalizeCoverUrl = (url?: string): string => {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://')) return trimmed.replace(/^http:\/\//, 'https://');
  return trimmed;
};

const COVER_CACHE_PREFIX = 'bili_cover_';
const coverMemoryCache = new Map<string, string>();
const COVER_CACHE_MAX_ENTRIES = 128;
const COVER_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const COVER_CACHE_PRUNE_INTERVAL_MS = 5 * 60 * 1000;
let lastPersistentCoverPruneAt = 0;

interface StoredCoverCacheEntry {
  url: string;
  cachedAt: number;
}

function rememberCoverInMemory(bvid: string, coverUrl: string): void {
  coverMemoryCache.delete(bvid);
  coverMemoryCache.set(bvid, coverUrl);
  while (coverMemoryCache.size > COVER_CACHE_MAX_ENTRIES) {
    const oldest = coverMemoryCache.keys().next().value as string | undefined;
    if (!oldest) break;
    coverMemoryCache.delete(oldest);
  }
}

function parseStoredCover(value: string): StoredCoverCacheEntry {
  try {
    const parsed = JSON.parse(value) as Partial<StoredCoverCacheEntry>;
    if (typeof parsed.url === 'string' && typeof parsed.cachedAt === 'number') {
      return { url: parsed.url, cachedAt: parsed.cachedAt };
    }
  } catch {
    // Read legacy raw URL entries below.
  }
  return { url: value, cachedAt: 0 };
}

function prunePersistentCoverCache(now = Date.now()): void {
  if (now - lastPersistentCoverPruneAt < COVER_CACHE_PRUNE_INTERVAL_MS) return;
  lastPersistentCoverPruneAt = now;
  try {
    if (typeof localStorage === 'undefined') return;
    const entries: Array<{ key: string; cachedAt: number }> = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(COVER_CACHE_PREFIX)) continue;
      const value = localStorage.getItem(key);
      if (!value) continue;
      const entry = parseStoredCover(value);
      if (entry.cachedAt > 0 && now - entry.cachedAt > COVER_CACHE_TTL_MS) {
        localStorage.removeItem(key);
        continue;
      }
      entries.push({ key, cachedAt: entry.cachedAt });
    }
    entries.sort((a, b) => a.cachedAt - b.cachedAt || a.key.localeCompare(b.key));
    entries.slice(0, Math.max(0, entries.length - COVER_CACHE_MAX_ENTRIES)).forEach(({ key }) => localStorage.removeItem(key));
  } catch {
    // Ignore quota or private mode errors.
  }
}

export const getBilibiliCoverFromCache = (bvid: string): string | null => {
  if (!bvid) return null;
  const inMemory = coverMemoryCache.get(bvid);
  if (inMemory) {
    rememberCoverInMemory(bvid, inMemory);
    return inMemory;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const key = `${COVER_CACHE_PREFIX}${bvid}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const entry = parseStoredCover(stored);
        const now = Date.now();
        if (entry.cachedAt > 0 && now - entry.cachedAt > COVER_CACHE_TTL_MS) {
          localStorage.removeItem(key);
          return null;
        }
        rememberCoverInMemory(bvid, entry.url);
        if (entry.cachedAt === 0) {
          localStorage.setItem(key, JSON.stringify({ url: entry.url, cachedAt: now } satisfies StoredCoverCacheEntry));
        }
        prunePersistentCoverCache(now);
        return entry.url;
      }
    }
  } catch {
    // Ignore quota or private mode errors
  }
  return null;
};

export const setBilibiliCoverToCache = (bvid: string, coverUrl: string): void => {
  if (!bvid || !coverUrl) return;
  rememberCoverInMemory(bvid, coverUrl);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${COVER_CACHE_PREFIX}${bvid}`, JSON.stringify({ url: coverUrl, cachedAt: Date.now() } satisfies StoredCoverCacheEntry));
      prunePersistentCoverCache();
    }
  } catch {
    // Ignore quota or private mode errors
  }
};

const normalizeBilibiliVideo = (raw: BilibiliRawVideoData, bvid: string): BilibiliVideoMeta => {
  const stat = raw.stat || {};
  const normalizedCover = normalizeCoverUrl(raw.pic);
  const cleanBvid = raw.bvid || bvid;
  if (cleanBvid && normalizedCover) {
    setBilibiliCoverToCache(cleanBvid, normalizedCover);
  }
  return {
    bvid: cleanBvid,
    title: raw.title || '',
    author: raw.owner?.name || '',
    desc: raw.desc || '',
    cover_url: normalizedCover,
    published_at: raw.pubdate
      ? formatBilibiliDate(raw.pubdate * 1000)
      : formatBilibiliDate(),
    views: Number(stat.view || 0),
    likes: Number(stat.like || 0),
    coins: Number(stat.coin || 0),
    favorites: Number(stat.favorite || 0),
    comments: Number(stat.reply || 0),
    url: `https://www.bilibili.com/video/${cleanBvid}`,
  };
};

const fetchBilibiliWithJsonp = (bvid: string): Promise<BilibiliVideoMeta> => new Promise((resolve, reject) => {
  const callbackName = `__bilibili_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const jsonpWindow = window as typeof window & Record<string, (payload: BilibiliApiResponse) => void>;
  const script = document.createElement('script');
  const timeout = window.setTimeout(() => {
    cleanup();
    reject(new Error('B站直连请求超时'));
  }, 8000);

  const cleanup = () => {
    window.clearTimeout(timeout);
    script.remove();
    delete jsonpWindow[callbackName];
  };

  jsonpWindow[callbackName] = (payload) => {
    cleanup();
    if (payload.code !== 0 || !payload.data || !payload.data.title) {
      reject(new Error(payload.message || 'B站直连数据异常'));
      return;
    }
    resolve(normalizeBilibiliVideo(payload.data, bvid));
  };

  script.async = true;
  script.src = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}&jsonp=jsonp&callback=${encodeURIComponent(callbackName)}`;
  script.onerror = () => {
    cleanup();
    reject(new Error('B站直连请求失败'));
  };
  document.head.appendChild(script);
});

/**
 * Extract clean BV ID from arbitrary input (BV number, Bilibili URL, mobile share link, etc.)
 * Examples:
 * - BV1xx411c7mD
 * - https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.999
 * - https://b23.tv/BV1xx411c7mD
 */
export function extractBvid(input: string): string | null {
  if (!input) return null;
  const match = input.match(/(BV[a-zA-Z0-9]{10})/i);
  return match ? match[1] : null;
}

/**
 * Fetch video metadata and interactive statistics from Bilibili via proxy / backend API.
 */
export async function fetchBilibiliVideoData(bvidOrUrl: string): Promise<BilibiliVideoMeta> {
  const bvid = extractBvid(bvidOrUrl);
  if (!bvid) {
    throw new Error('未识别到有效的 BV 号（如 BV1xx411c7mD）');
  }

  const existing = pendingBilibiliRequests.get(bvid);
  if (existing) return existing;
  const request = fetchBilibiliWithJsonp(bvid).finally(() => {
    if (pendingBilibiliRequests.get(bvid) === request) pendingBilibiliRequests.delete(bvid);
  });
  pendingBilibiliRequests.set(bvid, request);
  return request;
}
