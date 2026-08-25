import { useCallback, useEffect, type SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppSettings,
  BootstrapData,
  Person,
  PersonRelationship,
  PublishedVideo,
  Tag,
  Topic,
} from '../types';
import { fetchBootstrap, fetchPeople, fetchRelationships, fetchTags, fetchTagsPage, fetchPublishedVideos, fetchTrashedTopics, fetchTodayFocus, fetchSettings, invalidateBootstrap } from '../lib/storage';

export function useWorkspace(enabled: boolean, view: string = 'today') {
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery({
    queryKey: ['workspace'],
    queryFn: () => fetchBootstrap('core'),
    enabled: enabled && !['today', 'people', 'tags', 'kanban', 'published', 'database', 'settings'].includes(view),
  });
  const todayQuery = useQuery({ queryKey: ['today-focus'], queryFn: fetchTodayFocus, enabled: enabled && view === 'today' });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings, enabled });
  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: fetchPeople, enabled: enabled && ['kanban', 'topic-detail'].includes(view) });
  const relationshipsQuery = useQuery({ queryKey: ['relationships'], queryFn: fetchRelationships, enabled: enabled && ['people', 'topic-detail'].includes(view) });
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: fetchTags, enabled: enabled && ['kanban', 'topic-detail'].includes(view) });
  const tagOptionsQuery = useQuery({
    queryKey: ['tags-options'],
    queryFn: () => fetchTagsPage(1, 100).then((result) => result.items),
    enabled: enabled && view === 'today',
  });
  const publishedQuery = useQuery({ queryKey: ['published'], queryFn: fetchPublishedVideos, enabled: false });
  const trashQuery = useQuery({
    queryKey: ['topics', 'trash'],
    queryFn: fetchTrashedTopics,
    enabled: enabled && view === 'database',
  });
  const workspace = workspaceQuery.data;

  const updateWorkspace = useCallback((updater: (current: BootstrapData) => BootstrapData) => {
    queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current ? updater(current) : current);
  }, [queryClient]);

  const createEntitySetter = useCallback(<T,>(key: keyof BootstrapData, queryKey?: string[]) => (
    updater: SetStateAction<T[]>
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

  const setTopics = createEntitySetter<Topic>('topics');
  const setPeople = createEntitySetter<Person>('people', ['people']);
  const setRelationships = createEntitySetter<PersonRelationship>('relationships', ['relationships']);
  const setPublishedList = createEntitySetter<PublishedVideo>('published', ['published']);
  const setTags = createEntitySetter<Tag>('tags', ['tags']);
  const setTrashedTopics = useCallback((updater: SetStateAction<Topic[]>) => {
    queryClient.setQueryData<Topic[]>(['topics', 'trash'], (current = []) => (
      typeof updater === 'function' ? updater(current) : updater
    ));
  }, [queryClient]);

  useEffect(() => {
    if (peopleQuery.data) {
      updateWorkspace((current) => ({ ...current, people: peopleQuery.data }));
    }
    if (relationshipsQuery.data) {
      updateWorkspace((current) => ({ ...current, relationships: relationshipsQuery.data }));
    }
    if (tagsQuery.data) {
      updateWorkspace((current) => ({ ...current, tags: tagsQuery.data }));
    }
    if (publishedQuery.data) {
      updateWorkspace((current) => ({ ...current, published: publishedQuery.data }));
    }
    if (settingsQuery.data) {
      updateWorkspace((current) => ({ ...current, settings: settingsQuery.data }));
    }
  }, [peopleQuery.data, relationshipsQuery.data, tagsQuery.data, publishedQuery.data, settingsQuery.data, updateWorkspace]);
  const setSettings = useCallback((settings: AppSettings) => {
    updateWorkspace((current) => ({ ...current, settings }));
  }, [updateWorkspace]);
  const reload = useCallback(async () => {
    invalidateBootstrap();
    const requests: Array<Promise<unknown>> = [settingsQuery.refetch()];
    if (view === 'today') requests.push(todayQuery.refetch());
    if (!['today', 'people', 'tags', 'kanban', 'published', 'database', 'settings'].includes(view)) requests.push(workspaceQuery.refetch());
    if (view === 'database') requests.push(trashQuery.refetch());
    if (['kanban', 'topic-detail'].includes(view)) requests.push(peopleQuery.refetch());
    if (['people', 'topic-detail'].includes(view)) requests.push(relationshipsQuery.refetch());
    if (['kanban', 'topic-detail'].includes(view)) requests.push(tagsQuery.refetch());
    if (view === 'today') requests.push(tagOptionsQuery.refetch());
    await Promise.all(requests);
  }, [view, workspaceQuery.refetch, todayQuery.refetch, settingsQuery.refetch, trashQuery.refetch, peopleQuery.refetch, relationshipsQuery.refetch, tagsQuery.refetch, tagOptionsQuery.refetch]);

  const errorValue = workspaceQuery.error || todayQuery.error || settingsQuery.error || trashQuery.error || peopleQuery.error || relationshipsQuery.error || tagsQuery.error || tagOptionsQuery.error || publishedQuery.error;
  return {
    topics: todayQuery.data?.topics || workspace?.topics || [],
    topicCount: todayQuery.data?.total_active ?? workspace?.topics.length ?? 0,
    trashedTopics: trashQuery.data || [],
    people: peopleQuery.data || workspace?.people || [],
    relationships: relationshipsQuery.data || workspace?.relationships || [],
    publishedList: publishedQuery.data || workspace?.published || [],
    tags: tagsQuery.data || tagOptionsQuery.data || workspace?.tags || [],
    settings: settingsQuery.data || workspace?.settings || { reading_speed: 280, theme: 'light' },
    isLoading: workspaceQuery.isLoading || todayQuery.isLoading || settingsQuery.isLoading || trashQuery.isLoading || peopleQuery.isLoading || relationshipsQuery.isLoading || tagsQuery.isLoading || tagOptionsQuery.isLoading || publishedQuery.isLoading,
    error: errorValue instanceof Error ? errorValue.message : errorValue ? '工作台数据加载失败' : null,
    reload,
    clear: () => queryClient.clear(),
    setTopics,
    setTrashedTopics,
    setPeople,
    setRelationships,
    setPublishedList,
    setTags,
    setSettings,
  };
}
