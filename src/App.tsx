import React, { Suspense, useState, useEffect, useCallback } from 'react';
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

const VIEW_PATHS: Record<Exclude<NavView, 'topic-detail'>, string> = {
  today: '/today',
  kanban: '/kanban',
  people: '/people',
  tags: '/tags',
  published: '/published',
  database: '/database',
  settings: '/settings',
};

function getViewFromPath(pathname: string): NavView {
  if (matchPath('/topics/:topicId', pathname)) return 'topic-detail';
  const found = Object.entries(VIEW_PATHS).find(([, path]) => path === pathname);
  return (found?.[0] as NavView | undefined) || 'today';
}

const KanbanBoard = lazyWithReload(() => import('./components/kanban/KanbanBoard').then((module) => ({ default: module.KanbanBoard })));
const TopicDetailView = lazyWithReload(() => import('./components/topic-detail/TopicDetailView').then((module) => ({ default: module.TopicDetailView })));
const PeopleView = lazyWithReload(() => import('./components/people/PeopleView').then((module) => ({ default: module.PeopleView })));
const TagsView = lazyWithReload(() => import('./components/tags/TagsView').then((module) => ({ default: module.TagsView })));
const PublishedView = lazyWithReload(() => import('./components/published/PublishedView').then((module) => ({ default: module.PublishedView })));
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
      <Suspense fallback={<div className="min-h-screen bg-stone-100 flex items-center justify-center text-sm text-stone-500">正在加载审稿文案...</div>}>
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
  const currentView = getViewFromPath(location.pathname);
  const topicMatch = matchPath('/topics/:topicId', location.pathname);
  const activeTopicId = topicMatch?.params.topicId || null;

  const {
    topics,
    trashedTopics,
    people,
    relationships,
    publishedList,
    tags,
    settings,
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
  } = useWorkspace(isAuth);

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

  // Global Keyboard Shortcuts: Ctrl+P / Cmd+P / / and N
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Universal Ctrl+P / Cmd+P to toggle Command Palette (works everywhere, including inputs & Zen mode)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Don't trigger single-key shortcuts if typing inside input / textarea / contenteditable
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInput) return;

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

  const navigateToView = (view: NavView) => {
    if (view === 'topic-detail') return;
    navigate(VIEW_PATHS[view]);
  };

  // Handlers for Topics
  const handleOpenDetail = (topicId: string) => {
    navigate(`/topics/${encodeURIComponent(topicId)}`, {
      state: { from: currentView === 'topic-detail' ? '/kanban' : location.pathname },
    });
  };

  const handleBackFromDetail = () => {
    const from = (location.state as { from?: unknown } | null)?.from;
    navigate(typeof from === 'string' && from.startsWith('/') ? from : '/kanban');
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
      priority: topicData.priority || 'medium',
      status: topicData.status || 'inbox',
      tags: resolvedTags,
    });
    setTopics((prev) => [newTopic, ...prev]);
  };

  const handleUpdateTopic = async (updates: Partial<Topic>) => {
    if (!activeTopicId) return;
    const updated = await saveTopic({ id: activeTopicId, ...updates });
    setTopics((prev) => prev.map((topic) => (topic.id === updated.id ? { ...topic, ...updated } : topic)));
  };

  const handleUpdateTopicById = async (topicId: string, updates: Partial<Topic>) => {
    const updated = await saveTopic({ id: topicId, ...updates });
    setTopics((prev) => prev.map((topic) => (topic.id === updated.id ? { ...topic, ...updated } : topic)));
  };

  const handleDeleteTopic = async (topicId: string) => {
    await deleteTopic(topicId);
    setTopics((prev) => {
      const deleted = prev.find((topic) => topic.id === topicId);
      if (deleted) {
        setTrashedTopics((trash) => [{ ...deleted, deleted_at: new Date().toISOString() }, ...trash]);
      }
      return prev.filter((t) => t.id !== topicId);
    });
    if (activeTopicId === topicId) {
      navigate('/kanban');
    }
  };

  const handleRestoreTopic = async (topicId: string) => {
    const restored = await restoreTopic(topicId);
    setTrashedTopics((prev) => prev.filter((topic) => topic.id !== topicId));
    setTopics((prev) => [restored, ...prev]);
  };

  const handlePermanentlyDeleteTopic = async (topicId: string) => {
    await permanentlyDeleteTopic(topicId);
    setTrashedTopics((prev) => prev.filter((topic) => topic.id !== topicId));
  };

  const handlePermanentlyDeleteTopicsBatch = async (ids: string[]) => {
    await permanentlyDeleteTopicsBatch(ids);
    const idSet = new Set(ids);
    setTrashedTopics((prev) => prev.filter((topic) => !idSet.has(topic.id)));
  };

  const handleEmptyTrash = async () => {
    await emptyTrash();
    setTrashedTopics([]);
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
  };

  const handleUpdateTopicStatus = async (
    topicId: string,
    status: TopicStatus,
    sortOrder?: number
  ) => {
    await updateTopicStatus(topicId, status, sortOrder);
    setTopics((prev) =>
      prev.map((t) => (t.id === topicId ? { ...t, status, sort_order: sortOrder ?? t.sort_order } : t))
    );
  };

  const handleReorderTopics = async (
    updates: Array<{ id: string; status: TopicStatus; sort_order: number }>
  ) => {
    await reorderTopics(updates);
    const updateMap = new Map(updates.map((update) => [update.id, update]));
    setTopics((prev) => prev.map((topic) => {
      const update = updateMap.get(topic.id);
      return update ? { ...topic, ...update, updated_at: new Date().toISOString() } : topic;
    }));
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
  };

  const handleDeleteRelationship = async (relId: string) => {
    await deleteRelationship(relId);
    setRelationships((prev) => prev.filter((r) => r.id !== relId));
  };

  // Handlers for Published
  const handleSavePublished = async (pubData: Partial<PublishedVideo> & { title: string; topic_id?: string | null }) => {
    const saved = await savePublishedVideo(pubData);
    setPublishedList((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      if (exists) return prev.map((p) => (p.id === saved.id ? saved : p));
      return [saved, ...prev];
    });
  };

  const handleDeletePublished = async (pubId: string) => {
    await deletePublishedVideo(pubId);
    setPublishedList((prev) => prev.filter((p) => p.id !== pubId));
  };

  // Handlers for Settings
  const handleSaveSettings = async (newSettings: AppSettings) => {
    const saved = await saveSettings(newSettings);
    setAppSettings(saved);
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
      alert('导出备份失败');
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
      alert('导出文案失败');
    }
  };

  // If not authenticated, show login view
  if (!isAuth) {
    return <LoginView onLoginSuccess={() => setIsAuth(true)} />;
  }

  const topicCount = topics.length;
  const activeTopic = topics.find((t) => t.id === activeTopicId);

  return (
    <div className="flex h-screen w-screen bg-[#fafaf9] dark:bg-[#0c0a09] text-stone-900 dark:text-stone-100 overflow-hidden font-sans select-none transition-colors">
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
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
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
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
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
              onOpenDetail={handleOpenDetail}
              onOpenQuickCreate={openInboxQuickCreate}
              onTogglePin={handleTogglePin}
              onUpdateTopic={handleUpdateTopicById}
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
              publishedList={publishedList}
              topics={topics}
              onSavePublished={handleSavePublished}
              onDeletePublished={handleDeletePublished}
              onSelectTopic={handleOpenDetail}
            />
          )}

          {currentView === 'database' && (
            <div className="flex-1 w-full h-full flex flex-col px-4 sm:px-6 py-4 min-h-0 overflow-hidden">
              <TopicTableView
                topics={topics}
                onOpenDetail={handleOpenDetail}
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

      {/* Global Command Palette (Hotkey Ctrl+P / Cmd+P / /) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        topics={topics}
        people={people}
        tags={tags}
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
