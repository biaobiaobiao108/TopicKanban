import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Topic,
  Person,
  PersonRelationship,
  PublishedVideo,
  Tag,
  AppSettings,
  TopicStatus,
  Priority,
  TopicPinMutationResult,
  TopicTodoMutationResult,
} from './types';
import {
  saveTopic,
  setTopicPinned,
  updateTopicStatus,
  reorderTopics,
  deleteTopic,
  restoreTopic,
  permanentlyDeleteTopic,
  permanentlyDeleteTopicsBatch,
  emptyTrash,
  TopicTrashExpiredError,
  savePerson,
  deletePerson,
  saveRelationship,
  deleteRelationship,
  savePublishedVideo,
  deletePublishedVideo,
  saveTag,
  deleteTag,
  exportBackupData,
  exportScriptsMarkdown,
} from './lib/storageApi';
import { isAuthenticated } from './lib/auth';
import { LoginView } from './components/auth/LoginView';
import { Sidebar, NavView } from './components/layout/Sidebar';
import { MobileBottomNav, MobileDrawer } from './components/layout/MobileNav';
import { CommandPalette } from './components/layout/CommandPalette';
import { QuickCreateModal } from './components/layout/QuickCreateModal';
import { TodayView } from './components/today/TodayView';
import { TodoQuickActionDialog } from './components/topic-detail/TodoQuickActionDialog';
import { ViewErrorBoundary } from './components/ui/ViewErrorBoundary';
import { QuickDropDrawer } from './components/inbox/QuickDropDrawer';
import { fetchQuickDropCount } from './lib/storageApi';
import { applyTheme } from './lib/theme';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from './hooks/useWorkspace';
import {
  removePersonCaches,
  removePublishedCaches,
  removeTagCaches,
  removeTopicCaches,
  replaceTopicCaches,
  updatePersonCaches,
  updatePublishedCaches,
  updateTagCaches,
  updateTopicCaches,
  findTopicInCaches,
  replaceTopicTodoCaches,
} from './lib/queryCacheSync';
import { lazyWithReload } from './lib/lazyWithReload';
import { useToast } from './components/ui/Toast';
import { PageHeader } from './components/layout/PageHeader';
import { PwaInstallPromptBanner } from './components/ui/PwaInstall';
import { Database } from 'lucide-react';
import { invalidateQueryGroups } from './lib/topicQueryCache';
import { getBeijingDateString } from './lib/actionDate';
import { useTopicTodoActions } from './hooks/useTopicTodoActions';
import { TopicMutationTracker } from './lib/topicMutationTracker';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useWorkspaceSession } from './hooks/useWorkspaceSession';

const VIEW_PATHS: Record<Exclude<NavView, 'topic-detail'>, string> = {
  today: '/today',
  calendar: '/calendar',
  kanban: '/kanban',
  people: '/people',
  tags: '/tags',
  published: '/published',
  deals: '/deals',
  database: '/database',
  settings: '/settings',
};

const VIEW_TITLES: Record<NavView, string> = {
  today: '今日生产聚焦',
  calendar: '选题日历',
  kanban: '选题全景看板',
  people: '人物档案库',
  tags: '标签与创作赛道',
  published: '已发布视频复盘',
  deals: '商单中心',
  database: '选题库',
  settings: '偏好与数据备份',
  'topic-detail': '喵爪看板',
};

function getViewFromPath(pathname: string): NavView {
  if (matchPath('/topics/:topicId', pathname)) return 'topic-detail';
  if (matchPath('/deals/:dealId', pathname)) return 'deals';
  const found = Object.entries(VIEW_PATHS).find(([, path]) => path === pathname);
  return (found?.[0] as NavView | undefined) || 'today';
}

function getBackLabel(path: string | undefined, fallback: string): string {
  if (!path) return fallback;
  if (path.startsWith('/calendar')) return '返回选题日历';
  if (path.startsWith('/today')) return '返回今日聚焦';
  if (path.startsWith('/topics/')) return '返回选题详情';
  if (path.startsWith('/kanban')) return '返回选题看板';
  if (path.startsWith('/published')) return '返回已发布视频';
  if (path === '/deals' || path.startsWith('/deals?')) return '返回商单中心';
  return '返回上一页';
}

const CalendarView = lazyWithReload(() => import('./components/calendar/CalendarView').then((module) => ({ default: module.CalendarView })));
const KanbanBoard = lazyWithReload(() => import('./components/kanban/KanbanBoard').then((module) => ({ default: module.KanbanBoard })));
const TopicDetailView = lazyWithReload(() => import('./components/topic-detail/TopicDetailView').then((module) => ({ default: module.TopicDetailView })));
const PeopleView = lazyWithReload(() => import('./components/people/PeopleView').then((module) => ({ default: module.PeopleView })));
const TagsView = lazyWithReload(() => import('./components/tags/TagsView').then((module) => ({ default: module.TagsView })));
const PublishedView = lazyWithReload(() => import('./components/published/PublishedView').then((module) => ({ default: module.PublishedView })));
const DealsView = lazyWithReload(() => import('./components/deals/DealsView').then((module) => ({ default: module.DealsView })));
const TopicTableView = lazyWithReload(() => import('./components/kanban/TopicTableView').then((module) => ({ default: module.TopicTableView })));
const SettingsView = lazyWithReload(() => import('./components/settings/SettingsView').then((module) => ({ default: module.SettingsView })));
export function App() {
  const [isAuth, setIsAuth] = useState(isAuthenticated());
  const location = useLocation();

  return <WorkspaceApp isAuth={isAuth} setIsAuth={setIsAuth} />;
}

