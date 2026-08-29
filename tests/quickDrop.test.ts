import { describe, expect, it } from 'bun:test';
import { normalizeQuickDropUrl } from '../src/lib/quickDrop';

describe('Quick drop URL normalization', () => {
  it('keeps only the first safe URL from the URL field', () => {
    expect(normalizeQuickDropUrl('https://x.com/home https://x.com/home')).toBe('https://x.com/home');
    expect(normalizeQuickDropUrl('https://x.com/one https://x.com/two')).toBe('https://x.com/one');
  });

  it('does not accept unsafe or non-URL values', () => {
    expect(normalizeQuickDropUrl('file:///etc/passwd')).toBeUndefined();
    expect(normalizeQuickDropUrl('http://127.0.0.1:8787/')).toBeUndefined();
    expect(normalizeQuickDropUrl('this is not a URL')).toBeUndefined();
  });
});
