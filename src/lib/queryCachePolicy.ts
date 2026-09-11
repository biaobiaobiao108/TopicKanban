import type { QueryClient } from '@tanstack/react-query';

export const QUERY_GC_TIMES = {
  default: 2 * 60 * 1000,
  stable: 5 * 60 * 1000,
  list: 60 * 1000,
  detail: 90 * 1000,
  search: 30 * 1000,
  media: 60 * 1000,
} as const;

export function configureQueryCache(queryClient: QueryClient): void {
  [
    ['settings'],
    ['deal-focus'],
    ['active-topic-count'],
  ].forEach((queryKey) => queryClient.setQueryDefaults(queryKey, { gcTime: QUERY_GC_TIMES.stable }));

  [
    ['kanban-column-page'],
    ['topics-page'],
    ['people'],
    ['relationships'],
    ['tags'],
    ['tags-options'],
    ['published'],
    ['topics', 'trash'],
    ['people-page'],
    ['tags-page'],
    ['tag-topics-page'],
    ['published-page'],
    ['published-analytics'],
    ['commercial-deal-page'],
    ['published-for-deal'],
  ].forEach((queryKey) => queryClient.setQueryDefaults(queryKey, { gcTime: QUERY_GC_TIMES.list }));

  [
    ['topic-sources'],
    ['topic-timeline'],
    ['topic-draft'],
    ['topic-citations'],
    ['topic-workspace'],
    ['topic-deals'],
    ['topic-todos'],
    ['commercial-deal'],
  ].forEach((queryKey) => queryClient.setQueryDefaults(queryKey, { gcTime: QUERY_GC_TIMES.detail }));

  queryClient.setQueryDefaults(['command-topic-search'], { gcTime: QUERY_GC_TIMES.search });
}
