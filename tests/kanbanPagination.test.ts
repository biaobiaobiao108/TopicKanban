import { describe, expect, it } from 'bun:test';
import { rollbackFailedKanbanPage } from '../src/lib/kanbanPagination';

describe('看板分页失败恢复', () => {
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
