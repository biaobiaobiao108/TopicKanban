import { describe, expect, it } from 'bun:test';
import type { Person, Tag, Topic } from '../src/types';
import { matchesTopicSearch } from '../src/lib/topicSearch';

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-search',
    title: '默认标题',
    summary: '',
    hook: '',
    storyline: '',
    why_now: '',
    status: 'production',
    priority: 'medium',
    score_character: 0,
    score_conflict: 0,
    score_contrast: 0,
    score_material: 0,
    score_story: 0,
    is_pinned: 0,
    sort_order: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('选题搜索字段一致性', () => {
  it('覆盖服务端分页搜索使用的故事、人物和行动字段', () => {
    const person = {
      id: 'person-search',
      name: '本名',
      aliases: '网络别名',
      identity: '关键身份',
    } as Person;
    const searchableTopic = topic({
      storyline: '故事转折关键词',
      current_todo: { id: 'todo-search', topic_id: 'topic-search', title: '待核对行动', is_current: 1, sort_order: 1, created_at: '', updated_at: '' },
      people: [person],
      tags: [{ id: 'tag-search', name: '分类关键词' } as Tag],
    });

    expect(matchesTopicSearch(searchableTopic, '转折关键词')).toBe(true);
    expect(matchesTopicSearch(searchableTopic, '网络别名')).toBe(true);
    expect(matchesTopicSearch(searchableTopic, '关键身份')).toBe(true);
    expect(matchesTopicSearch(searchableTopic, '分类关键词')).toBe(true);
    expect(matchesTopicSearch(searchableTopic, '待核对行动')).toBe(true);
  });

  it('统一处理大小写、首尾空白和空搜索词', () => {
    const searchableTopic = topic({ title: 'MixedCase Title' });

    expect(matchesTopicSearch(searchableTopic, '  mixedcase  ')).toBe(true);
    expect(matchesTopicSearch(searchableTopic, '   ')).toBe(true);
    expect(matchesTopicSearch(searchableTopic, '不存在的词')).toBe(false);
  });
});
