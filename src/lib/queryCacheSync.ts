import type { QueryClient } from '@tanstack/react-query';
import type {
  BootstrapData,
  CommercialDeal,
  CommercialDealDetail,
  DealFocusData,
  PaginatedCommercialDeals,
  PaginatedPeople,
  PaginatedPublishedVideos,
  PaginatedTags,
  PaginatedTopics,
  Person,
  PersonOption,
  PersonRelationship,
  PublishedVideo,
  Tag,
  TodayFocusData,
  Topic,
  TopicTodoMutationResult,
} from '../types';

type TopicList = PaginatedTopics;
type TagListItem = Tag & {
  stats?: {
    count: number;
    in_progress_count: number;
    published_count: number;
    words_total: number;
    avg_score: number;
  };
};

const topicListKeys = [
  ['kanban-column-page'],
  ['topics-page'],
  ['tag-topics-page'],
  ['command-topic-search'],
] as const;

function mapItems<T extends { id: string }>(items: T[] | undefined, id: string, updater: (item: T) => T): T[] | undefined {
  if (!items) return items;
  return items.map((item) => (item.id === id ? updater(item) : item));
}

function removeItems<T extends { id: string }>(items: T[] | undefined, id: string): T[] | undefined {
  return items?.filter((item) => item.id !== id);
}

function patchPaginatedItems<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  id: string,
  updater: (item: T) => T,
) {
  queryClient.setQueriesData<{ items: T[] }>({ queryKey }, (current) => {
    if (!current || !Array.isArray(current.items)) return current;
    return { ...current, items: mapItems(current.items, id, updater) || [] };
  });
}

function removePaginatedItem<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  id: string,
) {
  queryClient.setQueriesData<{ items: T[]; total?: number; page_size?: number; total_pages?: number }>({ queryKey }, (current) => {
    if (!current || !Array.isArray(current.items)) return current;
    if (!current.items.some((item) => item.id === id)) return current;
    const items = removeItems(current.items, id) || [];
    const total = typeof current.total === 'number' ? Math.max(0, current.total - 1) : current.total;
    const totalPages = typeof total === 'number' && typeof current.page_size === 'number' && current.page_size > 0
      ? Math.ceil(total / current.page_size)
      : current.total_pages;
    return { ...current, items, total, total_pages: totalPages };
  });
}

function updateTopicLists(queryClient: QueryClient, topicId: string, updater: (topic: Topic) => Topic) {
  topicListKeys.forEach((queryKey) => {
    patchPaginatedItems<Topic>(queryClient, queryKey, topicId, updater);
  });
}

function topicMatchesKanbanQuery(topic: Topic, queryKey: readonly unknown[]): boolean {
  const status = queryKey[1];
  const searchTerm = typeof queryKey[2] === 'string' ? queryKey[2].trim().toLowerCase() : '';
  const priority = queryKey[3];
  const tagId = queryKey[4];
  const personId = queryKey[5];
  if (status && topic.status !== status) return false;
  if (priority && priority !== 'all' && topic.priority !== priority) return false;
  if (tagId && tagId !== 'all' && !topic.tags?.some((tag) => tag.id === tagId)) return false;
  if (personId && personId !== 'all' && !topic.people?.some((person) => person.id === personId)) return false;
  if (!searchTerm) return true;
  return [topic.title, topic.summary, topic.hook, topic.current_todo?.title].some((value) => value?.toLowerCase().includes(searchTerm))
    || Boolean(topic.people?.some((person) => person.name.toLowerCase().includes(searchTerm)))
    || Boolean(topic.tags?.some((tag) => tag.name.toLowerCase().includes(searchTerm)));
}

function updateKanbanTopicCaches(queryClient: QueryClient, topicId: string, updates: Partial<Topic>) {
  const cachedQueries = queryClient.getQueriesData<PaginatedTopics>({ queryKey: ['kanban-column-page'] });
  const existing = cachedQueries.flatMap(([, data]) => data?.items || []).find((topic) => topic.id === topicId);
  if (!existing) return;

  const updatedTopic = { ...existing, ...updates };
  cachedQueries.forEach(([queryKey, current]) => {
    if (!current || !Array.isArray(current.items)) return;
    const hasItem = current.items.some((topic) => topic.id === topicId);
    const shouldInclude = topicMatchesKanbanQuery(updatedTopic, queryKey);
    const page = typeof queryKey[7] === 'number' ? queryKey[7] : 1;
    let items = current.items.filter((topic) => topic.id !== topicId);
    if (shouldInclude && (hasItem || page === 1)) {
      items = [...items, updatedTopic].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
    const delta = (shouldInclude && !hasItem && page === 1 ? 1 : 0) - (!shouldInclude && hasItem ? 1 : 0);
    const total = Math.max(0, current.total + delta);
    const totalPages = current.page_size > 0 ? Math.ceil(total / current.page_size) : current.total_pages;
    queryClient.setQueryData<PaginatedTopics>(queryKey, { ...current, items, total, total_pages: totalPages });
  });
}

function mapTopicLists(queryClient: QueryClient, updater: (topic: Topic) => Topic) {
  topicListKeys.forEach((queryKey) => {
    queryClient.setQueriesData<TopicList>({ queryKey }, (current) => current
      ? { ...current, items: current.items.map(updater) }
      : current);
  });
}

function removeTopicFromLists(queryClient: QueryClient, topicId: string) {
  topicListKeys.forEach((queryKey) => {
    removePaginatedItem<Topic>(queryClient, queryKey, topicId);
  });
}

function updateTopicCollections(queryClient: QueryClient, topicId: string, updater: (topic: Topic) => Topic) {
  queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current
    ? { ...current, topics: mapItems(current.topics, topicId, updater) || [] }
    : current);
  queryClient.setQueryData<TodayFocusData>(['today-focus'], (current) => current
    ? { ...current, topics: mapItems(current.topics, topicId, updater) || [] }
    : current);
  updateTopicLists(queryClient, topicId, updater);
}

