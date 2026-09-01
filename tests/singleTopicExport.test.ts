import { describe, it, expect } from 'bun:test';
import { exportSingleTopicMarkdown, htmlToCleanMarkdown } from '../src/lib/remoteStorage';
import type { Topic, Source, TimelineEvent, Draft } from '../src/types';

describe('exportSingleTopicMarkdown utility', () => {
  const sampleTopic: Topic = {
    id: 'topic-demo',
    title: '荒诞事件调查：网红塌房全记录',
    summary: '揭露某网红虚假人设与幕后产业链。',
    hook: '坐拥千万粉丝的顶级网红，为何在一夜之间被全网声讨？',
    storyline: '从高光出道到虚假带货，再到多方反转。',
    why_now: '近期行业整顿与相关法律判决下达。',
    status: 'scripting',
    priority: 'high',
    current_todo: {
      id: 'todo-demo', topic_id: 'topic-demo', title: '撰写第三幕反转文案',
      is_current: 1, current_started_at: '2026-08-20T10:00:00.000Z', completed_at: null,
      sort_order: 1, created_at: '2026-08-20T10:00:00.000Z', updated_at: '2026-08-20T10:00:00.000Z',
    },
    score_character: 2,
    score_conflict: 2,
    score_contrast: 2,
    score_material: 1,
    score_story: 2,
    is_pinned: 1,
    sort_order: 1,
    created_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-22T10:00:00.000Z',
    tags: [{ id: 'tag-1', name: '网红深度' }],
    people: [{ id: 'p-1', name: '张三', aliases: '阿张', avatar_url: '', description: '', identity: '', platform_accounts: '', quotes: '', notes: '', created_at: '', updated_at: '' }],
  };

  const sampleSources: Source[] = [
    {
      id: 'src-1',
      topic_id: 'topic-demo',
      title: '官方裁判文书公示',
      content: '公开裁决书显示被告存在隐瞒事实行为。',
      url: 'https://example.com/law',
      platform: 'news',
      author: '法院公告',
      published_at: '2026-08-15',
      verification_status: 'confirmed',
      notes: '已核实真实性',
      created_at: '',
      updated_at: '',
    },
  ];

  const sampleTimeline: TimelineEvent[] = [
    {
      id: 'time-1',
      topic_id: 'topic-demo',
      title: '首次爆出虚假宣传',
      description: '受害者在社交平台发布开箱实测视频。',
      event_date: '2026-05-12',
      date_precision: 'exact',
      verification_status: 'confirmed',
      sort_order: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  const sampleDraft: Draft = {
    id: 'draft-demo',
    topic_id: 'topic-demo',
    title: '文案初稿',
    content_html: '<h1>开场</h1><p>这是一个<strong>荒诞</strong>的故事。</p><blockquote>真实比小说更离奇。</blockquote>',
    content_json: '{}',
    word_count: 560,
    version: 1,
    updated_at: '2026-08-22T11:00:00.000Z',
  };

  it('should clean HTML tags into valid markdown', () => {
    const html = '<h1>标题1</h1><p>段落文本与<strong>加粗</strong></p><blockquote>引言金句</blockquote>';
    const md = htmlToCleanMarkdown(html);
    expect(md).toContain('# 标题1');
    expect(md).toContain('**加粗**');
    expect(md).toContain('> 引言金句');
  });

  it('should export full structured markdown document for a topic', () => {
    const exported = exportSingleTopicMarkdown(
      sampleTopic,
      { sources: sampleSources, timeline: sampleTimeline, draft: sampleDraft },
      280
    );

    expect(exported).toContain('# 🎬 【选题档案】荒诞事件调查：网红塌房全记录');
    expect(exported).toContain('## 一、核心定位与故事脉络');
    expect(exported).toContain('坐拥千万粉丝的顶级网红');
    expect(exported).toContain('## 二、5 维故事评估 (总分：9/10)');
    expect(exported).toContain('## 三、故事时间线 (1 个关键节点)');
    expect(exported).toContain('首次爆出虚假宣传');
    expect(exported).toContain('## 四、资料证据链 (1 条资料)');
    expect(exported).toContain('官方裁判文书公示');
    expect(exported).toContain('## 五、解说文案草稿正文');
    expect(exported).toContain('# 开场');
    expect(exported).toContain('真实比小说更离奇');
  });
});
