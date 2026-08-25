import { useQuery } from '@tanstack/react-query';
import { extractBvid, fetchBilibiliVideoData, getBilibiliCoverFromCache } from '../lib/bilibili';

export function useBilibiliCover(bvidOrUrl?: string | null) {
  const raw = (bvidOrUrl || '').trim();
  const cleanBvid = extractBvid(raw) || (raw.startsWith('BV') && raw.length === 12 ? raw : null);

  return useQuery({
    queryKey: ['bilibili-cover', cleanBvid],
    queryFn: async (): Promise<string> => {
      if (!cleanBvid) return '';
      const cached = getBilibiliCoverFromCache(cleanBvid);
      if (cached) return cached;
      const meta = await fetchBilibiliVideoData(cleanBvid);
      return meta.cover_url || '';
    },
    enabled: !!cleanBvid,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    initialData: cleanBvid ? (getBilibiliCoverFromCache(cleanBvid) ?? undefined) : undefined,
  });
}