function mapTopicCollections(queryClient: QueryClient, updater: (topic: Topic) => Topic) {
  queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current
    ? { ...current, topics: current.topics.map(updater) }
    : current);
  queryClient.setQueryData<TodayFocusData>(['today-focus'], (current) => current
    ? { ...current, topics: current.topics.map(updater) }
    : current);
  mapTopicLists(queryClient, updater);
}

export function updateTopicCaches(queryClient: QueryClient, topicId: string, updates: Partial<Topic>) {
  updateTopicCollections(queryClient, topicId, (topic) => ({ ...topic, ...updates }));
  // Search, filter and relation edits can change whether a cached Kanban page
  // should contain the topic, not just stage changes.
  updateKanbanTopicCaches(queryClient, topicId, updates);
}

export function replaceTopicCaches(queryClient: QueryClient, topic: Topic) {
  updateTopicCaches(queryClient, topic.id, topic);
}

export function replaceTopicTodoCaches(queryClient: QueryClient, result: TopicTodoMutationResult) {
  queryClient.setQueryData(['topic-todos', result.topic.id], result.todos);
  replaceTopicCaches(queryClient, result.topic);
}

export function removeTopicCaches(queryClient: QueryClient, topicId: string) {
  queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current
    ? { ...current, topics: removeItems(current.topics, topicId) || [] }
    : current);
  queryClient.setQueryData<TodayFocusData>(['today-focus'], (current) => current
    ? { ...current, topics: removeItems(current.topics, topicId) || [] }
    : current);
  removeTopicFromLists(queryClient, topicId);
}

export function updatePersonCaches(queryClient: QueryClient, person: Person) {
  queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current
    ? { ...current, people: mapItems(current.people, person.id, (item) => ({ ...item, ...person })) || [] }
    : current);
  queryClient.setQueryData<Person[]>(['people'], (current) => mapItems(current, person.id, (item) => ({ ...item, ...person })) || current);
  queryClient.setQueriesData<PaginatedPeople>({ queryKey: ['people-page'] }, (current) => current
    ? { ...current, items: mapItems(current.items, person.id, (item) => ({ ...item, ...person })) || [] }
    : current);
  queryClient.setQueryData<PersonOption[]>(['people-options'], (current) => current
    ? current.map((item) => item.id === person.id ? { ...item, name: person.name } : item)
    : current);
  queryClient.setQueryData<PersonRelationship[]>(['relationships'], (current) => current
    ? current.map((relationship) => ({
      ...relationship,
      ...(relationship.person_a_id === person.id ? { person_a_name: person.name } : {}),
      ...(relationship.person_b_id === person.id ? { person_b_name: person.name } : {}),
    }))
    : current);
  mapTopicCollections(queryClient, (topic) => topic.people?.some((item) => item.id === person.id)
    ? { ...topic, people: topic.people?.map((item) => item.id === person.id ? { ...item, ...person } : item) }
    : topic);
}

export function removePersonCaches(queryClient: QueryClient, personId: string) {
  queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current
    ? { ...current, people: removeItems(current.people, personId) || [] }
    : current);
  queryClient.setQueryData<Person[]>(['people'], (current) => removeItems(current, personId) || current);
  removePaginatedItem(queryClient, ['people-page'], personId);
  queryClient.setQueryData<PersonOption[]>(['people-options'], (current) => current?.filter((item) => item.id !== personId));
  queryClient.setQueryData<PersonRelationship[]>(['relationships'], (current) => current?.filter((relationship) => (
    relationship.person_a_id !== personId && relationship.person_b_id !== personId
  )));
  mapTopicCollections(queryClient, (topic) => topic.people?.some((item) => item.id === personId)
    ? { ...topic, people: topic.people?.filter((item) => item.id !== personId) }
    : topic);
}

function updateTopicTags(queryClient: QueryClient, tagId: string, updater: (tag: Tag) => Tag) {
  mapTopicCollections(queryClient, (topic) => topic.tags?.some((tag) => tag.id === tagId)
    ? { ...topic, tags: topic.tags?.map((tag) => tag.id === tagId ? updater(tag) : tag) }
    : topic);
}

