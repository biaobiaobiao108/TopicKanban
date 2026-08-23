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
import { fetchBootstrap, fetchPeople, fetchRelationships, fetchTags, fetchPublishedVideos, fetchTrashedTopics, invalidateBootstrap } from '../lib/storage';

export function useWorkspace(enabled: boolean, view: string = 'today') {
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery({
    queryKey: ['workspace'],
    queryFn: () => fetchBootstrap('core'),
    enabled,
  });
  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: fetchPeople, enabled: enabled && ['today', 'kanban', 'people', 'topic-detail'].includes(view) });
  const relationshipsQuery = useQuery({ queryKey: ['relationships'], queryFn: fetchRelationships, enabled: enabled && ['people', 'topic-detail'].includes(view) });
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: fetchTags, enabled: enabled && ['kanban', 'tags', 'topic-detail'].includes(view) });
  const publishedQuery = useQuery({ queryKey: ['published'], queryFn: fetchPublishedVideos, enabled: enabled && view === 'published' });
  const trashQuery = useQuery({
    queryKey: ['topics', 'trash'],
    queryFn: fetchTrashedTopics,
    enabled,
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
  }, [peopleQuery.data, relationshipsQuery.data, tagsQuery.data, publishedQuery.data, updateWorkspace]);
  const setSettings = useCallback((settings: AppSettings) => {
    updateWorkspace((current) => ({ ...current, settings }));
  }, [updateWorkspace]);
  const reload = useCallback(async () => {
    invalidateBootstrap();
    await Promise.all([
      workspaceQuery.refetch(), trashQuery.refetch(), peopleQuery.refetch(), relationshipsQuery.refetch(),
      tagsQuery.refetch(), publishedQuery.refetch(),
    ]);
  }, [workspaceQuery.refetch, trashQuery.refetch, peopleQuery.refetch, relationshipsQuery.refetch, tagsQuery.refetch, publishedQuery.refetch]);

  const errorValue = workspaceQuery.error || trashQuery.error || peopleQuery.error || relationshipsQuery.error || tagsQuery.error || publishedQuery.error;
  return {
    topics: workspace?.topics || [],
    trashedTopics: trashQuery.data || [],
    people: peopleQuery.data || workspace?.people || [],
    relationships: relationshipsQuery.data || workspace?.relationships || [],
    publishedList: publishedQuery.data || workspace?.published || [],
    tags: tagsQuery.data || workspace?.tags || [],
    settings: workspace?.settings || { reading_speed: 280, theme: 'light' },
    isLoading: workspaceQuery.isLoading || trashQuery.isLoading || peopleQuery.isLoading || relationshipsQuery.isLoading || tagsQuery.isLoading || publishedQuery.isLoading,
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
