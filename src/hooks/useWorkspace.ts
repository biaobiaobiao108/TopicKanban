import { useCallback, type SetStateAction } from 'react';
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
import { fetchBootstrap, fetchTrashedTopics, invalidateBootstrap } from '../lib/storage';

export function useWorkspace(enabled: boolean) {
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchBootstrap,
    enabled,
  });
  const trashQuery = useQuery({
    queryKey: ['topics', 'trash'],
    queryFn: fetchTrashedTopics,
    enabled,
  });
  const workspace = workspaceQuery.data;

  const updateWorkspace = useCallback((updater: (current: BootstrapData) => BootstrapData) => {
    queryClient.setQueryData<BootstrapData>(['workspace'], (current) => current ? updater(current) : current);
  }, [queryClient]);

  const createEntitySetter = useCallback(<T,>(key: keyof BootstrapData) => (
    updater: SetStateAction<T[]>
  ) => {
    updateWorkspace((current) => {
      const values = current[key] as T[];
      return {
        ...current,
        [key]: typeof updater === 'function' ? updater(values) : updater,
      };
    });
  }, [updateWorkspace]);

  const setTopics = createEntitySetter<Topic>('topics');
  const setPeople = createEntitySetter<Person>('people');
  const setRelationships = createEntitySetter<PersonRelationship>('relationships');
  const setPublishedList = createEntitySetter<PublishedVideo>('published');
  const setTags = createEntitySetter<Tag>('tags');
  const setTrashedTopics = useCallback((updater: SetStateAction<Topic[]>) => {
    queryClient.setQueryData<Topic[]>(['topics', 'trash'], (current = []) => (
      typeof updater === 'function' ? updater(current) : updater
    ));
  }, [queryClient]);
  const setSettings = useCallback((settings: AppSettings) => {
    updateWorkspace((current) => ({ ...current, settings }));
  }, [updateWorkspace]);
  const reload = useCallback(async () => {
    invalidateBootstrap();
    await Promise.all([workspaceQuery.refetch(), trashQuery.refetch()]);
  }, [workspaceQuery.refetch, trashQuery.refetch]);

  const errorValue = workspaceQuery.error || trashQuery.error;
  return {
    topics: workspace?.topics || [],
    trashedTopics: trashQuery.data || [],
    people: workspace?.people || [],
    relationships: workspace?.relationships || [],
    publishedList: workspace?.published || [],
    tags: workspace?.tags || [],
    settings: workspace?.settings || { reading_speed: 280, theme: 'light' },
    isLoading: workspaceQuery.isLoading || trashQuery.isLoading,
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
