import { PlatformType } from '../types';
import { extractBvid, fetchBilibiliVideoData } from './bilibili';
import { fetchYoutubeVideoData, isYoutubeUrl } from './youtube';

export interface ParsedClientMetadata {
  title: string;
  author: string;
  content: string;
  published_at: string;
  platform: PlatformType;
  url: string;
  cover_url?: string;
}

/**
 * Detect platform from arbitrary URL string or text
 */
export function detectPlatformFromText(input: string): PlatformType {
  const lower = input.toLowerCase();
  if (lower.includes('bilibili.com') || lower.includes('b23.tv') || /BV[a-zA-Z0-9]{10}/i.test(input)) return 'bilibili';
  if (lower.includes('douyin.com') || lower.includes('iesdouyin.com')) return 'douyin';
  if (lower.includes('kuaishou.com') || lower.includes('kwai.com')) return 'kuaishou';
  if (lower.includes('weibo.com') || lower.includes('weibo.cn')) return 'weibo';
  if (lower.includes('xiaohongshu.com') || lower.includes('xhslink.com')) return 'xiaohongshu';
  if (lower.includes('weixin.qq.com') || lower.includes('mp.weixin')) return 'wechat';
  if (lower.includes('zhihu.com')) return 'zhihu';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  return 'other';
}

/**
 * Extract clean URL from text
 */
export function extractUrlFromText(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s\u4e00-\u9fa5]+/i);
  if (urlMatch) return urlMatch[0];

  const bvMatch = trimmed.match(/BV[a-zA-Z0-9]{10}/i);
  if (bvMatch) return `https://www.bilibili.com/video/${bvMatch[0]}`;

  if (
    trimmed.includes('b23.tv') ||
    trimmed.includes('bilibili.com') ||
    trimmed.includes('douyin.com') ||
    trimmed.includes('xhslink.com') ||
    trimmed.includes('xiaohongshu.com') ||
    trimmed.includes('weibo.com') ||
    trimmed.includes('zhihu.com') ||
    trimmed.includes('youtube.com')
  ) {
    const rawClean = trimmed.replace(/^https?:\/\//i, '').replace(/^\/+/, '');
    const firstPart = rawClean.split(/[\s\u4e00-\u9fa5]/)[0];
    return `https://${firstPart}`;
  }

  return trimmed;
}

/**
 * Clean up mobile share texts and strip app-specific copy-paste tokens
 */
export function cleanMobileShareText(rawText: string, extractedUrl: string): { title: string; author: string; content: string } {
  let textWithoutUrl = rawText.replace(extractedUrl, '').trim();

  // Strip common app share wrappers
  // 1. Douyin: e.g. "7.12 复制打开抖音，看看【xxx的作品】打工人的一天..."
  const douyinAuthorMatch = textWithoutUrl.match(/【([^】]+)的作品】/);
  let author = '';
  if (douyinAuthorMatch) {
    author = douyinAuthorMatch[1].trim();
    textWithoutUrl = textWithoutUrl.replace(/^[0-9.]+\s*复制打开抖音[，,]看看【[^】]+的作品】\s*/, '');
  }

  // 2. Xiaohongshu: e.g. "良子发布了一篇小红书笔记，快来看吧！... 复制本条信息，打开【小红书】App查看精彩内容！"
  const xhsAuthorMatch = textWithoutUrl.match(/^(.+?)\s*发布了一篇小红书笔记/);
  if (xhsAuthorMatch) {
    author = xhsAuthorMatch[1].trim();
    textWithoutUrl = textWithoutUrl.replace(/^.+?发布了一篇小红书笔记[，,!]*(快来看吧[！!]*)*\s*/, '');
  }
  textWithoutUrl = textWithoutUrl.replace(/[，,\s]*复制本条信息.*$/i, '');
  textWithoutUrl = textWithoutUrl.replace(/[\s\S]*打开【小红书】App查看精彩内容.*$/i, '');

  // 3. Weibo / General: Strip leading hashtags e.g. "#今日热点#"
  const hashtagMatch = textWithoutUrl.match(/^#([^#]+)#/);
  const topicTag = hashtagMatch ? hashtagMatch[1].trim() : '';

  // 4. Remove emojis or redundant prefix symbols
  const cleanedTitle = textWithoutUrl
    .replace(/^[\s\d.、·【\[(（]+/, '')
    .replace(/[】\])）\s]+$/, '')
    .trim();

  const titleCandidate = cleanedTitle.split(/[\n\r。！!？?]/)[0].trim() || topicTag || cleanedTitle;
  const finalTitle = titleCandidate.slice(0, 80);
  const finalContent = textWithoutUrl.length > 20 ? textWithoutUrl : '';

  return {
    title: finalTitle,
    author,
    content: finalContent,
  };
}

/**
 * All-in-one Client-Side Direct Metadata Parser
 * 100% runs in the user's browser, keeping platform requests on the user's own network.
 */
export async function parseClientMetadata(rawInput: string): Promise<ParsedClientMetadata> {
  const trimmed = rawInput.trim();
  const extractedUrl = extractUrlFromText(trimmed);
  const platform = detectPlatformFromText(trimmed);
  const { title: fallbackTitle, author: fallbackAuthor, content: fallbackContent } = cleanMobileShareText(trimmed, extractedUrl);

  // 1. Bilibili: Direct client-side JSONP (Clean residential IP, zero blocking)
  const bvMatch = trimmed.match(/BV[a-zA-Z0-9]{10}/i);
  const bvid = bvMatch ? bvMatch[0] : extractBvid(extractedUrl);
  if (bvid) {
    try {
      const biliMeta = await fetchBilibiliVideoData(bvid);
      if (biliMeta && biliMeta.title) {
        const cleanDesc = (biliMeta.desc || '').trim();
        const structuredContent = cleanDesc && cleanDesc !== '-' && cleanDesc.length > 3
          ? cleanDesc
          : `【Bilibili 视频】${biliMeta.title}${biliMeta.author ? ` · UP主：${biliMeta.author}` : ''}${biliMeta.published_at ? ` · 发布于 ${biliMeta.published_at}` : ''}`;

        return {
          title: biliMeta.title,
          author: biliMeta.author || fallbackAuthor,
          content: structuredContent,
          published_at: biliMeta.published_at,
          platform: 'bilibili',
          url: biliMeta.url,
          cover_url: biliMeta.cover_url,
        };
      }
    } catch {
      // ignore
    }
  }

  // 2. YouTube: Direct client-side official oEmbed CORS
  if (platform === 'youtube' || isYoutubeUrl(extractedUrl)) {
    try {
      const ytMeta = await fetchYoutubeVideoData(extractedUrl);
      if (ytMeta && ytMeta.title) {
        return {
          title: ytMeta.title,
          author: ytMeta.author || fallbackAuthor,
          content: `【YouTube 视频】${ytMeta.title}${ytMeta.author ? ` · 频道：${ytMeta.author}` : ''}`,
          published_at: '',
          platform: 'youtube',
          url: ytMeta.url,
          cover_url: ytMeta.cover_url,
        };
      }
    } catch {
      // ignore
    }
  }

  // 3. Other Domestic Platforms (Douyin / Xiaohongshu / Weibo / WeChat / Zhihu / Kuaishou / General)
  // Smart local regex & semantic text extraction
  return {
    title: fallbackTitle || extractedUrl,
    author: fallbackAuthor,
    content: fallbackContent,
    published_at: '',
    platform,
    url: extractedUrl,
  };
}
