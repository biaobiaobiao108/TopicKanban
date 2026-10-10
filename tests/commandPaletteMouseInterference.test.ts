import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommandPalette } from '../src/components/layout/CommandPalette';
import { Topic, Person } from '../src/types';

describe('CommandPalette 键盘优先与鼠标防干扰契约', () => {
  const dummyTopics: Topic[] = [
    {
      id: 'topic-1',
      title: '第一项选题',
      summary: '',
      hook: '',
      storyline: '',
      why_now: '',
      status: 'inbox',
      priority: 'high',
      score_character: 0,
      score_conflict: 0,
      score_contrast: 0,
      score_material: 0,
      score_story: 0,
      is_pinned: 0,
      sort_order: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      tags: [],
    },
    {
      id: 'topic-2',
      title: '第二项选题',
      summary: '',
      hook: '',
      storyline: '',
      why_now: '',
      status: 'scripting',
      priority: 'medium',
      score_character: 0,
      score_conflict: 0,
      score_contrast: 0,
      score_material: 0,
      score_story: 0,
      is_pinned: 0,
      sort_order: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      tags: [],
    },
  ];

  const dummyPeople: Person[] = [];

  it('未选中的命令项不包含原生 hover:bg 或 group-hover 图标高亮，避免打开时鼠标停留在菜单区域产生高亮干扰', () => {
    const queryClient = new QueryClient();

    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(CommandPalette, {
          isOpen: true,
          onClose: () => {},
          topics: dummyTopics,
          people: dummyPeople,
          onSelectTopic: () => {},
          onSelectPerson: () => {},
          onNavigate: () => {},
          onOpenQuickCreate: () => {},
        })
      )
    );

    // 默认第一项（selectedIndex 0）获得高亮
    expect(html).toContain('bg-[var(--accent-soft)]');

    // 未选中项不得含有独立的 hover:bg-stone-50 干扰类
    expect(/\bhover:bg-stone-50\b/.test(html)).toBe(false);

    // 图标容器不得含有 group-hover 变色类
    expect(html).not.toContain('group-hover:bg-stone-200');
  });
});