function removeTopicTagCollections(queryClient: QueryClient, tagId: string) {
  mapTopicCollections(queryClient, (topic) => topic.tags?.some((tag) => tag.id === tagId)
    ? { ...topic, tags: topic.tags?.filter((tag) => tag.id !== tagId) }
    : topic);
}

export function updateTagCaches(queryClient: QueryClient, tag: Tag) {
  queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current
    ? { ...current, tags: mapItems(current.tags, tag.id, (item) => ({ ...item, ...tag })) || [] }
    : current);
  queryClient.setQueryData<Tag[]>(['tags'], (current) => mapItems(current, tag.id, (item) => ({ ...item, ...tag })) || current);
  queryClient.setQueryData<Tag[]>(['tags-options'], (current) => mapItems(current, tag.id, (item) => ({ ...item, ...tag })) || current);
  queryClient.setQueriesData<PaginatedTags>({ queryKey: ['tags-page'] }, (current) => current
    ? { ...current, items: mapItems<TagListItem>(current.items, tag.id, (item) => ({ ...item, ...tag })) || [] }
    : current);
  updateTopicTags(queryClient, tag.id, (item) => ({ ...item, ...tag }));
}

export function removeTagCaches(queryClient: QueryClient, tagId: string) {
  queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current
    ? { ...current, tags: removeItems(current.tags, tagId) || [] }
    : current);
  queryClient.setQueryData<Tag[]>(['tags'], (current) => removeItems(current, tagId) || current);
  queryClient.setQueryData<Tag[]>(['tags-options'], (current) => removeItems(current, tagId));
  removePaginatedItem(queryClient, ['tags-page'], tagId);
  removeTopicTagCollections(queryClient, tagId);
}

export function updatePublishedCaches(queryClient: QueryClient, video: PublishedVideo) {
  queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current
    ? { ...current, published: mapItems(current.published, video.id, (item) => ({ ...item, ...video })) || [] }
    : current);
  queryClient.setQueryData<PublishedVideo[]>(['published'], (current) => mapItems(current, video.id, (item) => ({ ...item, ...video })) || current);
  queryClient.setQueriesData<PaginatedPublishedVideos>({ queryKey: ['published-page'] }, (current) => current
    ? { ...current, items: mapItems(current.items, video.id, (item) => ({ ...item, ...video })) || [] }
    : current);
  queryClient.setQueriesData<PublishedVideo[]>({ queryKey: ['published-for-deal'] }, (current) => current
    ? mapItems(current, video.id, (item) => ({ ...item, ...video })) || []
    : current);
}

export function removePublishedCaches(queryClient: QueryClient, videoId: string) {
  queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current
    ? { ...current, published: removeItems(current.published, videoId) || [] }
    : current);
  queryClient.setQueryData<PublishedVideo[]>(['published'], (current) => removeItems(current, videoId) || current);
  removePaginatedItem(queryClient, ['published-page'], videoId);
  queryClient.setQueriesData<PublishedVideo[]>({ queryKey: ['published-for-deal'] }, (current) => current?.filter((item) => item.id !== videoId));
}

function updateDealArray(current: CommercialDeal[] | undefined, deal: CommercialDeal): CommercialDeal[] | undefined {
  return mapItems(current, deal.id, (item) => ({ ...item, ...deal }));
}

export function updateCommercialDealCaches(queryClient: QueryClient, deal: CommercialDeal | CommercialDealDetail) {
  queryClient.setQueryData<CommercialDealDetail>(['commercial-deal', deal.id], (current) => current
    ? { ...current, ...deal }
    : deal as CommercialDealDetail);
  queryClient.setQueriesData<PaginatedCommercialDeals>({ queryKey: ['commercial-deal-page'] }, (current) => current
    ? { ...current, items: updateDealArray(current.items, deal) || [] }
    : current);
  queryClient.setQueryData<DealFocusData>(['deal-focus'], (current) => current
    ? {
      ...current,
      due_items: updateDealArray(current.due_items, deal) || [],
      unpaid_items: updateDealArray(current.unpaid_items, deal) || [],
    }
    : current);
  queryClient.setQueryData<CommercialDeal[]>(['commercial-deals-calendar'], (current) => updateDealArray(current, deal) || current);
  queryClient.setQueriesData<CommercialDeal[]>({ queryKey: ['topic-deals'] }, (current) => updateDealArray(current, deal) || current);
}

export function removeCommercialDealCaches(queryClient: QueryClient, dealId: string) {
  queryClient.removeQueries({ queryKey: ['commercial-deal', dealId] });
  removePaginatedItem(queryClient, ['commercial-deal-page'], dealId);
  queryClient.setQueryData<DealFocusData>(['deal-focus'], (current) => current
    ? {
      ...current,
      due_items: removeItems(current.due_items, dealId) || [],
      unpaid_items: removeItems(current.unpaid_items, dealId) || [],
    }
    : current);
  queryClient.setQueryData<CommercialDeal[]>(['commercial-deals-calendar'], (current) => current?.filter((deal) => deal.id !== dealId));
  queryClient.setQueriesData<CommercialDeal[]>({ queryKey: ['topic-deals'] }, (current) => current?.filter((deal) => deal.id !== dealId));
}
