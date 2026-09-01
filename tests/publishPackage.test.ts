import { beforeAll, describe, expect, it } from 'bun:test';
import type { Draft, PublishPackageRecord, Source, Topic } from '../src/types';
import {
  buildPublishPackage,
  formatPublishPackageMarkdown,
  formatPublishPackageText,
  mergeSavedPublishPackage,
  toPersistedPublishPackageContent,
} from '../src/lib/publishPackage';
import { getTraditionalConverter } from '../src/lib/traditionalChinese';

beforeAll(async () => {
  await getTraditionalConverter();
});

const topic: Topic = {
  id: 'topic-publish-package',
  title: '一个网红故事的完整复盘',
  summary: '从爆红到争议，这个故事留下了几个关键反转。',
  hook: '为什么所有人都看错了这件事？',
  storyline: '从成名到反转，再到后续影响。',
  why_now: '新的公开材料刚刚出现。',
  status: 'production',
  priority: 'high',
  score_character: 2,
  score_conflict: 2,
  score_contrast: 2,
  score_material: 2,
  score_story: 2,
  is_pinned: 0,
  sort_order: 0,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
  tags: [{ id: 'tag-1', name: '人物故事' }],
  people: [{
    id: 'person-1', name: '张三', aliases: '', avatar_url: '', description: '', identity: '',
    platform_accounts: '', quotes: '', notes: '', created_at: '', updated_at: '',
  }],
};

const source = (overrides: Partial<Source> = {}): Source => ({
  id: 'source-1',
  topic_id: topic.id,
  title: '公开资料',
  content: '资料摘录',
  url: 'https://example.com/source',
  platform: 'news',
  author: '公开账号',
  published_at: '2026-08-20',
  verification_status: 'confirmed',
  notes: '',
  created_at: '',
  updated_at: '',
  ...overrides,
});

const draft = (contentJson: string, contentHtml = '<h1>开场</h1><p>开场内容</p>'): Draft => ({
  id: 'draft-1',
  topic_id: topic.id,
  title: topic.title,
  content_json: contentJson,
  content_html: contentHtml,
  word_count: 560,
  version: 2,
  updated_at: '2026-08-21T12:00:00.000Z',
});

