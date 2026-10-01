import type { Topic } from '../types';

export function hasMoreKanbanPages(currentPage: number, totalPages = 0): boolean {
  return currentPage < totalPages;
}

/** Restore the last successfully loaded page when the current page request fails. */
export function rollbackFailedKanbanPage(currentPage: number, failedPage: number): number {
  if (currentPage !== failedPage) return currentPage;
  return Math.max(1, failedPage - 1);
}

/** The subscribed board page owns current fields; workspace snapshots may be unsubscribed and stale. */
export function mergeKanbanTopic(pageTopic: Topic, workspaceTopic?: Topic): Topic {
  return workspaceTopic ? { ...workspaceTopic, ...pageTopic } : pageTopic;
}
