import type { QueryClient } from '@tanstack/react-query';
import { invalidateBootstrap } from './storage';

const topicQueryKeys = [
  ['today-focus'],
  ['deal-focus'],
  ['workspace'],
  ['topic-todos-all'],
  ['kanban-column-page'],
  ['topics-page'],
  ['topics', 'trash'],
  ['tags-page'],
  ['tag-topics-page'],
  ['people-page'],
  ['published'],
  ['published-page'],
  ['published-analytics'],
  ['commercial-deals-calendar'],
  ['topic-deals'],
  ['command-topic-search'],
] as const;

/**
 * Mark every topic-derived query stale while only refetching queries used by
 * the currently visible view. The today-focus query is kept mounted globally
 * so it also provides an up-to-date navigation count.
 */
export async function refreshTopicData(queryClient: QueryClient): Promise<void> {
  invalidateBootstrap();
  await Promise.all(topicQueryKeys.map((queryKey) => queryClient.invalidateQueries({
    queryKey,
    refetchType: 'active',
  })));
}
