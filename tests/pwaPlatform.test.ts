import { describe, expect, it } from 'bun:test';
import { detectMacSafari } from '../src/lib/pwa';

describe('Safari install platform detection', () => {
  it('recognizes Safari on macOS', () => {
    expect(detectMacSafari(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 27_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15',
      'MacIntel',
      0,
    )).toBe(true);
  });

  it('does not classify Chromium or iPad desktop mode as macOS Safari', () => {
    expect(detectMacSafari(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 27_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'MacIntel',
      0,
    )).toBe(false);
    expect(detectMacSafari(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 27_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15',
      'MacIntel',
      5,
    )).toBe(false);
  });
});
