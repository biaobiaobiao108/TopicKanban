import { useCallback, type SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppSettings,
  BootstrapData,
  DealFocusData,
  Person,
  PersonRelationship,
  PublishedVideo,
  Tag,
  Topic,
} from '../types';
import { fetchActiveTopicCount, fetchBootstrap, fetchCommercialDealFocus, fetchPeople, fetchRelationships, fetchTags, fetchTagsPage, fetchPublishedVideos, fetchTrashedTopics, fetchTodayFocus, fetchSettings, invalidateBootstrap, clearRemoteStorageMemoryCaches } from '../lib/storage';
import { refreshTopicData, type RefreshTopicDataOptions } from '../lib/topicQueryCache';

export function useWorkspace(enabled: boolean, view: string = 'today') {
  const queryClient = useQueryClient();
  const workspaceEnabled = enabled && !['today', 'people', 'tags', 'kanban', 'published', 'database', 'settings'].includes(view);
  const todayEnabled = enabled && view === 'today';
  const dealFocusEnabled = enabled && view === 'today';
  const peopleEnabled = enabled && ['kanban', 'topic-detail'].includes(view);
  const relationshipsEnabled = enabled && ['people', 'topic-detail'].includes(view);
  const tagsEnabled = enabled && ['kanban', 'topic-detail'].includes(view);
  const tagOptionsEnabled = enabled && view === 'today';
  const publishedEnabled = enabled && ['calendar', 'published', 'deals'].includes(view);
  const trashEnabled = enabled && view === 'database';
  const workspaceQuery = useQuery({
    queryKey: ['workspace'],
    queryFn: () => fetchBootstrap('core'),
    enabled: workspaceEnabled,
    subscribed: workspaceEnabled,
  });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings, enabled, subscribed: enabled });
  const configuredStaleDays = Number(settingsQuery.data?.stale_action_days);
  const staleActionDays = Number.isFinite(configuredStaleDays)
    ? Math.max(1, Math.min(30, Math.trunc(configuredStaleDays)))
    : 5;
  const todayQuery = useQuery({
    queryKey: ['today-focus', staleActionDays],
    queryFn: () => fetchTodayFocus(staleActionDays),
    enabled: todayEnabled,
    subscribed: todayEnabled,
  });
  const activeTopicCountQuery = useQuery({ queryKey: ['active-topic-count'], queryFn: fetchActiveTopicCount, enabled, subscribed: enabled });
  const dealFocusQuery = useQuery<DealFocusData>({ queryKey: ['deal-focus'], queryFn: fetchCommercialDealFocus, enabled: dealFocusEnabled, subscribed: dealFocusEnabled });
  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: fetchPeople, enabled: peopleEnabled, subscribed: peopleEnabled });
  const relationshipsQuery = useQuery({ queryKey: ['relationships'], queryFn: fetchRelationships, enabled: relationshipsEnabled, subscribed: relationshipsEnabled });
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: fetchTags, enabled: tagsEnabled, subscribed: tagsEnabled });
  const tagOptionsQuery = useQuery({
    queryKey: ['tags-options'],
    queryFn: () => fetchTagsPage(1, 100).then((result) => result.items),
    enabled: tagOptionsEnabled,
    subscribed: tagOptionsEnabled,
  });
  const publishedQuery = useQuery({
    queryKey: ['published'],
    queryFn: fetchPublishedVideos,
    enabled: publishedEnabled,
    subscribed: publishedEnabled,
  });
  const trashQuery = useQuery({
    queryKey: ['topics', 'trash'],
    queryFn: fetchTrashedTopics,
    enabled: trashEnabled,
    subscribed: trashEnabled,
  });
  const workspace = workspaceQuery.data;

  const updateWorkspace = useCallback((updater: (current: BootstrapData) => BootstrapData) => {
    queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current ? updater(current) : current);
  }, [queryClient]);

  const updateEntity = useCallback(<T,>(
    key: keyof BootstrapData,
    queryKey: string[] | undefined,
    updater: SetStateAction<T[]>,
  ) => {
    if (queryKey) {
      queryClient.setQueryData<T[]>(queryKey, (current = []) => (
        typeof updater === 'function' ? updater(current) : updater
      ));
    }
    updateWorkspace((current) => {
      const values = (current[key] as T[]) || [];
      return {
        ...current,
        [key]: typeof updater === 'function' ? updater(values) : updater,
      };
    });
  }, [queryClient, updateWorkspace]);

  const setTopics = useCallback((updater: SetStateAction<Topic[]>) => {
    updateEntity('topics', undefined, updater);
  }, [updateEntity]);
  const setPeople = useCallback((updater: SetStateAction<Person[]>) => {
    updateEntity('people', ['people'], updater);
  }, [updateEntity]);
  const setRelationships = useCallback((updater: SetStateAction<PersonRelationship[]>) => {
    updateEntity('relationships', ['relationships'], updater);
  }, [updateEntity]);
  const setPublishedList = useCallback((updater: SetStateAction<PublishedVideo[]>) => {
    updateEntity('published', ['published'], updater);
  }, [updateEntity]);
  const setTags = useCallback((updater: SetStateAction<Tag[]>) => {
    updateEntity('tags', ['tags'], updater);
  }, [updateEntity]);
  const setTrashedTopics = useCallback((updater: SetStateAction<Topic[]>) => {
    queryClient.setQueryData<Topic[]>(['topics', 'trash'], (current = []) => (
      typeof updater === 'function' ? updater(current) : updater
    ));
  }, [queryClient]);

  const setSettings = useCallback((settings: AppSettings) => {
    queryClient.setQueryData<AppSettings>(['settings'], settings);
    updateWorkspace((current) => ({ ...current, settings }));
  }, [queryClient, updateWorkspace]);
  const reload = useCallback(async () => {
    invalidateBootstrap();
    const requests: Array<Promise<unknown>> = [settingsQuery.refetch(), activeTopicCountQuery.refetch()];
    if (view === 'today') requests.push(todayQuery.refetch());
    if (!['today', 'people', 'tags', 'kanban', 'published', 'database', 'settings'].includes(view)) requests.push(workspaceQuery.refetch());
    if (view === 'database') requests.push(trashQuery.refetch());
    if (['kanban', 'topic-detail'].includes(view)) requests.push(peopleQuery.refetch());
    if (['people', 'topic-detail'].includes(view)) requests.push(relationshipsQuery.refetch());
    if (['kanban', 'topic-detail'].includes(view)) requests.push(tagsQuery.refetch());
    if (view === 'today') {
      requests.push(tagOptionsQuery.refetch());
      requests.push(dealFocusQuery.refetch());
    }
    await Promise.all(requests);
  }, [view, workspaceQuery.refetch, todayQuery.refetch, activeTopicCountQuery.refetch, settingsQuery.refetch, trashQuery.refetch, peopleQuery.refetch, relationshipsQuery.refetch, tagsQuery.refetch, tagOptionsQuery.refetch, dealFocusQuery.refetch]);

  const refreshTopics = useCallback((options?: RefreshTopicDataOptions) => refreshTopicData(queryClient, options), [queryClient]);
  const clear = useCallback(() => {
    queryClient.clear();
    clearRemoteStorageMemoryCaches();
  }, [queryClient]);

  const errorValue = workspaceQuery.error || todayQuery.error || activeTopicCountQuery.error || dealFocusQuery.error || settingsQuery.error || trashQuery.error || peopleQuery.error || relationshipsQuery.error || tagsQuery.error || tagOptionsQuery.error || publishedQuery.error;
  return {
    topics: view === 'today' ? (todayQuery.data?.topics || workspace?.topics || []) : (workspace?.topics || []),
    todayAttentionTopics: todayQuery.data?.attention_topics || [],
    todayActionProgress: todayQuery.data?.action_progress,
    dealFocus: dealFocusQuery.data || { due_items: [], unpaid_items: [], total_active: 0 },
    topicCount: activeTopicCountQuery.data?.active_count ?? todayQuery.data?.total_active ?? workspace?.topics.length ?? 0,
    trashedTopics: trashQuery.data || [],
    people: peopleQuery.data || workspace?.people || [],
    relationships: relationshipsQuery.data || workspace?.relationships || [],
    publishedList: publishedQuery.data || workspace?.published || [],
    tags: tagsQuery.data || tagOptionsQuery.data || workspace?.tags || [],
    settings: settingsQuery.data || workspace?.settings || { reading_speed: 280, theme: 'light' },
    isLoading: (todayEnabled && todayQuery.isLoading)
      || (enabled && activeTopicCountQuery.isLoading)
      || (dealFocusEnabled && dealFocusQuery.isLoading)
      || (workspaceEnabled && workspaceQuery.isLoading)
      || (enabled && settingsQuery.isLoading)
      || (trashEnabled && trashQuery.isLoading)
      || (peopleEnabled && peopleQuery.isLoading)
      || (relationshipsEnabled && relationshipsQuery.isLoading)
      || (tagsEnabled && tagsQuery.isLoading)
      || (tagOptionsEnabled && tagOptionsQuery.isLoading)
      || (publishedEnabled && publishedQuery.isLoading),
    error: errorValue instanceof Error ? errorValue.message : errorValue ? '工作台数据加载失败' : null,
    reload,
    refreshTopics,
    clear,
    setTopics,
    setTrashedTopics,
    setPeople,
    setRelationships,
    setPublishedList,
    setTags,
    setSettings,
  };
}
