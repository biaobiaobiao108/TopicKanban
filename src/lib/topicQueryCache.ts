import type { QueryClient } from '@tanstack/react-query';
import { invalidateBootstrap } from './storage';

const topicAggregateQueryKeys = [
  ['today-focus'],
  ['active-topic-count'],
  ['deal-focus'],
  ['workspace'],
  ['command-topic-search'],
] as const;

const topicListQueryKeys = [
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
] as const;

export interface RefreshTopicDataOptions {
  /** Structural mutations need to repair pagination; field edits already patch list caches. */
  includeLists?: boolean;
}

export async function invalidateQueryGroups(
  queryClient: QueryClient,
  queryKeys: readonly (readonly unknown[])[],
): Promise<void> {
  await Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({
    queryKey,
    refetchType: 'active',
  })));
}

/**
 * Mark every topic-derived query stale while only refetching queries used by
 * the currently visible view. Aggregates are re-read from the server rather
 * than guessed from the current client cache.
 */
export async function refreshTopicData(
  queryClient: QueryClient,
  options: RefreshTopicDataOptions = {},
): Promise<void> {
  invalidateBootstrap();
  await invalidateQueryGroups(queryClient, [
    ...topicAggregateQueryKeys,
    ...(options.includeLists ? topicListQueryKeys : []),
  ]);
}
