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
  savePerson,
  deletePerson,
  saveRelationship,
  deleteRelationship,
  savePublishedVideo,
  deletePublishedVideo,
  saveTag,
  deleteTag,
  saveSettings,
  updateTopicTodo,
  setTopicTodoCurrent,
  completeTopicTodo,
  reopenTopicTodo,
  deleteTopicTodo,
  reorderTopicTodos,
  saveTopicTodo,
  exportBackupData,
  exportScriptsMarkdown,
} from './lib/storage';
import { isAuthenticated, logout } from './lib/auth';
import { LoginView } from './components/auth/LoginView';
import { Sidebar, NavView } from './components/layout/Sidebar';
import { Navbar } from './components/layout/Navbar';
import { MobileBottomNav, MobileDrawer } from './components/layout/MobileNav';
import { CommandPalette } from './components/layout/CommandPalette';
import { QuickCreateModal } from './components/layout/QuickCreateModal';
import { TodayView } from './components/today/TodayView';
import { TodoQuickActionDialog } from './components/topic-detail/TodoQuickActionDialog';
import { ViewErrorBoundary } from './components/ui/ViewErrorBoundary';
import { QuickDropDrawer } from './components/inbox/QuickDropDrawer';
import { fetchQuickDrops } from './lib/storage';
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
  replaceTopicTodoCaches,
  replaceTopicPinCaches,
} from './lib/queryCacheSync';
import { lazyWithReload } from './lib/lazyWithReload';
import { useToast } from './components/ui/Toast';
import { PageHeader } from './components/layout/PageHeader';
import { PwaInstallPromptBanner } from './components/ui/PwaInstall';
import { Database } from 'lucide-react';

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
  'topic-detail': '选题生产工作台',
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

type TopicField = keyof Topic;

interface PendingTopicFieldState {
  baseValue: unknown;
  pending: Array<{ sequence: number; value: unknown }>;
  latestResolved?: { sequence: number; value: unknown };
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
const PublicReviewView = lazyWithReload(() => import('./components/public/PublicReviewView').then((module) => ({ default: module.PublicReviewView })));

export function App() {
  const [isAuth, setIsAuth] = useState(isAuthenticated());
  const location = useLocation();

  // Public review page does not require auth
  if (location.pathname.startsWith('/share/')) {
    const shareMatch = matchPath('/share/:token', location.pathname);
    const token = shareMatch?.params.token || location.pathname.replace(/^\/share\/?/, '') || '';
    return (
      <Suspense fallback={<div className="min-h-dvh bg-stone-100 flex items-center justify-center text-sm text-stone-500">正在加载审稿文案...</div>}>
        <PublicReviewView token={token} />
      </Suspense>
    );
  }

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
  const topicMutationSequenceRef = useRef(0);
  const pendingTopicFieldsRef = useRef(new Map<string, Map<TopicField, PendingTopicFieldState>>());

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
  } = useWorkspace(isAuth, currentView);

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

  useEffect(() => {
    if (!isAuth) {
      document.title = '登录 - 选题生产工作台';
      return;
    }
    const activeTopic = topics.find((topic) => topic.id === activeTopicId);
    document.title = activeTopic
      ? `${activeTopic.title} - 选题生产工作台`
      : `${VIEW_TITLES[currentView]} - 选题生产工作台`;
  }, [activeTopicId, currentView, isAuth, topics]);

