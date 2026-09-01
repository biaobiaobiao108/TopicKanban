import { describe, expect, it } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import type {
  BootstrapData,
  CommercialDeal,
  DealFocusData,
  PaginatedCommercialDeals,
  PaginatedPeople,
  PaginatedPublishedVideos,
  PaginatedTags,
  PaginatedTopics,
  Person,
  PublishedVideo,
  Tag,
  TodayFocusData,
  Topic,
  TopicTodo,
  TopicTodoMutationResult,
} from '../src/types';
import {
  removeCommercialDealCaches,
  removePersonCaches,
  removePublishedCaches,
  removeTagCaches,
  removeTopicCaches,
  replaceTopicTodoCaches,
  replaceTopicPinCaches,
  updateCommercialDealCaches,
  updatePersonCaches,
  updatePublishedCaches,
  updateTagCaches,
  updateTopicCaches,
} from '../src/lib/queryCacheSync';

function topic(id: string, overrides: Partial<Topic> = {}): Topic {
  return {
    id,
    title: `选题 ${id}`,
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
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function page<T extends { id: string }>(items: T[]) {
  return {
    items,
    page: 1,
    page_size: 30,
    total: items.length,
    total_pages: items.length > 0 ? 1 : 0,
  };
}

function baseWorkspace(topics: Topic[] = []): BootstrapData {
  return { topics, people: [], relationships: [], published: [], tags: [], settings: { reading_speed: 280, theme: 'light' } };
}

describe('跨视图实体缓存同步', () => {
  it('同步唯一主推选题并清除旧主推缓存', () => {
    const queryClient = new QueryClient();
    const oldPinned = topic('topic-old', { is_pinned: 1 });
    const nextPinned = topic('topic-next');
    const key = ['kanban-column-page', 'production', '', 'all', 'all', 'all', 'sort_order', 1];
    queryClient.setQueryData<BootstrapData>(['workspace'], baseWorkspace([oldPinned, nextPinned]));
    queryClient.setQueryData<TodayFocusData>(['today-focus'], { topics: [oldPinned, nextPinned], total_active: 2 });
    queryClient.setQueryData<PaginatedTopics>(key, page([oldPinned, nextPinned]));

    replaceTopicPinCaches(queryClient, { topic: { ...nextPinned, is_pinned: 1 }, cleared_topic_ids: [oldPinned.id] });

    expect(queryClient.getQueryData<BootstrapData>(['workspace'])?.topics).toEqual([
      { ...oldPinned, is_pinned: 0 },
      { ...nextPinned, is_pinned: 1 },
    ]);
    expect(queryClient.getQueryData<TodayFocusData>(['today-focus'])?.topics[0].is_pinned).toBe(0);
    expect(queryClient.getQueryData<PaginatedTopics>(key)?.items.find((item) => item.id === nextPinned.id)?.is_pinned).toBe(1);
  });

  it('同步选题到工作区、今日聚焦和所有分页选题缓存', () => {
    const queryClient = new QueryClient();
    const current = topic('topic-1', { deadline: '2026-08-28' });
    queryClient.setQueryData<BootstrapData>(['workspace'], baseWorkspace([current]));
    queryClient.setQueryData<TodayFocusData>(['today-focus'], { topics: [current], total_active: 1 });
    queryClient.setQueryData<PaginatedTopics>(['kanban-column-page', 'production'], page([current]));
    queryClient.setQueryData<PaginatedTopics>(['topics-page', 'active'], page([current]));
    queryClient.setQueryData<PaginatedTopics>(['tag-topics-page', 'tag-1'], page([current]));
    queryClient.setQueryData<PaginatedTopics>(['command-topic-search', '选题'], page([current]));

    updateTopicCaches(queryClient, current.id, { deadline: '2026-09-05', draft_word_count: 1200 });
    updateTopicCaches(queryClient, current.id, { target_publish_date: '2026-09-01' });

    expect(queryClient.getQueryData<BootstrapData>(['workspace'])?.topics[0].deadline).toBe('2026-09-05');
    expect(queryClient.getQueryData<TodayFocusData>(['today-focus'])?.topics[0].draft_word_count).toBe(1200);
    expect(queryClient.getQueryData<PaginatedTopics>(['kanban-column-page', 'production'])?.items[0].deadline).toBe('2026-09-05');
    expect(queryClient.getQueryData<PaginatedTopics>(['topics-page', 'active'])?.items[0].draft_word_count).toBe(1200);
    expect(queryClient.getQueryData<PaginatedTopics>(['tag-topics-page', 'tag-1'])?.items[0].deadline).toBe('2026-09-05');
    expect(queryClient.getQueryData<PaginatedTopics>(['kanban-column-page', 'production'])?.items[0].target_publish_date).toBe('2026-09-01');
    expect(queryClient.getQueryData<PaginatedTopics>(['command-topic-search', '选题'])?.items[0].deadline).toBe('2026-09-05');
  });

  it('阶段或看板筛选相关字段变化时同步调整已缓存看板页', () => {
    const queryClient = new QueryClient();
    const current = topic('topic-1', { title: '旧标题' });
    const key = (status: Topic['status']) => ['kanban-column-page', status, '', 'all', 'all', 'all', 'sort_order', 1];
    queryClient.setQueryData<PaginatedTopics>(key('production'), page([current]));
    queryClient.setQueryData<PaginatedTopics>(key('approved'), page([]));

    updateTopicCaches(queryClient, current.id, { status: 'approved', title: '新标题' });

    expect(queryClient.getQueryData<PaginatedTopics>(key('production'))?.items).toEqual([]);
    expect(queryClient.getQueryData<PaginatedTopics>(key('production'))?.total).toBe(0);
    expect(queryClient.getQueryData<PaginatedTopics>(key('approved'))?.items[0].title).toBe('新标题');
    expect(queryClient.getQueryData<PaginatedTopics>(key('approved'))?.total).toBe(1);
  });

  it('Todo 变更同步当前选题和详情清单缓存', () => {
    const queryClient = new QueryClient();
    const current = topic('topic-1');
    const todo = {
      id: 'todo-1', topic_id: current.id, title: '核对原始资料',
      is_current: 1, current_started_at: '2026-08-25T00:00:00.000Z', completed_at: null,
      sort_order: 1, created_at: '2026-08-25T00:00:00.000Z', updated_at: '2026-08-25T00:00:00.000Z',
    } satisfies TopicTodo;
    const result: TopicTodoMutationResult = {
      topic: { ...current, current_todo: todo },
      todos: [todo],
    };
    queryClient.setQueryData<BootstrapData>(['workspace'], baseWorkspace([current]));
    queryClient.setQueryData<TodayFocusData>(['today-focus'], { topics: [current], total_active: 1 });
    queryClient.setQueryData<TopicTodo[]>(['topic-todos', current.id], []);

    replaceTopicTodoCaches(queryClient, result);

    expect(queryClient.getQueryData<BootstrapData>(['workspace'])?.topics[0].current_todo?.title).toBe('核对原始资料');
    expect(queryClient.getQueryData<TodayFocusData>(['today-focus'])?.topics[0].current_todo?.id).toBe(todo.id);
    expect(queryClient.getQueryData<TopicTodo[]>(['topic-todos', current.id])).toEqual([todo]);
  });

  it('同步人物和标签在选题关联对象中的显示值', () => {
    const queryClient = new QueryClient();
    const person = { id: 'person-1', name: '旧人物' } as Person;
    const tag = { id: 'tag-1', name: '旧标签', color: 'stone' } as Tag;
    const current = topic('topic-1', { people: [person], tags: [tag] });
    queryClient.setQueryData<BootstrapData>(['workspace'], { ...baseWorkspace([current]), people: [person], tags: [tag] });
    queryClient.setQueryData<PaginatedPeople>(['people-page', 1, ''], page([person]));
    queryClient.setQueryData<PaginatedTags>(['tags-page', 1, ''], { ...page([tag]), summary: { tagged_topics: 1, total_topics: 1 } });
    queryClient.setQueryData<PaginatedTopics>(['kanban-column-page', 'production'], page([current]));

    updatePersonCaches(queryClient, { ...person, name: '新人物' });
    updateTagCaches(queryClient, { ...tag, name: '新标签', color: 'rose' });

    expect(queryClient.getQueryData<PaginatedPeople>(['people-page', 1, ''])?.items[0].name).toBe('新人物');
    expect(queryClient.getQueryData<PaginatedTags>(['tags-page', 1, ''])?.items[0].name).toBe('新标签');
    const cachedTopic = queryClient.getQueryData<PaginatedTopics>(['kanban-column-page', 'production'])?.items[0];
    expect(cachedTopic?.people?.[0].name).toBe('新人物');
    expect(cachedTopic?.tags?.[0].name).toBe('新标签');
  });

  it('同步发布视频和商单的详情、分页与摘要缓存', () => {
    const queryClient = new QueryClient();
    const video = { id: 'video-1', title: '旧标题' } as PublishedVideo;
    const deal = { id: 'deal-1', title: '旧商单', amount_cents: 100 } as CommercialDeal;
    queryClient.setQueryData<PublishedVideo[]>(['published'], [video]);
    queryClient.setQueryData<PaginatedPublishedVideos>(['published-page', 1], page([video]));
    queryClient.setQueryData<CommercialDeal[]>(['commercial-deals-calendar'], [deal]);
    queryClient.setQueryData<PaginatedCommercialDeals>(['commercial-deal-page', { page: 1 }], { ...page([deal]), summary: { active_count: 1, due_soon_count: 0, needs_action_count: 0, unpaid_amount_cents: 100, unpaid_count: 1 } });
    queryClient.setQueryData<DealFocusData>(['deal-focus'], { due_items: [deal], unpaid_items: [deal], total_active: 1 });

    updatePublishedCaches(queryClient, { ...video, title: '新标题' });
    updateCommercialDealCaches(queryClient, { ...deal, title: '新商单', amount_cents: 200 });

    expect(queryClient.getQueryData<PublishedVideo[]>(['published'])?.[0].title).toBe('新标题');
    expect(queryClient.getQueryData<PaginatedPublishedVideos>(['published-page', 1])?.items[0].title).toBe('新标题');
    expect(queryClient.getQueryData<CommercialDeal[]>(['commercial-deals-calendar'])?.[0].title).toBe('新商单');
    expect(queryClient.getQueryData<PaginatedCommercialDeals>(['commercial-deal-page', { page: 1 }])?.items[0].amount_cents).toBe(200);
    expect(queryClient.getQueryData<DealFocusData>(['deal-focus'])?.due_items[0].title).toBe('新商单');
  });

  it('删除操作只移除已有缓存项，不制造新的分页数据', () => {
    const queryClient = new QueryClient();
    const current = topic('topic-1');
    const person = { id: 'person-1', name: '人物' } as Person;
    const tag = { id: 'tag-1', name: '标签' } as Tag;
    const video = { id: 'video-1', title: '视频' } as PublishedVideo;
    const deal = { id: 'deal-1', title: '商单' } as CommercialDeal;
    queryClient.setQueryData<BootstrapData>(['workspace'], { ...baseWorkspace([current]), people: [person], tags: [tag], published: [video] });
    queryClient.setQueryData<TodayFocusData>(['today-focus'], { topics: [current], total_active: 1 });
    queryClient.setQueryData<PaginatedTopics>(['kanban-column-page', 'production'], page([current]));
    queryClient.setQueryData<PaginatedPeople>(['people-page', 1, ''], page([person]));
    queryClient.setQueryData<PaginatedTags>(['tags-page', 1, ''], { ...page([tag]), summary: { tagged_topics: 0, total_topics: 0 } });
    queryClient.setQueryData<PaginatedPublishedVideos>(['published-page', 1], page([video]));
    queryClient.setQueryData<PaginatedCommercialDeals>(['commercial-deal-page', { page: 1 }], { ...page([deal]), summary: { active_count: 0, due_soon_count: 0, needs_action_count: 0, unpaid_amount_cents: 0, unpaid_count: 0 } });
    queryClient.setQueryData<CommercialDeal[]>(['commercial-deals-calendar'], [deal]);

    removeTopicCaches(queryClient, current.id);
    removePersonCaches(queryClient, person.id);
    removeTagCaches(queryClient, tag.id);
    removePublishedCaches(queryClient, video.id);
    removeCommercialDealCaches(queryClient, deal.id);

    expect(queryClient.getQueryData<BootstrapData>(['workspace'])?.topics).toEqual([]);
    expect(queryClient.getQueryData<PaginatedTopics>(['kanban-column-page', 'production'])?.items).toEqual([]);
    expect(queryClient.getQueryData<PaginatedTopics>(['kanban-column-page', 'production'])?.total).toBe(0);
    expect(queryClient.getQueryData<PaginatedPeople>(['people-page', 1, ''])?.items).toEqual([]);
    expect(queryClient.getQueryData<PaginatedPeople>(['people-page', 1, ''])?.total).toBe(0);
    expect(queryClient.getQueryData<PaginatedTags>(['tags-page', 1, ''])?.items).toEqual([]);
    expect(queryClient.getQueryData<PaginatedTags>(['tags-page', 1, ''])?.total).toBe(0);
    expect(queryClient.getQueryData<PaginatedPublishedVideos>(['published-page', 1])?.items).toEqual([]);
    expect(queryClient.getQueryData<PaginatedPublishedVideos>(['published-page', 1])?.total).toBe(0);
    expect(queryClient.getQueryData<PaginatedCommercialDeals>(['commercial-deal-page', { page: 1 }])?.items).toEqual([]);
    expect(queryClient.getQueryData<PaginatedCommercialDeals>(['commercial-deal-page', { page: 1 }])?.total).toBe(0);
    expect(queryClient.getQueryData<CommercialDeal[]>(['commercial-deals-calendar'])).toEqual([]);
  });
});
