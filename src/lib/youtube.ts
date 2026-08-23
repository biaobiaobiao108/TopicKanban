export interface YoutubeVideoMeta {
  title: string;
  author: string;
  cover_url?: string;
  url: string;
}

/**
 * Extract YouTube URL from arbitrary input
 */
export function isYoutubeUrl(input: string): boolean {
  return /youtube\.com|youtu\.be/i.test(input);
}

/**
 * Fetch metadata directly from YouTube official oEmbed API via client-side CORS
 */
export async function fetchYoutubeVideoData(urlStr: string): Promise<YoutubeVideoMeta | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlStr)}&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(oembedUrl, {
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const json = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    if (json.title) {
      return {
        title: json.title,
        author: json.author_name || '',
        cover_url: json.thumbnail_url,
        url: urlStr,
      };
    }
  } catch {
    // ignore
  }
  return null;
}
