import { isSafeExternalHttpUrl } from './urlSafety';

const URL_TOKEN_PATTERN = /https?:\/\/[^\s<>"'()[\]{}\u4e00-\u9fa5]+/giu;
const TRAILING_URL_PUNCTUATION_PATTERN = /[.,!?;:\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A\u3001\uFF09)\]}]+$/u;

function stripTrailingUrlPunctuation(value: string): string {
  return value.replace(TRAILING_URL_PUNCTUATION_PATTERN, '');
}

/**
 * Normalize only the quick-drop URL field. Content is intentionally not
 * inspected or modified because it is user-authored note text.
 */
export function normalizeQuickDropUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;

  for (const match of value.matchAll(URL_TOKEN_PATTERN)) {
    const candidate = stripTrailingUrlPunctuation(match[0]);
    if (candidate && isSafeExternalHttpUrl(candidate)) return candidate;
  }

  return undefined;
}
