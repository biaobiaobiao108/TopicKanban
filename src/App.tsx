import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Topic,
  Person,
  PersonRelationship,
  PublishedVideo,
  Tag,
  AppSettings,
  TopicStatus,
  Priority
} from './types';
import {
  saveTopic,
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
import { ViewErrorBoundary } from './components/ui/ViewErrorBoundary';
import { QuickDropDrawer } from './components/inbox/QuickDropDrawer';
import { fetchQuickDrops } from './lib/storage';
import { applyTheme } from './lib/theme';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from './hooks/useWorkspace';
import { lazyWithReload } from './lib/lazyWithReload';
import { useToast } from './components/ui/Toast';
import { PageHeader } from './components/layout/PageHeader';
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

  const safeNavigate = useCallback((to: string, options?: { state?: any }) => {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        navigate(to, options);
      });
    } else {
      navigate(to, options);
    }
  }, [navigate]);

  const navigateToView = (view: NavView) => {
    if (view === 'topic-detail') return;
    safeNavigate(VIEW_PATHS[view]);
  };

  const currentLocation = `${location.pathname}${location.search}${location.hash}`;

  const handleOpenDeal = (dealId: string) => {
    safeNavigate(`/deals/${encodeURIComponent(dealId)}`, {
      state: { from: currentLocation, fromLabel: getBackLabel(currentLocation, '返回上一页') },
    });
  };

  // Handlers for Topics
  const handleOpenDetail = (topicId: string) => {
    const from = currentView === 'topic-detail' ? '/kanban' : currentLocation;
    safeNavigate(`/topics/${encodeURIComponent(topicId)}`, {
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
  const topicFrom = (location.state as { from?: unknown } | null)?.from;
  const topicBackLabel = getBackLabel(typeof topicFrom === 'string' ? topicFrom : undefined, '返回全景看板');
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
  };

  const handleTopicMetricsChange = (topicId: string, metrics: Partial<Topic>) => {
    setTopics((prev) => prev.map((topic) => (
      topic.id === topicId ? { ...topic, ...metrics } : topic
    )));
  };

  const handleSaveQuickTopic = async (topicData: {
    title: string;
    summary?: string;
    hook?: string;
    next_action?: string;
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
      next_action: topicData.next_action || '',
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
      next_action: '拆解商单要求并确认选题角度',
      priority: 'high',
      status: 'inbox',
    });
    setTopics((prev) => [newTopic, ...prev]);
    await refreshTopics();
    return newTopic;
  };

  const handleUpdateTopic = async (updates: Partial<Topic>) => {
    if (!activeTopicId) return;
    const updated = await saveTopic({ id: activeTopicId, ...updates });
    setTopics((prev) => prev.map((topic) => (topic.id === updated.id ? { ...topic, ...updated } : topic)));
    await refreshTopics();
  };

  const handleUpdateTopicById = async (topicId: string, updates: Partial<Topic>) => {
    const updated = await saveTopic({ id: topicId, ...updates });
    setTopics((prev) => prev.map((topic) => (topic.id === updated.id ? { ...topic, ...updated } : topic)));
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
          await refreshTopics();
        },
      });
    }
  };

  const handleRestoreTopic = async (topicId: string) => {
    const restored = await restoreTopic(topicId);
    setTrashedTopics((prev) => prev.filter((topic) => topic.id !== topicId));
    setTopics((prev) => [restored, ...prev]);
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
    const updated = await saveTopic({
      id: topic.id,
      is_pinned: topic.is_pinned === 1 ? 0 : 1,
    });
    setTopics((prev) => prev.map((topicItem) => (
      topicItem.id === updated.id ? { ...topicItem, ...updated } : topicItem
    )));
    await refreshTopics();
  };

  const handleUpdateTopicStatus = async (
    topicId: string,
    status: TopicStatus,
    sortOrder?: number
  ) => {
    const previousTopics = topics;
    setTopics((prev) =>
      prev.map((t) => (t.id === topicId ? { ...t, status, sort_order: sortOrder ?? t.sort_order, updated_at: new Date().toISOString() } : t))
    );
    try {
      await updateTopicStatus(topicId, status, sortOrder);
      await refreshTopics();
    } catch (err) {
      setTopics(previousTopics);
      throw err;
    }
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
    try {
      await reorderTopics(updates);
      await refreshTopics();
    } catch (err) {
      setTopics(previousTopics);
      throw err;
    }
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
    await queryClient.invalidateQueries({ queryKey: ['published'] });
    await queryClient.invalidateQueries({ queryKey: ['published-page'] });
    await queryClient.invalidateQueries({ queryKey: ['published-analytics'] });
  };

  const handleDeletePublished = async (pubId: string) => {
    await deletePublishedVideo(pubId);
    setPublishedList((prev) => prev.filter((p) => p.id !== pubId));
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
    <div className="flex h-dvh w-screen bg-[#fafaf9] dark:bg-[#0c0a09] text-stone-900 dark:text-stone-100 overflow-hidden font-sans transition-colors">
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

        {/* View Router */}
        <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col overflow-hidden min-w-0">
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
              backLabel={topicBackLabel}
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
            <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6">
              <PageHeader title="选题库" icon={Database} className="shrink-0" />
              <div className="min-h-0 flex-1">
                <TopicTableView
                  topics={topics}
                  onOpenDetail={handleOpenDetail}
                  onTogglePin={handleTogglePin}
                  onUpdateTopicStatus={handleUpdateTopicStatus}
                  onUpdateTopic={handleUpdateTopicById}
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
