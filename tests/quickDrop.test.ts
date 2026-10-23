import { describe, expect, it } from 'bun:test';
import { normalizeQuickDropUrl, quickDropToTopicDraft } from '../src/lib/quickDrop';

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

  it('converts the complete note into a topic summary and keeps a safe separate URL', () => {
    const content = `一段足够长的线索，不能只保留标题。\n第二行也要保留。`;
    expect(quickDropToTopicDraft({ content, url: 'https://example.com/story' })).toEqual({
      title: '一段足够长的线索，不能只保留标题。',
      summary: `${content}\n\nhttps://example.com/story`,
    });
  });

  it('does not add an unsafe URL to the topic summary', () => {
    expect(quickDropToTopicDraft({ content: '线索正文', url: 'http://127.0.0.1/private' })).toEqual({
      title: '线索正文',
      summary: '线索正文',
    });
  });

  it('keeps the full summary even when it exceeds the topic summary limit', () => {
    const content = '线索'.repeat(1200);
    const converted = quickDropToTopicDraft({ content });
    expect(converted.title.length).toBeLessThan(content.length);
    expect(converted.summary).toBe(content);
  });
});