  // Fetch quick drops count on mount and interval
  useEffect(() => {
    if (!isAuth) return;
    let isMounted = true;
    const checkDrops = async () => {
      try {
        const items = await fetchQuickDrops();
        if (isMounted) setQuickDropCount(items.length);
      } catch {
        // ignore
      }
    };
    void checkDrops();
    const interval = setInterval(checkDrops, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
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

  useEffect(() => {
    const handleUnauthorized = () => setIsAuth(false);
    window.addEventListener('kanban:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('kanban:unauthorized', handleUnauthorized);
  }, []);

  // Global Keyboard Shortcuts: Ctrl+/ / Cmd+/ / / and N
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInput) return;

      // 1. Ctrl+/ / Cmd+/ to toggle Command Palette outside editable controls
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === '/') {
        e.preventDefault();
        e.stopPropagation();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Prevent triggering global single-key shortcuts if a modal is already open
      const hasActiveModal =
        isCommandPaletteOpen ||
        isQuickCreateOpen ||
        Boolean(document.querySelector('.shadow-modal, [role="dialog"]'));

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !hasActiveModal) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }

      // 'N' hotkey to quick create topic
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !hasActiveModal) {
        e.preventDefault();
        setQuickCreateStatus('inbox');
        setIsQuickCreateOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, isQuickCreateOpen]);

  const handleLogout = () => {
    logout();
    clearWorkspace();
    setIsAuth(false);
  };

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

  const beginTopicMutation = (topicId: string, updates: Partial<Topic>) => {
    const sequence = ++topicMutationSequenceRef.current;
    const fields = Object.keys(updates) as TopicField[];
    const currentTopic = topics.find((topic) => topic.id === topicId);
    const topicFields = pendingTopicFieldsRef.current.get(topicId) || new Map<TopicField, PendingTopicFieldState>();
    fields.forEach((field) => {
      const currentField = topicFields.get(field);
      const baseValue = currentField?.pending.length
        ? currentField.pending[currentField.pending.length - 1].value
        : currentTopic?.[field];
      const state = currentField || { baseValue, pending: [] };
      state.pending.push({ sequence, value: updates[field] });
      topicFields.set(field, state);
    });
    pendingTopicFieldsRef.current.set(topicId, topicFields);
    return sequence;
  };

  const reconcileTopicMutation = (topicId: string, updates: Partial<Topic>, serverTopic: Topic, sequence: number) => {
    const topicFields = pendingTopicFieldsRef.current.get(topicId);
    const patch: Record<string, unknown> = {};
    const fields = Object.keys(updates) as TopicField[];
    fields.forEach((field) => {
      const state = topicFields?.get(field);
      const pendingIndex = state?.pending.findIndex((entry) => entry.sequence === sequence) ?? -1;
      const serverValue = Object.prototype.hasOwnProperty.call(serverTopic, field) ? serverTopic[field] : updates[field];
      if (!state || pendingIndex < 0) {
        patch[field] = serverValue;
        return;
      }
      state.pending.splice(pendingIndex, 1);
      if (!state.latestResolved || state.latestResolved.sequence < sequence) {
        state.latestResolved = { sequence, value: serverValue };
      }
      const latestPending = state.pending[state.pending.length - 1];
      patch[field] = latestPending
        ? latestPending.value
        : state.latestResolved ? state.latestResolved.value : serverValue;
      if (state.pending.length === 0) topicFields?.delete(field);
    });
    if (topicFields?.size === 0) pendingTopicFieldsRef.current.delete(topicId);
    return patch as Partial<Topic>;
  };

  const rollbackTopicMutation = (topicId: string, updates: Partial<Topic>, sequence: number) => {
    const topicFields = pendingTopicFieldsRef.current.get(topicId);
    const patch: Record<string, unknown> = {};
    (Object.keys(updates) as TopicField[]).forEach((field) => {
      const state = topicFields?.get(field);
      const pendingIndex = state?.pending.findIndex((entry) => entry.sequence === sequence) ?? -1;
      if (!state || pendingIndex < 0) return;
      state.pending.splice(pendingIndex, 1);
      const latestPending = state.pending[state.pending.length - 1];
      patch[field] = latestPending
        ? latestPending.value
        : state.latestResolved ? state.latestResolved.value : state.baseValue;
      if (state.pending.length === 0) topicFields?.delete(field);
    });
    if (topicFields?.size === 0) pendingTopicFieldsRef.current.delete(topicId);
    return patch as Partial<Topic>;
  };

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
    await refreshTopics();
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
    await refreshTopics();
    return newTopic;
  };

  const handleTopicTodoMutation = (result: TopicTodoMutationResult) => {
    setTopics((prev) => prev.map((topic) => (topic.id === result.topic.id ? result.topic : topic)));
    replaceTopicTodoCaches(queryClient, result);
  };

  const topicTodoActions = {
    createTodo: async (topicId: string, input: { title: string }) => {
      const result = await saveTopicTodo({ topic_id: topicId, ...input });
      handleTopicTodoMutation(result);
      return result;
    },
    updateTodo: async (todoId: string, updates: Parameters<typeof updateTopicTodo>[1]) => {
      const result = await updateTopicTodo(todoId, updates);
      handleTopicTodoMutation(result);
      return result;
    },
    setCurrentTodo: async (todoId: string) => {
      const result = await setTopicTodoCurrent(todoId);
      handleTopicTodoMutation(result);
      return result;
    },
    completeTodo: async (todoId: string) => {
      const result = await completeTopicTodo(todoId);
      handleTopicTodoMutation(result);
      return result;
    },
    reopenTodo: async (todoId: string) => {
      const result = await reopenTopicTodo(todoId);
      handleTopicTodoMutation(result);
      return result;
    },
    deleteTodo: async (todoId: string) => {
      const result = await deleteTopicTodo(todoId);
      handleTopicTodoMutation(result);
      return result;
    },
    reorderTodos: async (topicId: string, ids: string[]) => {
      const result = await reorderTopicTodos(topicId, ids);
      handleTopicTodoMutation(result);
      return result;
    },
  };
  const quickActionTopic = quickActionTopicId
    ? topics.find((topic) => topic.id === quickActionTopicId) || null
    : null;

  const handleUpdateTopic = async (updates: Partial<Topic>) => {
    if (!activeTopicId) return;
    const sequence = beginTopicMutation(activeTopicId, updates);
    updateTopicCaches(queryClient, activeTopicId, updates);
    setTopics((prev) => prev.map((topic) => (topic.id === activeTopicId ? { ...topic, ...updates } : topic)));
    let updated: Topic;
    try {
      updated = await saveTopic({ id: activeTopicId, ...updates });
    } catch (error) {
      const rollback = rollbackTopicMutation(activeTopicId, updates, sequence);
      setTopics((prev) => prev.map((topic) => (topic.id === activeTopicId ? { ...topic, ...rollback } : topic)));
      updateTopicCaches(queryClient, activeTopicId, rollback);
      throw error;
    }
    const resolved = reconcileTopicMutation(activeTopicId, updates, updated, sequence);
    setTopics((prev) => prev.map((topic) => (topic.id === updated.id ? { ...topic, ...resolved } : topic)));
    updateTopicCaches(queryClient, updated.id, resolved);
    await refreshTopics();
  };

  const handleUpdateTopicById = async (topicId: string, updates: Partial<Topic>) => {
    const sequence = beginTopicMutation(topicId, updates);
    updateTopicCaches(queryClient, topicId, updates);
    setTopics((prev) => prev.map((topic) => (topic.id === topicId ? { ...topic, ...updates } : topic)));
    let updated: Topic;
    try {
      updated = await saveTopic({ id: topicId, ...updates });
    } catch (error) {
      const rollback = rollbackTopicMutation(topicId, updates, sequence);
      setTopics((prev) => prev.map((topic) => (topic.id === topicId ? { ...topic, ...rollback } : topic)));
      updateTopicCaches(queryClient, topicId, rollback);
      throw error;
    }
    const resolved = reconcileTopicMutation(topicId, updates, updated, sequence);
    setTopics((prev) => prev.map((topic) => (topic.id === updated.id ? { ...topic, ...resolved } : topic)));
    updateTopicCaches(queryClient, updated.id, resolved);
    await refreshTopics();
  };

  const handleDeleteTopic = async (topicId: string) => {
    const deleted = topics.find((topic) => topic.id === topicId);
    await deleteTopic(topicId);
    setTopics((prev) => {
      const trashedTopicItem = prev.find((topic) => topic.id === topicId);
      if (trashedTopicItem) {
        setTrashedTopics((trash) => [{ ...trashedTopicItem, deleted_at: new Date().toISOString() }, ...trash]);
      }
      return prev.filter((t) => t.id !== topicId);
    });
    removeTopicCaches(queryClient, topicId);
    await refreshTopics();
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
          await refreshTopics();
        },
      });
    }
  };

  const handleRestoreTopic = async (topicId: string) => {
    const restored = await restoreTopic(topicId);
    setTrashedTopics((prev) => prev.filter((topic) => topic.id !== topicId));
    setTopics((prev) => [restored, ...prev]);
    replaceTopicCaches(queryClient, restored);
    await refreshTopics();
  };

  const handlePermanentlyDeleteTopic = async (topicId: string) => {
    await permanentlyDeleteTopic(topicId);
    setTrashedTopics((prev) => prev.filter((topic) => topic.id !== topicId));
    await refreshTopics();
  };

  const handlePermanentlyDeleteTopicsBatch = async (ids: string[]) => {
    await permanentlyDeleteTopicsBatch(ids);
    const idSet = new Set(ids);
    setTrashedTopics((prev) => prev.filter((topic) => !idSet.has(topic.id)));
    await refreshTopics();
  };

  const handleEmptyTrash = async () => {
    await emptyTrash();
    setTrashedTopics([]);
    await refreshTopics();
  };

  const handleTogglePin = async (topicId: string) => {
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) return;
    const nextPin: 0 | 1 = topic.is_pinned === 1 ? 0 : 1;
    if (nextPin === 1 && ['published', 'icebox'].includes(topic.status)) {
      showToast({ tone: 'info', message: '只有活跃选题可以设为主推' });
      return;
    }

    const previousTopics = topics;
    const activeTopicIds = new Set(previousTopics
      .filter((item) => item.status !== 'published' && item.status !== 'icebox' && !item.deleted_at)
      .map((item) => item.id));
    const applyOptimisticPin = (value: 0 | 1) => {
      setTopics((current) => current.map((item) => {
        if (item.id === topic.id) return { ...item, is_pinned: value };
        return value === 1 && activeTopicIds.has(item.id) ? { ...item, is_pinned: 0 } : item;
      }));
      updateTopicCaches(queryClient, topic.id, { is_pinned: value });
      if (value === 1) {
        previousTopics.forEach((item) => {
          if (item.id !== topic.id && activeTopicIds.has(item.id) && item.is_pinned === 1) {
            updateTopicCaches(queryClient, item.id, { is_pinned: 0 });
          }
        });
      }
    };

    applyOptimisticPin(nextPin);
    try {
      const result: TopicPinMutationResult = await setTopicPinned(topic.id, nextPin);
      setTopics((current) => current.map((item) => {
        if (item.id === result.topic.id) return { ...item, ...result.topic };
        return result.cleared_topic_ids.includes(item.id) ? { ...item, is_pinned: 0 } : item;
      }));
      replaceTopicPinCaches(queryClient, result);
      await refreshTopics();
    } catch (error) {
      setTopics(previousTopics);
      previousTopics.forEach((item) => replaceTopicCaches(queryClient, item));
      showToast({ tone: 'error', message: error instanceof Error ? error.message : '主推设置失败，请稍后重试' });
    }
  };

  const handleUpdateTopicStatus = async (
    topicId: string,
    status: TopicStatus,
    sortOrder?: number
  ) => {
    const previousTopics = topics;
    const topicUpdate: Partial<Topic> = {
      status,
      ...(typeof sortOrder === 'number' ? { sort_order: sortOrder } : {}),
    };
    updateTopicCaches(queryClient, topicId, topicUpdate);
    setTopics((prev) =>
      prev.map((t) => (t.id === topicId ? { ...t, status, sort_order: sortOrder ?? t.sort_order, updated_at: new Date().toISOString() } : t))
    );
    try {
      await updateTopicStatus(topicId, status, sortOrder);
    } catch (err) {
      setTopics(previousTopics);
      const previous = previousTopics.find((topic) => topic.id === topicId);
      if (previous) replaceTopicCaches(queryClient, previous);
      throw err;
    }
    await refreshTopics();
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
      await reorderTopics(updates);
    } catch (err) {
      setTopics(previousTopics);
      previousTopics.forEach((topic) => replaceTopicCaches(queryClient, topic));
      throw err;
    }
    await refreshTopics();
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
    await queryClient.invalidateQueries({ queryKey: ['people'] });
    await queryClient.invalidateQueries({ queryKey: ['people-options'] });
    await queryClient.invalidateQueries({ queryKey: ['people-page'] });
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });
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
    await queryClient.invalidateQueries({ queryKey: ['people'] });
    await queryClient.invalidateQueries({ queryKey: ['people-options'] });
    await queryClient.invalidateQueries({ queryKey: ['people-page'] });
    await queryClient.invalidateQueries({ queryKey: ['relationships'] });
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });
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
    await queryClient.invalidateQueries({ queryKey: ['tags'] });
    await queryClient.invalidateQueries({ queryKey: ['tags-page'] });
    await queryClient.invalidateQueries({ queryKey: ['tags-options'] });
    await queryClient.invalidateQueries({ queryKey: ['tag-topics-page'] });
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });
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
    await queryClient.invalidateQueries({ queryKey: ['tags'] });
    await queryClient.invalidateQueries({ queryKey: ['tags-page'] });
    await queryClient.invalidateQueries({ queryKey: ['tags-options'] });
    await queryClient.invalidateQueries({ queryKey: ['tag-topics-page'] });
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });
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
    await queryClient.invalidateQueries({ queryKey: ['relationships'] });
    await queryClient.invalidateQueries({ queryKey: ['people-page'] });
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });
  };

  const handleDeleteRelationship = async (relId: string) => {
    await deleteRelationship(relId);
    setRelationships((prev) => prev.filter((r) => r.id !== relId));
    await queryClient.invalidateQueries({ queryKey: ['relationships'] });
    await queryClient.invalidateQueries({ queryKey: ['people-page'] });
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });
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
    await queryClient.invalidateQueries({ queryKey: ['published'] });
    await queryClient.invalidateQueries({ queryKey: ['published-page'] });
    await queryClient.invalidateQueries({ queryKey: ['published-analytics'] });
  };

  const handleDeletePublished = async (pubId: string) => {
    await deletePublishedVideo(pubId);
    setPublishedList((prev) => prev.filter((p) => p.id !== pubId));
    removePublishedCaches(queryClient, pubId);
    await queryClient.invalidateQueries({ queryKey: ['published'] });
    await queryClient.invalidateQueries({ queryKey: ['published-page'] });
    await queryClient.invalidateQueries({ queryKey: ['published-analytics'] });
  };

  // Handlers for Settings
  const handleSaveSettings = async (newSettings: AppSettings) => {
    const previousSettings = settings;
    setAppSettings(newSettings);
    applyTheme(newSettings.theme);
    try {
      const saved = await saveSettings(newSettings);
      setAppSettings(saved);
      applyTheme(saved.theme);
    } catch (error) {
      setAppSettings(previousSettings);
      applyTheme(previousSettings.theme);
      throw error;
    }
  };

  const handleExportBackup = async () => {
    try {
      const jsonStr = await exportBackupData();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bilibili-kanban-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      a.download = `bilibili-scripts-archive-${new Date().toISOString().slice(0, 10)}.md`;
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
    <div className="pwa-app-shell pwa-app-shell-enter flex h-dvh w-full bg-[#fafaf9] dark:bg-[#0c0a09] text-stone-900 dark:text-stone-100 overflow-hidden font-sans transition-colors">
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      {/* Desktop Sidebar (Hidden on mobile) */}
      <Sidebar
        currentView={currentView}
        onNavigate={navigateToView}
        onOpenQuickCreate={openInboxQuickCreate}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onLogout={handleLogout}
        topicCount={topicCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-dvh overflow-hidden min-w-0">
        {/* Top Navbar */}
        <Navbar
          currentView={currentView}
          onOpenQuickCreate={openInboxQuickCreate}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          onOpenQuickDrops={() => setIsQuickDropDrawerOpen(true)}
          quickDropCount={quickDropCount}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
        <PwaInstallPromptBanner />

        {/* View Router */}
        <main id="main-content" tabIndex={-1} className="view-transition-page-content flex min-h-0 flex-1 flex-col overflow-hidden min-w-0">
          {loadError && (
            <div className="m-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span>加载工作台失败：{loadError}</span>
              <button type="button" onClick={() => void loadAllData()} className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-red-50">
                重新加载
              </button>
            </div>
          )}
          {isLoadingData && topics.length === 0 ? (
            <div className="flex-1 grid place-items-center text-sm text-stone-500">正在加载工作区...</div>
          ) : (
          <ViewErrorBoundary key={location.pathname}>
          <Suspense fallback={<div className="flex-1 grid place-items-center text-sm text-stone-500">正在加载工作区...</div>}>
          {currentView === 'today' && (
            <TodayView
              topics={topics}
              todoActions={topicTodoActions}
              dealFocus={dealFocus}
              staleActionDays={settings.stale_action_days || 5}
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
              staleActionDays={settings.stale_action_days || 5}
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
              onDeleteTag={handleDeleteTag}
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
            <div className="flex-1 grid place-items-center text-sm text-stone-500">
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
            <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 mobile-bottom-nav-content sm:px-6">
              <PageHeader title="选题库" icon={Database} className="shrink-0" />
              <div className="min-h-0 flex-1">
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
          onOpenTodoList={() => {
            setQuickActionTopicId(null);
            handleOpenDetail(quickActionTopic.id, 'todos');
          }}
          actions={topicTodoActions}
        />
      )}

      {/* Global Command Palette (Hotkey Ctrl+/ / Cmd+/ / /) */}
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
        onFilterStatus={(_status) => {
          navigate('/kanban');
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
