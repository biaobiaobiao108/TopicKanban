import { describe, expect, it } from 'bun:test';
import { hasMoreKanbanPages, rollbackFailedKanbanPage } from '../src/lib/kanbanPagination';

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
});
