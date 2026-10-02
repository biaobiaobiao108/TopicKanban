import { describe, expect, it } from 'bun:test';
import type { PaginatedTopics, Topic } from '../src/types';
import { applyOptimisticKanbanPageUpdates, hasMoreKanbanPages, rollbackFailedKanbanPage } from '../src/lib/kanbanPagination';

describe('看板分页失败恢复', () => {
  it('当前页卡片数不足时不会凭数量差异请求不存在的下一页', () => {
    expect(hasMoreKanbanPages(1, 1)).toBe(false);
    expect(hasMoreKanbanPages(1, 0)).toBe(false);
    expect(hasMoreKanbanPages(1)).toBe(false);
    expect(hasMoreKanbanPages(1, 2)).toBe(true);
    expect(hasMoreKanbanPages(2, 2)).toBe(false);
  });
  it('失败后重试仍会请求同一页', () => {
    const failedPage = 2;
    const pageAfterFailure = rollbackFailedKanbanPage(failedPage, failedPage);

    expect(pageAfterFailure + 1).toBe(failedPage);
  });

  it('较旧请求失败时不回退当前页', () => {
    expect(rollbackFailedKanbanPage(3, 2)).toBe(3);
  });

  it('页码不会回退到第一页之前', () => {
    expect(rollbackFailedKanbanPage(1, 1)).toBe(1);
  });

  it('重排缓存中的后续页时不把同阶段选题重复追加到第一页', () => {
    const first = { id: 'topic-a', status: 'inbox', sort_order: 1 } as Topic;
    const second = { id: 'topic-b', status: 'inbox', sort_order: 2 } as Topic;
    const pageOne: PaginatedTopics = { items: [first], page: 1, page_size: 30, total: 31, total_pages: 2 };
    const pageTwo: PaginatedTopics = { items: [second], page: 2, page_size: 30, total: 31, total_pages: 2 };
    const updates = [{ id: second.id, status: 'inbox' as const, sort_order: 1 }];
    const currentTopics = { [second.id]: second };

    const nextPageOne = applyOptimisticKanbanPageUpdates(pageOne, 1, 'inbox', updates, currentTopics, 'now');
    const nextPageTwo = applyOptimisticKanbanPageUpdates(pageTwo, 2, 'inbox', updates, currentTopics, 'now');

    expect(nextPageOne.items.map((topic) => topic.id)).toEqual(['topic-a']);
    expect(nextPageTwo.items.map((topic) => topic.id)).toEqual(['topic-b']);
    expect(nextPageOne.total).toBe(31);
    expect(nextPageTwo.total).toBe(31);
  });

  it('跨列移动的选题只会乐观插入目标列第一页', () => {
    const moved = { id: 'topic-moved', status: 'scripting', sort_order: 4 } as Topic;
    const pageOne: PaginatedTopics = { items: [], page: 1, page_size: 30, total: 5, total_pages: 1 };
    const pageTwo: PaginatedTopics = { items: [], page: 2, page_size: 30, total: 5, total_pages: 1 };
    const updates = [{ id: moved.id, status: 'inbox' as const, sort_order: 1 }];

    expect(applyOptimisticKanbanPageUpdates(pageOne, 1, 'inbox', updates, { [moved.id]: moved }, 'now').items)
      .toHaveLength(1);
    expect(applyOptimisticKanbanPageUpdates(pageTwo, 2, 'inbox', updates, { [moved.id]: moved }, 'now').items)
      .toHaveLength(0);
  });
});
