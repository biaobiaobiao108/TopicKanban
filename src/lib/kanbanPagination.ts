import type { PaginatedTopics, Topic, TopicStatus } from '../types';

export function applyOptimisticKanbanPageUpdates(
  oldData: PaginatedTopics,
  page: number,
  queryStatus: TopicStatus,
  updates: Array<{ id: string; status: TopicStatus; sort_order: number }>,
  currentTopics: Record<string, Topic>,
  updatedAt: string,
): PaginatedTopics {
  const updateMap = new Map(updates.map((update) => [update.id, update]));
  const pageItems = new Map(oldData.items.map((topic) => [topic.id, topic]));

  const additions: Topic[] = [];
  updates.forEach((update) => {
    if (update.status !== queryStatus) return;
    const pageItem = pageItems.get(update.id);
    const currentTopic = currentTopics[update.id];
    const enteringColumn = currentTopic?.status !== queryStatus;
    const existing = pageItem || (page === 1 && enteringColumn ? currentTopic : undefined);
    if (!existing) return;
    additions.push({
      ...existing,
      status: queryStatus,
      sort_order: update.sort_order,
      updated_at: updatedAt,
    });
  });

  const keptItems = oldData.items.filter((topic) => {
    const update = updateMap.get(topic.id);
    return !update || update.status === queryStatus;
  });
  const mergedItems = new Map(keptItems.map((topic) => [topic.id, topic]));
  additions.forEach((topic) => mergedItems.set(topic.id, topic));
  const items = Array.from(mergedItems.values()).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const total = Math.max(0, oldData.total + items.length - oldData.items.length);

  return {
    ...oldData,
    items,
    total,
    total_pages: oldData.page_size > 0 ? Math.ceil(total / oldData.page_size) : oldData.total_pages,
  };
}

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
