import { isSafeExternalHttpUrl } from './urlSafety';

const URL_TOKEN_PATTERN = /https?:\/\/[^\s<>"'()[\]{}\u4e00-\u9fa5]+/giu;
const TRAILING_URL_PUNCTUATION_PATTERN = /[.,!?;:\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A\u3001\uFF09)\]}]+$/u;

export interface NormalizedQuickDropPayload {
  content: string;
  url?: string;
}

function stripTrailingUrlPunctuation(value: string): { url: string; suffix: string } {
  const match = value.match(TRAILING_URL_PUNCTUATION_PATTERN);
  if (!match) return { url: value, suffix: '' };
  return { url: value.slice(0, -match[0].length), suffix: match[0] };
}

function extractUrlCandidates(value: string): string[] {
  return Array.from(value.matchAll(URL_TOKEN_PATTERN), ([token]) => stripTrailingUrlPunctuation(token).url)
    .filter(Boolean);
}

function comparableUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/u, '') || '/';
    return JSON.stringify([
      parsed.protocol.toLowerCase(),
      parsed.hostname.toLowerCase(),
      parsed.port,
      pathname,
      parsed.search,
      parsed.hash,
    ]);
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/u, '');
  }
}

function removeEmptyLinkMarkup(value: string): string {
  return value
    .replace(/\[\s*\]\(\s*\)/gu, '')
    .replace(/<\s*>/gu, '')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n[ \t]+/gu, '\n')
    .trim();
}

function removeMatchingUrls(content: string, url: string): string {
  const target = comparableUrl(url);
  return removeEmptyLinkMarkup(content.replace(URL_TOKEN_PATTERN, (token) => {
    const { url: cleanToken, suffix } = stripTrailingUrlPunctuation(token);
    return comparableUrl(cleanToken) === target ? suffix : token;
  }));
}

/**
 * Normalize URL values coming from share-sheet clients, which may serialize
 * one URL object as repeated URL text or Markdown-like rich text.
 */
export function normalizeQuickDropPayload(contentValue: unknown, urlValue?: unknown): NormalizedQuickDropPayload {
  let content = typeof contentValue === 'string' ? contentValue.trim() : '';
  const rawUrl = typeof urlValue === 'string' ? urlValue.trim() : '';
  let url = rawUrl;

  if (rawUrl) {
    const candidates = extractUrlCandidates(rawUrl);
    const safeCandidate = candidates.find((candidate) => isSafeExternalHttpUrl(candidate));
    if (safeCandidate) url = safeCandidate;
  } else {
    const safeCandidate = extractUrlCandidates(content)
      .find((candidate) => isSafeExternalHttpUrl(candidate));
    if (safeCandidate) url = safeCandidate;
  }

  if (url && isSafeExternalHttpUrl(url)) content = removeMatchingUrls(content, url);

  return {
    content,
    ...(url ? { url } : {}),
  };
}
