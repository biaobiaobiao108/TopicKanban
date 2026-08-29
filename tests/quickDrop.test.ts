import { describe, expect, it } from 'bun:test';
import { normalizeQuickDropPayload } from '../src/lib/quickDrop';

describe('Quick drop payload normalization', () => {
  it('keeps the first safe URL when the URL field contains repeated URLs', () => {
    expect(normalizeQuickDropPayload(
      '超級测试就是这样',
      'https://x.com/home https://x.com/home',
    )).toEqual({
      content: '超級测试就是这样',
      url: 'https://x.com/home',
    });
  });

  it('removes repeated URL copies and Markdown wrappers from content', () => {
    expect(normalizeQuickDropPayload(
      '[https://www.youtube.com/](https://www.youtube.com/) https://www.youtube.com/',
      'https://www.youtube.com/',
    )).toEqual({
      content: '',
      url: 'https://www.youtube.com/',
    });
  });

  it('preserves notes while removing only the duplicated URL', () => {
    expect(normalizeQuickDropPayload(
      '值得回看 https://www.youtube.com/ https://www.youtube.com/',
      'https://www.youtube.com/',
    )).toEqual({
      content: '值得回看',
      url: 'https://www.youtube.com/',
    });
  });

  it('moves a URL-only content payload into the dedicated URL field', () => {
    expect(normalizeQuickDropPayload('https://www.youtube.com/')).toEqual({
      content: '',
      url: 'https://www.youtube.com/',
    });
  });

  it('does not promote a private URL from content into a clickable field', () => {
    expect(normalizeQuickDropPayload('http://127.0.0.1:8787/')).toEqual({
      content: 'http://127.0.0.1:8787/',
    });
  });
});