interface WorkspaceAppProps {
  isAuth: boolean;
  setIsAuth: React.Dispatch<React.SetStateAction<boolean>>;
}

function WorkspaceApp({ isAuth, setIsAuth }: WorkspaceAppProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentView = getViewFromPath(location.pathname);
  const { showToast } = useToast();
  const topicMatch = matchPath('/topics/:topicId', location.pathname);
  const activeTopicId = topicMatch?.params.topicId || null;
  const dealMatch = matchPath('/deals/:dealId', location.pathname);
  const activeDealId = dealMatch?.params.dealId || null;
  const topicMutationsRef = useRef(new TopicMutationTracker());
  const topicWriteQueuesRef = useRef(new Map<string, Promise<void>>());

  const runTopicWrite = useCallback(<T,>(topicId: string, write: () => Promise<T>): Promise<T> => {
    const queues = topicWriteQueuesRef.current;
    const previous = queues.get(topicId) || Promise.resolve();
    const request = previous.catch(() => undefined).then(write);
    const queueTail = request.then(() => undefined, () => undefined);
    queues.set(topicId, queueTail);
    void queueTail.then(() => {
      if (queues.get(topicId) === queueTail) queues.delete(topicId);
    });
    return request;
  }, []);

  const runTopicWriteBatch = useCallback(<T,>(topicIds: string[], write: () => Promise<T>): Promise<T> => {
    const queues = topicWriteQueuesRef.current;
    const uniqueIds = [...new Set(topicIds)].sort();
    const previous = uniqueIds.map((topicId) => queues.get(topicId) || Promise.resolve());
    const request = Promise.all(previous.map((queue) => queue.catch(() => undefined))).then(write);
    const queueTail = request.then(() => undefined, () => undefined);
    uniqueIds.forEach((topicId) => queues.set(topicId, queueTail));
    void queueTail.then(() => {
      uniqueIds.forEach((topicId) => {
        if (queues.get(topicId) === queueTail) queues.delete(topicId);
      });
    });
    return request;
  }, []);

  const {
    topics,
    topicCount: workspaceTopicCount,
    trashedTopics,
    people,
    relationships,
    tags,
    publishedList,
    settings,
    dealFocus,
    todayAttentionTopics,
    todayActionProgress,
    isLoading: isLoadingData,
    error: loadError,
    reload: loadAllData,
    clear: clearWorkspace,
    setTopics,
    setTrashedTopics,
    setPeople,
    setRelationships,
    setPublishedList,
    setTags,
    setSettings: setAppSettings,
    refreshTopics,
  } = useWorkspace(isAuth, currentView, activeTopicId);
  const { logout: handleLogout } = useWorkspaceSession(clearWorkspace, setIsAuth);

  // Apply visual theme
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // UI state
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateStatus, setQuickCreateStatus] = useState<TopicStatus>('inbox');
  const [quickCreateInitialTitle, setQuickCreateInitialTitle] = useState('');
  const [quickCreateInitialTags, setQuickCreateInitialTags] = useState<string[]>([]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isQuickDropDrawerOpen, setIsQuickDropDrawerOpen] = useState(false);
  const [quickDropCount, setQuickDropCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickActionTopicId, setQuickActionTopicId] = useState<string | null>(null);

  useGlobalShortcuts({
    isCommandPaletteOpen,
    isQuickCreateOpen,
    setIsCommandPaletteOpen,
    setIsQuickCreateOpen,
    setQuickCreateStatus,
  });

  useEffect(() => {
    if (!isAuth) {
      document.title = '登录 - 喵爪看板';
      return;
    }
    const activeTopic = topics.find((topic) => topic.id === activeTopicId);
    document.title = activeTopic
      ? `${activeTopic.title} - 喵爪看板`
      : `${VIEW_TITLES[currentView]} - 喵爪看板`;
  }, [activeTopicId, currentView, isAuth, topics]);

  // Poll only the count; load full quick-drop records when the drawer opens.
  useEffect(() => {
    if (!isAuth) return;
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const checkDrops = async () => {
      try {
        const count = await fetchQuickDropCount();
        if (isMounted) setQuickDropCount(count);
      } catch {
        // ignore
      } finally {
        if (isMounted) timer = setTimeout(checkDrops, 60000);
      }
    };
    void checkDrops();
    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [isAuth]);
  useEffect(() => {
    const knownPath = location.pathname === '/'
      || Boolean(matchPath('/topics/:topicId', location.pathname))
      || Boolean(matchPath('/deals/:dealId', location.pathname))
      || Object.values(VIEW_PATHS).includes(location.pathname);
    if (location.pathname === '/' || !knownPath) {
      navigate('/today', { replace: true });
    }
  }, [location.pathname, navigate]);

  const safeNavigate = useCallback((to: string, options?: { state?: any; replace?: boolean; viewTransition?: boolean }) => {
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    navigate(to, { ...options, viewTransition: options?.viewTransition ?? !reducedMotion });
  }, [navigate]);

  const navigateToView = (view: NavView) => {
    if (view === 'topic-detail') return;
    safeNavigate(VIEW_PATHS[view]);
  };

  const currentLocation = `${location.pathname}${location.search}${location.hash}`;

  const beginTopicMutation = (topicId: string, updates: Partial<Topic>) => (
    topicMutationsRef.current.begin(topicId, updates,
      findTopicInCaches(queryClient, topicId) || topics.find((topic) => topic.id === topicId))
  );

  const reconcileTopicMutation = (topicId: string, updates: Partial<Topic>, serverTopic: Topic, sequence: number) => (
    topicMutationsRef.current.settle(topicId, updates, sequence, serverTopic)
  );

  const rollbackTopicMutation = (topicId: string, updates: Partial<Topic>, sequence: number) => (
    topicMutationsRef.current.settle(topicId, updates, sequence)
  );

  const handleOpenDeal = (dealId: string) => {
    safeNavigate(`/deals/${encodeURIComponent(dealId)}`, {
      state: { from: currentLocation, fromLabel: getBackLabel(currentLocation, '返回上一页') },
    });
  };

  // Handlers for Topics
  const handleOpenDetail = (topicId: string, tab?: 'todos') => {
    const from = currentView === 'topic-detail' ? '/kanban' : currentLocation;
    const detailPath = `/topics/${encodeURIComponent(topicId)}${tab ? `?tab=${tab}` : ''}`;
    safeNavigate(detailPath, {
      state: { from, fromLabel: getBackLabel(from, '返回全景看板') },
    });
  };

  const handleOpenPublished = () => {
    safeNavigate('/published', {
      state: { from: currentLocation, fromLabel: '返回选题日历' },
    });
  };

  const handleBackFromDetail = () => {
    const from = (location.state as { from?: unknown } | null)?.from;
    if (typeof from === 'string' && from.startsWith('/') && from !== currentLocation) {
      navigate(-1);
      return;
    }
    safeNavigate('/kanban');
  };

  const handleBackFromDeal = () => {
    const from = (location.state as { from?: unknown } | null)?.from;
    if (typeof from === 'string' && from.startsWith('/') && from !== currentLocation) {
      navigate(-1);
      return;
    }
    safeNavigate('/deals');
  };

  const dealFrom = (location.state as { from?: unknown } | null)?.from;
  const dealBackLabel = getBackLabel(typeof dealFrom === 'string' ? dealFrom : undefined, '返回商单中心');
  const publishedFrom = (location.state as { from?: unknown } | null)?.from;
  const hasPublishedBack = typeof publishedFrom === 'string' && publishedFrom.startsWith('/');
  const publishedBackLabel = getBackLabel(hasPublishedBack ? publishedFrom : undefined, '返回上一页');

  const handleBackFromPublished = () => {
    if (hasPublishedBack) {
      navigate(-1);
      return;
    }
    safeNavigate('/published');
  };

  const handleDraftWordCountChange = (topicId: string, wordCount: number) => {
    setTopics((prev) => prev.map((topic) => (
      topic.id === topicId ? { ...topic, draft_word_count: wordCount } : topic
    )));
    updateTopicCaches(queryClient, topicId, { draft_word_count: wordCount });
  };

  const handleTopicMetricsChange = (topicId: string, metrics: Partial<Topic>) => {
    setTopics((prev) => prev.map((topic) => (
      topic.id === topicId ? { ...topic, ...metrics } : topic
    )));
    updateTopicCaches(queryClient, topicId, metrics);
  };

  const handleSaveQuickTopic = async (topicData: {
    title: string;
    summary?: string;
    hook?: string;
    initial_todo?: { title: string };
    target_publish_date?: string;
    deadline?: string;
    priority?: Priority;
    tags?: Tag[];
    status?: TopicStatus;
  }) => {
    const resolvedTags = await Promise.all((topicData.tags || []).map(async (tag) => {
      const existing = tags.find((item) => item.id === tag.id || item.name === tag.name);
      if (existing) return existing;
      return saveTag({ name: tag.name, color: tag.color });
    }));
    if (resolvedTags.some((tag) => !tags.some((item) => item.id === tag.id))) {
      setTags((prev) => [...prev, ...resolvedTags.filter((tag) => !prev.some((item) => item.id === tag.id))]);
    }
    const newTopic = await saveTopic({
      title: topicData.title,
      summary: topicData.summary || '',
      hook: topicData.hook || '',
      initial_todo: topicData.initial_todo,
      target_publish_date: topicData.target_publish_date || null,
      deadline: topicData.deadline || null,
      priority: topicData.priority || 'medium',
      status: topicData.status || 'inbox',
      tags: resolvedTags,
    });
    setTopics((prev) => [newTopic, ...prev]);
    await refreshTopics({ includeLists: true });
  };

  const handleCreateTopicFromDeal = async (topicData: { title: string; summary: string }): Promise<Topic> => {
    const newTopic = await saveTopic({
      title: topicData.title,
      summary: topicData.summary,
      hook: '',
      initial_todo: { title: '拆解商单要求并确认选题角度' },
      priority: 'high',
      status: 'inbox',
    });
    setTopics((prev) => [newTopic, ...prev]);
    await refreshTopics({ includeLists: true });
    return newTopic;
  };

  const handleTopicTodoMutation = useCallback((result: TopicTodoMutationResult) => {
    setTopics((prev) => prev.map((topic) => (topic.id === result.topic.id ? result.topic : topic)));
    replaceTopicTodoCaches(queryClient, result);
    void refreshTopics();
  }, [queryClient, refreshTopics, setTopics]);

  const topicTodoActions = useTopicTodoActions(handleTopicTodoMutation);
  const quickActionTopic = quickActionTopicId
    ? topics.find((topic) => topic.id === quickActionTopicId)
      || findTopicInCaches(queryClient, quickActionTopicId)
      || null
    : null;

  const handleUpdateTopic = async (updates: Partial<Topic>) => {
    if (!activeTopicId) return;
    const sequence = beginTopicMutation(activeTopicId, updates);
    updateTopicCaches(queryClient, activeTopicId, updates);
    setTopics((prev) => prev.map((topic) => (topic.id === activeTopicId ? { ...topic, ...updates } : topic)));
    let updated: Topic;
    try {
      updated = await runTopicWrite(activeTopicId, () => saveTopic({ id: activeTopicId, ...updates }));
    } catch (error) {
      const rollback = rollbackTopicMutation(activeTopicId, updates, sequence);
      setTopics((prev) => prev.map((topic) => (topic.id === activeTopicId ? { ...topic, ...rollback } : topic)));
      updateTopicCaches(queryClient, activeTopicId, rollback);
      throw error;
    }
    const resolved = reconcileTopicMutation(activeTopicId, updates, updated, sequence);
    setTopics((prev) => prev.map((topic) => (topic.id === updated.id ? { ...topic, ...resolved } : topic)));
    updateTopicCaches(queryClient, updated.id, resolved);
    await refreshTopics({ includeLists: true, includeTopicDetails: false });
  };

  const handleUpdateTopicById = async (topicId: string, updates: Partial<Topic>) => {
    const sequence = beginTopicMutation(topicId, updates);
    updateTopicCaches(queryClient, topicId, updates);
    setTopics((prev) => prev.map((topic) => (topic.id === topicId ? { ...topic, ...updates } : topic)));
    let updated: Topic;
    try {
      updated = await runTopicWrite(topicId, () => saveTopic({ id: topicId, ...updates }));
    } catch (error) {
      const rollback = rollbackTopicMutation(topicId, updates, sequence);
      setTopics((prev) => prev.map((topic) => (topic.id === topicId ? { ...topic, ...rollback } : topic)));
      updateTopicCaches(queryClient, topicId, rollback);
      throw error;
    }
    const resolved = reconcileTopicMutation(topicId, updates, updated, sequence);
    setTopics((prev) => prev.map((topic) => (topic.id === updated.id ? { ...topic, ...resolved } : topic)));
    updateTopicCaches(queryClient, updated.id, resolved);
    await refreshTopics({ includeLists: true, includeTopicDetails: false });
  };

  const handleDeleteTopic = async (topicId: string) => {
    const deleted = topics.find((topic) => topic.id === topicId)
      || findTopicInCaches(queryClient, topicId);
    await deleteTopic(topicId);
    setTopics((prev) => {
      const trashedTopicItem = prev.find((topic) => topic.id === topicId);
      const trashedTopic = trashedTopicItem || deleted;
      if (trashedTopic) {
        setTrashedTopics((trash) => [{ ...trashedTopic, deleted_at: new Date().toISOString() }, ...trash]);
      }
      return prev.filter((t) => t.id !== topicId);
    });
    removeTopicCaches(queryClient, topicId);
    await refreshTopics({ includeLists: true });
    if (activeTopicId === topicId) {
      navigate('/kanban');
    }
    if (deleted) {
      showToast({
        message: `已将「${deleted.title}」移入回收站`,
        actionLabel: '撤销',
        duration: 7000,
        onAction: async () => {
          const restored = await restoreTopic(topicId);
          setTrashedTopics((prev) => prev.filter((topic) => topic.id !== topicId));
          setTopics((prev) => [restored, ...prev]);
          replaceTopicCaches(queryClient, restored);
          await refreshTopics({ includeLists: true });
        },
      });
    }
  };

  const handleRestoreTopic = async (topicId: string) => {
    try {
      const restored = await restoreTopic(topicId);
      setTrashedTopics((prev) => prev.filter((topic) => topic.id !== topicId));
      setTopics((prev) => [restored, ...prev]);
      replaceTopicCaches(queryClient, restored);
      await refreshTopics({ includeLists: true });
    } catch (error) {
      if (!(error instanceof TopicTrashExpiredError)) throw error;
      // The server no longer deletes expired topics on restore, so the row is
      // still there and must stay visible; only the recovery is refused.
      await refreshTopics({ includeLists: true });
      showToast({ message: error.message, tone: 'info', duration: 7000 });
    }
  };

  const handlePermanentlyDeleteTopic = async (topicId: string) => {
    await permanentlyDeleteTopic(topicId);
    setTrashedTopics((prev) => prev.filter((topic) => topic.id !== topicId));
    removeTopicCaches(queryClient, topicId);
    await refreshTopics({ includeLists: true });
  };

  const handlePermanentlyDeleteTopicsBatch = async (ids: string[]) => {
    await permanentlyDeleteTopicsBatch(ids);
    const idSet = new Set(ids);
    setTrashedTopics((prev) => prev.filter((topic) => !idSet.has(topic.id)));
    ids.forEach((topicId) => removeTopicCaches(queryClient, topicId));
    await refreshTopics({ includeLists: true });
  };

  const handleEmptyTrash = async () => {
    const deletedIds = await emptyTrash();
    setTrashedTopics([]);
    deletedIds.forEach((topicId) => removeTopicCaches(queryClient, topicId));
    await refreshTopics({ includeLists: true });
  };

  const handleTogglePin = async (topicId: string) => {
    const topic = topics.find((t) => t.id === topicId)
      || findTopicInCaches(queryClient, topicId);
    if (!topic) return;
    const nextPin: 0 | 1 = topic.is_pinned === 1 ? 0 : 1;
    if (nextPin === 1 && ['published', 'icebox'].includes(topic.status)) {
      showToast({ tone: 'info', message: '只有活跃选题可以设为主推' });
      return;
    }

    // Pinning is exclusive across every cached active topic, including pages
    // outside the workspace. Track only pin fields; unrelated edits stay intact.
    const cachedTopics = new Map(topics.map((item) => [item.id, item]));
    for (const query of queryClient.getQueryCache().getAll()) {
      const key = query.queryKey[0];
      if (!['topic', 'workspace', 'today-focus', 'kanban-column-page', 'topics-page', 'tag-topics-page', 'command-topic-search'].includes(String(key))) continue;
      const data = query.state.data as { topics?: Topic[]; attention_topics?: Topic[]; items?: Topic[] } | undefined;
      const items = key === 'topic' ? [query.state.data as Topic | undefined]
        : [...(data?.topics || []), ...(data?.attention_topics || []), ...(data?.items || [])];
      items.forEach((item) => { if (item) cachedTopics.set(item.id, item); });
    }
    cachedTopics.set(topic.id, topic);
    const mutations = [...cachedTopics.values()]
      .filter((item) => item.id === topic.id || (nextPin === 1 && !item.deleted_at && !['published', 'icebox'].includes(item.status)))
      .map((item) => {
        const updates: Partial<Topic> = { is_pinned: item.id === topic.id ? nextPin : 0 };
        return { id: item.id, updates, sequence: beginTopicMutation(item.id, updates) };
      });
    const applyPatch = (id: string, patch: Partial<Topic>) => {
      setTopics((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
      updateTopicCaches(queryClient, id, patch);
    };
    mutations.forEach((mutation) => applyPatch(mutation.id, mutation.updates));
    try {
      // Serialize exclusive pin writes and normal writes on affected topics.
      const result: TopicPinMutationResult = await runTopicWriteBatch(
        ['topic-pin-operation', ...mutations.map((mutation) => mutation.id)],
        () => setTopicPinned(topic.id, nextPin),
      );
      mutations.forEach((mutation) => {
        const serverFields = mutation.id === result.topic.id
          ? { is_pinned: result.topic.is_pinned, updated_at: result.topic.updated_at }
          : { is_pinned: 0 as const };
        const patch = topicMutationsRef.current.settle(mutation.id, mutation.updates, mutation.sequence, serverFields);
        applyPatch(mutation.id, patch);
      });
      result.cleared_topic_ids.forEach((id) => {
        if (!mutations.some((mutation) => mutation.id === id)) applyPatch(id, { is_pinned: 0 });
      });
    } catch (error) {
      mutations.forEach((mutation) => applyPatch(mutation.id,
        rollbackTopicMutation(mutation.id, mutation.updates, mutation.sequence)));
      showToast({ tone: 'error', message: error instanceof Error ? error.message : '主推设置失败，请稍后重试' });
    }
    // Revalidate after queued edits finish so a failed pin cannot refetch an
    // older title over an optimistic edit that is still waiting to be saved.
    await Promise.all([...topicWriteQueuesRef.current.values()]);
    await refreshTopics({ includeLists: true, includeTopicDetails: false });
  };

  const handleUpdateTopicStatus = async (
    topicId: string,
    status: TopicStatus,
    sortOrder?: number
  ) => {
    const previousTopics = topics;
    const previousTopic = topics.find((topic) => topic.id === topicId)
      || findTopicInCaches(queryClient, topicId);
    const topicUpdate: Partial<Topic> = {
      status,
      ...(typeof sortOrder === 'number' ? { sort_order: sortOrder } : {}),
    };
    updateTopicCaches(queryClient, topicId, topicUpdate);
    setTopics((prev) =>
      prev.map((t) => (t.id === topicId ? { ...t, status, sort_order: sortOrder ?? t.sort_order, updated_at: new Date().toISOString() } : t))
    );
    try {
      await runTopicWrite(topicId, () => updateTopicStatus(topicId, status, sortOrder));
    } catch (err) {
      setTopics(previousTopics);
      if (previousTopic) replaceTopicCaches(queryClient, previousTopic);
      showToast({ tone: 'error', message: err instanceof Error ? err.message : '阶段更新失败，请稍后重试' });
      throw err;
    }
    await refreshTopics({ includeLists: true });
  };

  const handleReorderTopics = async (
    updates: Array<{ id: string; status: TopicStatus; sort_order: number }>
  ) => {
    const previousTopics = topics;
    const updateMap = new Map(updates.map((update) => [update.id, update]));
    const nowIso = new Date().toISOString();
    setTopics((prev) => prev.map((topic) => {
      const update = updateMap.get(topic.id);
      return update ? { ...topic, ...update, updated_at: nowIso } : topic;
    }));
    updates.forEach((update) => updateTopicCaches(queryClient, update.id, update));
    try {
      await runTopicWriteBatch(updates.map((update) => update.id), () => reorderTopics(updates));
    } catch (err) {
      setTopics(previousTopics);
      previousTopics.forEach((topic) => replaceTopicCaches(queryClient, topic));
      throw err;
    }
    await refreshTopics({ includeLists: true });
  };

  const handleQuickAddInStatus = (status: TopicStatus) => {
    setQuickCreateInitialTitle('');
    setQuickCreateInitialTags([]);
    setQuickCreateStatus(status);
    setIsQuickCreateOpen(true);
  };

  const openInboxQuickCreate = () => {
    setQuickCreateInitialTitle('');
    setQuickCreateInitialTags([]);
    setQuickCreateStatus('inbox');
    setIsQuickCreateOpen(true);
  };

  // Handlers for People
  const handleSavePerson = async (personData: Partial<Person> & { name: string }): Promise<Person> => {
    const saved = await savePerson(personData);
    setPeople((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      if (exists) return prev.map((p) => (p.id === saved.id ? saved : p));
      return [saved, ...prev];
    });
    updatePersonCaches(queryClient, saved);
    await invalidateQueryGroups(queryClient, [['people'], ['people-options'], ['people-page'], ['workspace']]);
    return saved;
  };

  const handleDeletePerson = async (personId: string) => {
    await deletePerson(personId);
    setPeople((prev) => prev.filter((p) => p.id !== personId));
    setRelationships((prev) => prev.filter((relationship) => (
      relationship.person_a_id !== personId && relationship.person_b_id !== personId
    )));
    setTopics((prev) => prev.map((topic) => ({
      ...topic,
      people: topic.people?.filter((person) => person.id !== personId),
    })));
    removePersonCaches(queryClient, personId);
    await invalidateQueryGroups(queryClient, [['people'], ['people-options'], ['people-page'], ['relationships'], ['workspace']]);
  };

  // Handlers for Tags
  const handleSaveTag = async (tagName: string, color?: string, tagId?: string): Promise<Tag> => {
    const newTag = await saveTag({ id: tagId, name: tagName.trim(), color: color || 'stone' });
    setTags((prev) => {
      const exists = prev.some((t) => t.id === newTag.id);
      if (exists) return prev.map((t) => (t.id === newTag.id ? newTag : t));
      return [...prev, newTag];
    });

    // If tag was updated/renamed, sync into topics in memory
    if (tagId) {
      setTopics((prev) =>
        prev.map((t) => ({
          ...t,
          tags: t.tags?.map((tg) => (tg.id === tagId ? newTag : tg)),
        }))
      );
    }
    updateTagCaches(queryClient, newTag);
    await invalidateQueryGroups(queryClient, [['tags'], ['tags-page'], ['tags-options'], ['tag-topics-page'], ['workspace']]);
    return newTag;
  };

  const handleDeleteTag = async (tagId: string) => {
    await deleteTag(tagId);
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    setTopics((prev) =>
      prev.map((t) => ({
        ...t,
        tags: t.tags?.filter((tg) => tg.id !== tagId),
      }))
    );
    removeTagCaches(queryClient, tagId);
    await invalidateQueryGroups(queryClient, [['tags'], ['tags-page'], ['tags-options'], ['tag-topics-page'], ['workspace']]);
  };

  const handleSaveRelationship = async (relData: Partial<PersonRelationship> & {
    person_a_id: string;
    person_b_id: string;
    relationship: string;
  }) => {
    const saved = await saveRelationship(relData);
    setRelationships((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      if (exists) return prev.map((r) => (r.id === saved.id ? saved : r));
      return [saved, ...prev];
    });
    await invalidateQueryGroups(queryClient, [['relationships'], ['people-page'], ['workspace']]);
  };

  const handleDeleteRelationship = async (relId: string) => {
    await deleteRelationship(relId);
    setRelationships((prev) => prev.filter((r) => r.id !== relId));
    await invalidateQueryGroups(queryClient, [['relationships'], ['people-page'], ['workspace']]);
  };

  // Handlers for Published
  const handleSavePublished = async (pubData: Partial<PublishedVideo> & { title: string; topic_id?: string | null }) => {
    const saved = await savePublishedVideo(pubData);
    setPublishedList((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      if (exists) return prev.map((p) => (p.id === saved.id ? saved : p));
      return [saved, ...prev];
    });
    updatePublishedCaches(queryClient, saved);
    await invalidateQueryGroups(queryClient, [['published'], ['published-page'], ['published-analytics']]);
  };

  const handleDeletePublished = async (pubId: string) => {
    await deletePublishedVideo(pubId);
    setPublishedList((prev) => prev.filter((p) => p.id !== pubId));
    removePublishedCaches(queryClient, pubId);
    await invalidateQueryGroups(queryClient, [['published'], ['published-page'], ['published-analytics']]);
  };

  // Handlers for Settings
  const handleSaveSettings = async (newSettings: AppSettings) => {
    const previousSettings = settings;
    try {
      setAppSettings(newSettings);
      applyTheme(newSettings.theme);
    } catch (error) {
      setAppSettings(previousSettings);
      applyTheme(previousSettings.theme);
      throw error;
    }
  };

  const handleExportBackup = async () => {
    try {
      const blob = await exportBackupData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bilibili-kanban-backup-${getBeijingDateString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast({ message: '导出备份失败', tone: 'error' });
    }
  };

  const handleExportMarkdown = async () => {
    try {
      const mdContent = await exportScriptsMarkdown();
      const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bilibili-scripts-archive-${getBeijingDateString()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast({ message: '导出文案失败', tone: 'error' });
    }
  };

  // If not authenticated, show login view
  if (!isAuth) {
    return <LoginView onLoginSuccess={() => setIsAuth(true)} />;
  }

  const topicCount = workspaceTopicCount;
  const activeTopic = topics.find((t) => t.id === activeTopicId);

  return (
    <div className="pwa-app-shell pwa-app-shell-enter flex h-dvh w-full bg-canvas text-ink overflow-hidden font-sans transition-colors">
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      {/* Desktop Sidebar (Hidden on mobile) */}
      <Sidebar
        currentView={currentView}
        onNavigate={navigateToView}
        onOpenQuickCreate={openInboxQuickCreate}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenQuickDrops={() => setIsQuickDropDrawerOpen(true)}
        onLogout={handleLogout}
        topicCount={topicCount}
        quickDropCount={quickDropCount}
        storageError={loadError || null}
        authError={!isAuth ? '登录态异常' : null}
      />

      {/* Main Content Area */}
      <div className="pwa-main-shell flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <PwaInstallPromptBanner />

        {/* View Router */}
        <main id="main-content" tabIndex={-1} className="view-transition-page-content flex min-h-0 flex-1 flex-col overflow-hidden min-w-0">
          {loadError && (
            <div className="m-4 flex items-center justify-between gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
              <span>{loadError}</span>
              <button type="button" onClick={() => void loadAllData()} className="shrink-0 rounded-lg border border-danger-line bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-danger-soft">
                重新加载
              </button>
            </div>
          )}
          {isLoadingData && topics.length === 0 ? (
            <div className="flex-1 grid place-items-center text-sm text-ink-muted">正在加载工作区...</div>
          ) : (
          <ViewErrorBoundary key={location.pathname}>
          <Suspense fallback={<div className="flex-1 grid place-items-center text-sm text-ink-muted">正在加载工作区...</div>}>
          {currentView === 'today' && (
            <TodayView
              topics={topics}
              attentionTopics={todayAttentionTopics}
              todayActionProgress={todayActionProgress}
              todoActions={topicTodoActions}
              dealFocus={dealFocus}
              onOpenDetail={handleOpenDetail}
              onOpenDeal={handleOpenDeal}
              onOpenQuickCreate={openInboxQuickCreate}
              onTogglePin={handleTogglePin}
              onUpdateTopic={handleUpdateTopicById}
            />
          )}

          {currentView === 'calendar' && (
            <CalendarView
              topics={topics}
              deals={dealFocus ? [...dealFocus.due_items, ...dealFocus.unpaid_items] : []}
              publishedList={publishedList}
              availableTags={tags}
              onOpenDetail={handleOpenDetail}
              onOpenDeal={handleOpenDeal}
              onOpenPublished={handleOpenPublished}
              onUpdateTopic={handleUpdateTopicById}
              onCreateTopic={async (data) => {
                await handleSaveQuickTopic(data);
              }}
            />
          )}

          {currentView === 'deals' && (
            <DealsView
              dealId={activeDealId}
              topics={topics}
              onBack={handleBackFromDeal}
              backLabel={dealBackLabel}
              onCreateTopicFromDeal={handleCreateTopicFromDeal}
            />
          )}

          {currentView === 'kanban' && (
            <KanbanBoard
              topics={topics}
              onOpenDetail={handleOpenDetail}
              onOpenCurrentAction={(topicId) => setQuickActionTopicId(topicId)}
              onDeleteTopic={handleDeleteTopic}
              onTogglePin={handleTogglePin}
              onUpdateTopicStatus={handleUpdateTopicStatus}
              onReorderTopics={handleReorderTopics}
              onQuickAddTopic={handleQuickAddInStatus}
              availableTags={tags}
              availablePeople={people}
              searchTerm={searchTerm}
            />
          )}

          {currentView === 'topic-detail' && activeTopic && (
            <TopicDetailView
              key={activeTopic.id}
              topic={activeTopic}
              onBack={handleBackFromDetail}
              onUpdateTopic={handleUpdateTopic}
              onDeleteTopic={handleDeleteTopic}
              allPeople={people}
              allTags={tags}
              relationships={relationships}
              readingSpeed={settings.reading_speed || 280}
              settings={settings}
              onNavigateToPeople={() => {
                navigate('/people');
              }}
              onSavePerson={handleSavePerson}
              onSaveTag={handleSaveTag}
              onDraftWordCountChange={handleDraftWordCountChange}
              onTopicMetricsChange={handleTopicMetricsChange}
              onOpenDeal={handleOpenDeal}
              onCreateTopicFromDeal={handleCreateTopicFromDeal}
              todoActions={topicTodoActions}
            />
          )}

          {currentView === 'people' && (
            <PeopleView
              people={people}
              relationships={relationships}
              topics={topics}
              onSavePerson={handleSavePerson}
              onDeletePerson={handleDeletePerson}
              onSaveRelationship={handleSaveRelationship}
              onDeleteRelationship={handleDeleteRelationship}
              onSelectTopic={handleOpenDetail}
            />
          )}

          {currentView === 'topic-detail' && !isLoadingData && !activeTopic && (
            <div className="flex-1 grid place-items-center text-sm text-ink-muted">
              选题不存在或已进入回收站
            </div>
          )}

          {currentView === 'tags' && (
            <TagsView
              tags={tags}
              topics={topics}
              onSaveTag={handleSaveTag}
              onDeleteTag={handleDeleteTag}
              onSelectTopic={handleOpenDetail}
              onQuickCreateTopicInTag={(tagName) => {
                setQuickCreateInitialTitle('');
                setQuickCreateInitialTags([tagName]);
                setQuickCreateStatus('inbox');
                setIsQuickCreateOpen(true);
              }}
            />
          )}

          {currentView === 'published' && (
            <PublishedView
              topics={topics}
              onSavePublished={handleSavePublished}
              onDeletePublished={handleDeletePublished}
              onSelectTopic={handleOpenDetail}
              onBack={hasPublishedBack ? handleBackFromPublished : undefined}
              backLabel={publishedBackLabel}
            />
          )}

          {currentView === 'database' && (
            <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl min-w-0 flex-1 flex-col gap-5 overflow-hidden px-4 sm:px-6 lg:px-8 py-5 sm:py-6 mobile-bottom-nav-content">
              <PageHeader title="选题库" icon={Database} className="shrink-0" />
              <div className="min-h-0 flex-1 flex flex-col h-full">
                <TopicTableView
                  topics={topics}
                  onOpenDetail={handleOpenDetail}
                  onOpenCurrentAction={(topicId) => setQuickActionTopicId(topicId)}
                  onTogglePin={handleTogglePin}
                  onUpdateTopicStatus={handleUpdateTopicStatus}
                  onDeleteTopic={handleDeleteTopic}
                  trashedTopics={trashedTopics}
                  onRestoreTopic={handleRestoreTopic}
                  onPermanentlyDeleteTopic={handlePermanentlyDeleteTopic}
                  onPermanentlyDeleteTopicsBatch={handlePermanentlyDeleteTopicsBatch}
                  onEmptyTrash={handleEmptyTrash}
                  readingSpeed={settings.reading_speed || 280}
                  searchTerm={searchTerm}
                />
              </div>
            </div>
          )}

          {currentView === 'settings' && (
            <SettingsView
              settings={settings}
              onSaveSettings={handleSaveSettings}
              onReloadAllData={loadAllData}
              onLogout={handleLogout}
            />
          )}
          </Suspense>
          </ViewErrorBoundary>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Visible on mobile screens) */}
      {currentView !== 'topic-detail' && <MobileBottomNav
        currentView={currentView}
        onNavigate={navigateToView}
        onOpenQuickCreate={openInboxQuickCreate}
        onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
        topicCount={topicCount}
      />}

      {/* Mobile Slide-Out Drawer */}
      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        currentView={currentView}
        onNavigate={navigateToView}
        onOpenQuickCreate={openInboxQuickCreate}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenQuickDrops={() => setIsQuickDropDrawerOpen(true)}
        onLogout={handleLogout}
        topicCount={topicCount}
        quickDropCount={quickDropCount}
      />

      {/* Global Quick Create Modal (Hotkey N) */}
      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        onSave={handleSaveQuickTopic}
        availableTags={tags}
        defaultStatus={quickCreateStatus}
        initialTitle={quickCreateInitialTitle}
        initialTagNames={quickCreateInitialTags}
      />

      {quickActionTopic && (
        <TodoQuickActionDialog
          isOpen
          topic={quickActionTopic}
          todo={quickActionTopic.current_todo}
          onClose={() => setQuickActionTopicId(null)}
          onOpenTodoBoard={() => {
            setQuickActionTopicId(null);
            handleOpenDetail(quickActionTopic.id, 'todos');
          }}
          actions={topicTodoActions}
        />
      )}

      {/* Global Command Palette (macOS Command+/ · Windows Alt+/ · /) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        topics={topics}
        people={people}
        tags={tags}
        currentTheme={settings.theme}
        onSelectTopic={handleOpenDetail}
        onSelectPerson={(_personId) => {
          navigate('/people');
        }}
        onSelectTag={(tagName) => {
          setSearchTerm(tagName);
          navigate('/kanban');
        }}
        onNavigate={navigateToView}
        onOpenQuickCreate={(initialTitle) => {
          setQuickCreateInitialTitle(initialTitle);
          setQuickCreateInitialTags([]);
          setQuickCreateStatus('inbox');
          setIsQuickCreateOpen(true);
        }}
        onOpenQuickDrops={() => setIsQuickDropDrawerOpen(true)}
        onSelectTheme={(theme) => void handleSaveSettings({ ...settings, theme })}
        onExportBackup={handleExportBackup}
        onExportMarkdown={handleExportMarkdown}
        onFilterStatus={(status) => {
          navigate(`/kanban?status=${encodeURIComponent(status)}`);
        }}
      />

      {/* Mobile / Quick Drop Drawer */}
      <QuickDropDrawer
        isOpen={isQuickDropDrawerOpen}
        onClose={() => setIsQuickDropDrawerOpen(false)}
        onDropCountChange={setQuickDropCount}
        onConvertToTopic={(item) => {
          setIsQuickDropDrawerOpen(false);
          setQuickCreateInitialTitle(item.content.slice(0, 50));
          setQuickCreateInitialTags([]);
          setQuickCreateStatus('inbox');
          setIsQuickCreateOpen(true);
        }}
      />
    </div>
  );
}
export default App;