describe('publish package generator', () => {
  it('builds the editable publish fields from the current topic workspace', () => {
    const packageData = buildPublishPackage({
      topic,
      draft: draft(JSON.stringify({ type: 'doc', content: [] })),
      sources: [source()],
      timeline: [],
      citations: [],
      readingSpeed: 280,
    });

    expect(packageData.title_simplified).toBe(topic.title);
    expect(packageData.title_traditional).toBe('一個網紅故事的完整復盤');
    expect(packageData.cover_text).toBe(topic.hook);
    expect(packageData.description_simplified).toContain(topic.summary);
    expect(packageData.description_simplified).toContain(`本期人物：${topic.people?.[0].name}`);
    expect(packageData.description_traditional).toContain('從爆紅到爭議');
    expect(packageData.tags).toEqual(['人物故事']);
    expect(packageData.source_credits[0].url).toBe('https://example.com/source');
    expect(packageData.draft_updated_at).toBe('2026-08-21T12:00:00.000Z');
  });

  it('uses the independent draft title and falls back to the topic title when it is blank', () => {
    const titled = buildPublishPackage({
      topic,
      draft: { ...draft('{}'), title: '文案创作里的独立标题' },
      sources: [],
      timeline: [],
      citations: [],
    });
    expect(titled.title_simplified).toBe('文案创作里的独立标题');

    const blank = buildPublishPackage({
      topic,
      draft: { ...draft('{}'), title: '' },
      sources: [],
      timeline: [],
      citations: [],
    });
    expect(blank.title_simplified).toBe(topic.title);
  });

  it('preserves saved public edits and manual Traditional Chinese fields', () => {
    const generated = buildPublishPackage({
      topic,
      draft: draft('{}'),
      sources: [source()],
      timeline: [],
      citations: [],
    });
    const saved: PublishPackageRecord = {
      id: 'package-1',
      topic_id: topic.id,
      version: 3,
      title_simplified: '已保存简体标题',
      title_traditional: '手動繁體標題',
      description_simplified: '已保存简体简介',
      description_traditional: '手動繁體簡介',
      title_traditional_auto: false,
      description_traditional_auto: false,
      content_json: JSON.stringify({
        title_candidates: ['候选一'],
        cover_text: '手动封面',
        tags: ['手动标签'],
        chapters: [],
        pinned_comment: '手动评论',
        included_source_ids: [],
      }),
      updated_at: '2026-08-25T00:00:00.000Z',
    };
    const merged = mergeSavedPublishPackage(generated, saved);
    expect(merged.title_traditional).toBe('手動繁體標題');
    expect(merged.description_traditional_auto).toBe(false);
    expect(merged.cover_text).toBe('手动封面');
    expect(merged.source_credits[0].included).toBe(false);
    expect(toPersistedPublishPackageContent(merged)).toMatchObject({
      title_candidates: ['候选一'],
      included_source_ids: [],
    });
  });

  it('extracts H1/H2 chapters and estimates timestamps using the configured speed', () => {
    const contentJson = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '开场' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(280) }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '第一次反转' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b'.repeat(140) }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '不单独生成章节' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'c'.repeat(140) }] },
      ],
    });
    const packageData = buildPublishPackage({
      topic,
      draft: draft(contentJson),
      sources: [],
      timeline: [],
      citations: [],
      readingSpeed: 280,
    });

    expect(packageData.chapters.map((chapter) => chapter.title)).toEqual(['开场', '第一次反转']);
    expect(packageData.chapters.map((chapter) => chapter.time)).toEqual(['00:00', '01:00']);
  });

  it('falls back to HTML headings when the editor JSON is invalid', () => {
    const packageData = buildPublishPackage({
      topic,
      draft: draft('not-json', '<h1>开场</h1><p>内容</p><h2>结尾</h2><p>更多内容</p>'),
      sources: [],
      timeline: [],
      citations: [],
      readingSpeed: 280,
    });

    expect(packageData.chapters.map((chapter) => chapter.title)).toEqual(['开场', '结尾']);
  });

  it('omits unsafe source URLs and reports the issue without blocking export', () => {
    const packageData = buildPublishPackage({
      topic,
      draft: draft(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文' }] }] })),
      sources: [source({ url: 'javascript:alert(1)' })],
      timeline: [],
      citations: [],
      readingSpeed: 280,
    });

    expect(packageData.source_credits[0].url).toBe('');
    expect(packageData.checks.some((check) => check.id === 'source-url-invalid')).toBe(true);
    expect(packageData.checks.some((check) => check.level === 'blocker')).toBe(false);
  });

  it('reports active unresolved citations and draft conflicts as checks', () => {
    const contentJson = JSON.stringify({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: '带引用的正文',
          marks: [{ type: 'citation', attrs: { citationId: 'citation-1' } }],
        }],
      }],
    });
    const packageData = buildPublishPackage({
      topic,
      draft: draft(contentJson),
      sources: [source({ verification_status: 'unverified' })],
      timeline: [],
      citations: [{
        id: 'citation-1',
        topic_id: topic.id,
        reference_type: 'source',
        reference_id: 'source-1',
        reference_title: '公开资料',
        reference_snapshot: '旧资料内容',
        quoted_text: '带引用的正文',
        verification_status: 'unverified',
        created_at: '',
      }],
      readingSpeed: 280,
      draftConflict: true,
    });

    expect(packageData.checks.some((check) => check.id === 'draft-conflict' && check.level === 'blocker')).toBe(true);
    expect(packageData.checks.some((check) => check.id === 'citation-unverified')).toBe(true);
    expect(packageData.checks.some((check) => check.id === 'citation-stale')).toBe(true);
  });

  it('formats plain text and Markdown output with the agreed sections', () => {
    const packageData = buildPublishPackage({
      topic,
      draft: draft(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文' }] }] })),
      sources: [source()],
      timeline: [],
      citations: [],
      readingSpeed: 280,
    });
    const text = formatPublishPackageText(packageData);
    const markdown = formatPublishPackageMarkdown(packageData);

    expect(text).toContain('标题：');
    expect(text).toContain('视频简介：');
    expect(text).toContain('参考资料：');
    expect(markdown).toContain('# 双平台发布包');
    expect(markdown).toContain('## Bilibili（简体）');
    expect(markdown).toContain('## YouTube（繁体）');
    expect(markdown).toContain('公开资料');
  });
});
