import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CitationInput, Topic, Source, TimelineEvent, Person, PersonRelationship, Draft, DraftCitation, DraftRecoveryConflict, Tag, AppSettings, PublishPackageSaveInput, PublishPackageRecord } from '../../types';
import { TopicDetailHeader } from './TopicDetailHeader';
import { OverviewTab } from './OverviewTab';
import { SourcesTab } from './SourcesTab';
import { TimelineTab } from './TimelineTab';
import { PeopleTab } from './PeopleTab';
import { CommercialDealsTab } from './CommercialDealsTab';
import { NextActionDialog } from './NextActionDialog';
import { COLUMNS } from '../kanban/columns';
import {
  fetchSourcesByTopicId,
  saveSource,
  deleteSource,
  fetchTimelineByTopicId,
  saveTimelineEvent,
  deleteTimelineEvent,
  reorderTimelineEvents,
  fetchDraftByTopicId,
  fetchTopicWorkspace,
  fetchDraftCitations,
  fetchCommercialDealsByTopicId,
  saveDraft,
  cacheDraftLocally,
  saveDraftImmediately,
  savePublishPackage,
  PublishPackageConflictError,
  resolveDraftRecovery,
  saveDraftCitation,
  exportSingleTopicMarkdown,
} from '../../lib/storage';
import { Modal } from '../ui/Modal';
import { LayoutDashboard, FileSearch, Clock, Users, PenTool, FileText, Handshake, CheckCircle2, GitBranch, MoreHorizontal } from 'lucide-react';

interface TopicDetailViewProps {
  topic: Topic;
  onBack: () => void;
  onUpdateTopic: (updates: Partial<Topic>) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
  allPeople: Person[];
  allTags: Tag[];
  relationships: PersonRelationship[];
  readingSpeed: number;
  settings?: AppSettings;
  onNavigateToPeople: () => void;
  onSavePerson?: (personData: Partial<Person> & { name: string }) => Promise<Person>;
  onSaveTag?: (tagName: string, color?: string) => Promise<Tag>;
  onDeleteTag?: (tagId: string) => Promise<void>;
  onDraftWordCountChange: (topicId: string, wordCount: number) => void;
  onTopicMetricsChange: (topicId: string, metrics: Partial<Topic>) => void;
  onOpenDeal: (dealId: string) => void;
  onCreateTopicFromDeal?: (data: { title: string; summary: string }) => Promise<Topic>;
}

type DetailTab = 'overview' | 'sources' | 'timeline' | 'people' | 'deals' | 'script' | 'publish';

const PublishPackageTab = React.lazy(() =>
  import('./PublishPackageTab').then((module) => ({ default: module.PublishPackageTab }))
);

const ScriptEditorTab = React.lazy(() =>
  import('./ScriptEditorTab').then((module) => ({ default: module.ScriptEditorTab }))
);

export const TopicDetailView: React.FC<TopicDetailViewProps> = ({
  topic,
  onBack,
  onUpdateTopic,
  onDeleteTopic,
  allPeople,
  allTags,
  relationships,
  readingSpeed,
  settings,
  onNavigateToPeople,
  onSavePerson,
  onSaveTag,
  onDeleteTag,
  onDraftWordCountChange,
  onTopicMetricsChange,
  onOpenDeal,
  onCreateTopicFromDeal,
}) => {
  const queryClient = useQueryClient();
  const [pendingOutlineHtml, setPendingOutlineHtml] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: DetailTab = (rawTab && ['overview', 'sources', 'timeline', 'people', 'deals', 'script', 'publish'].includes(rawTab))
    ? (rawTab as DetailTab)
    : 'overview';
  const detailSubtabsRef = useRef<HTMLDivElement | null>(null);
  const activeSubtabRef = useRef<HTMLButtonElement | null>(null);

  const setActiveTab = (tab: DetailTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'overview') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      return next;
    }, { replace: true });
  };

  const [draftRecovery, setDraftRecovery] = useState<DraftRecoveryConflict | null>(null);
  const [isResolvingDraft, setIsResolvingDraft] = useState(false);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [isStageMenuOpen, setIsStageMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isFlushingDraft, setIsFlushingDraft] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const draftFlushRef = useRef<(() => Promise<void>) | null>(null);
  const registerDraftFlush = useCallback((flush: (() => Promise<void>) | null) => {
    draftFlushRef.current = flush;
  }, []);
  const onTopicMetricsChangeRef = useRef(onTopicMetricsChange);
  onTopicMetricsChangeRef.current = onTopicMetricsChange;

  const sourcesQuery = useQuery({
    queryKey: ['topic-sources', topic.id],
    queryFn: () => fetchSourcesByTopicId(topic.id),
    enabled: activeTab === 'sources' || activeTab === 'script',
  });
  const timelineQuery = useQuery({
    queryKey: ['topic-timeline', topic.id],
    queryFn: () => fetchTimelineByTopicId(topic.id),
    enabled: activeTab === 'timeline' || activeTab === 'script',
  });
  const draftQuery = useQuery({
    queryKey: ['topic-draft', topic.id],
    queryFn: () => fetchDraftByTopicId(topic.id),
    enabled: activeTab === 'script',
  });
  const citationsQuery = useQuery({
    queryKey: ['topic-citations', topic.id],
    queryFn: () => fetchDraftCitations(topic.id),
    enabled: activeTab === 'script',
  });
  const workspaceQuery = useQuery({
    queryKey: ['topic-workspace', topic.id],
    queryFn: () => fetchTopicWorkspace(topic.id),
    enabled: activeTab === 'publish',
  });
  const dealsQuery = useQuery({
    queryKey: ['topic-deals', topic.id],
    queryFn: () => fetchCommercialDealsByTopicId(topic.id),
    enabled: activeTab === 'deals',
  });

  const sources: Source[] = sourcesQuery.data || [];
  const timeline: TimelineEvent[] = timelineQuery.data || [];
  const citations: DraftCitation[] = citationsQuery.data || [];
  const draft: Draft | null = draftQuery.data?.draft || null;

  useEffect(() => {
    if (draftQuery.data?.conflict) {
      setDraftRecovery(draftQuery.data.conflict);
    }
  }, [draftQuery.data?.conflict]);

  const loading = (activeTab === 'sources' && sourcesQuery.isLoading)
    || (activeTab === 'timeline' && timelineQuery.isLoading)
    || (activeTab === 'deals' && dealsQuery.isLoading)
    || (activeTab === 'script' && (draftQuery.isLoading || citationsQuery.isLoading || sourcesQuery.isLoading || timelineQuery.isLoading))
    || (activeTab === 'publish' && workspaceQuery.isLoading);

  useEffect(() => {
    if (sourcesQuery.data) {
      onTopicMetricsChangeRef.current(topic.id, {
        sources_count: sourcesQuery.data.length,
        verified_sources_count: sourcesQuery.data.filter((source) => source.verification_status === 'confirmed').length,
      });
    }
  }, [sourcesQuery.data, topic.id]);

  useEffect(() => {
    if (draftQuery.data?.draft) {
      onTopicMetricsChangeRef.current(topic.id, {
        draft_word_count: draftQuery.data.draft.word_count,
      });
    }
  }, [draftQuery.data?.draft, topic.id]);

  useEffect(() => {
    const error = sourcesQuery.error || timelineQuery.error || dealsQuery.error || draftQuery.error || citationsQuery.error || workspaceQuery.error;
    if (!error) return;
    console.error(error);
    setOperationError(error instanceof Error ? `加载选题资料失败：${error.message}` : '加载选题资料失败');
  }, [sourcesQuery.error, timelineQuery.error, dealsQuery.error, draftQuery.error, citationsQuery.error, workspaceQuery.error]);

  const handleSaveSource = async (sourceData: Partial<Source> & { topic_id: string; title: string }) => {
    try {
      await saveSource(sourceData);
      const updated = await fetchSourcesByTopicId(topic.id);
      queryClient.setQueryData(['topic-sources', topic.id], updated);
      onTopicMetricsChange(topic.id, {
        sources_count: updated.length,
        verified_sources_count: updated.filter((source) => source.verification_status === 'confirmed').length,
      });
    } catch (error) {
      setOperationError(error instanceof Error ? `保存资料失败：${error.message}` : '保存资料失败');
      throw error;
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    try {
      await deleteSource(sourceId);
      const updated = await fetchSourcesByTopicId(topic.id);
      queryClient.setQueryData(['topic-sources', topic.id], updated);
      onTopicMetricsChange(topic.id, {
        sources_count: updated.length,
        verified_sources_count: updated.filter((source) => source.verification_status === 'confirmed').length,
      });
    } catch (error) {
      setOperationError(error instanceof Error ? `删除资料失败：${error.message}` : '删除资料失败');
      throw error;
    }
  };

  const handleSaveTimelineEvent = async (eventData: Partial<TimelineEvent> & { topic_id: string; title: string }) => {
    try {
      await saveTimelineEvent(eventData);
      const updated = await fetchTimelineByTopicId(topic.id);
      queryClient.setQueryData(['topic-timeline', topic.id], updated);
    } catch (error) {
      setOperationError(error instanceof Error ? `保存时间线失败：${error.message}` : '保存时间线失败');
      throw error;
    }
  };

  const handleDeleteTimelineEvent = async (eventId: string) => {
    try {
      await deleteTimelineEvent(eventId);
      const updated = await fetchTimelineByTopicId(topic.id);
      queryClient.setQueryData(['topic-timeline', topic.id], updated);
    } catch (error) {
      setOperationError(error instanceof Error ? `删除时间线失败：${error.message}` : '删除时间线失败');
      throw error;
    }
  };

  const handleReorderTimeline = async (topicId: string, events: TimelineEvent[]) => {
    try {
      queryClient.setQueryData(['topic-timeline', topic.id], events);
      await reorderTimelineEvents(events);
    } catch (error) {
      setOperationError(error instanceof Error ? `调整时间线失败：${error.message}` : '调整时间线失败');
      throw error;
    }
  };

  const handleSaveDraft = async (
    topicId: string,
    contentHtml: string,
    contentJson: string,
    wordCount: number,
    title: string
  ) => {
    try {
      const updated = await saveDraft(topicId, contentHtml, contentJson, wordCount, title);
      queryClient.setQueryData(['topic-draft', topicId], { draft: updated, conflict: null });
      onDraftWordCountChange(topicId, wordCount);
    } catch (error) {
      setOperationError(error instanceof Error ? `保存草稿失败：${error.message}` : '保存草稿失败');
      throw error;
    }
  };

  const handleSavePublishPackage = async (input: PublishPackageSaveInput): Promise<PublishPackageRecord> => {
    try {
      const saved = await savePublishPackage(topic.id, input);
      queryClient.setQueryData(['topic-workspace', topic.id], (current?: typeof workspaceQuery.data) => current
        ? { ...current, publish_package: saved }
        : current);
      return saved;
    } catch (error) {
      setOperationError(error instanceof PublishPackageConflictError ? '发布包已在其他设备更新，请刷新后重新编辑。' : error instanceof Error ? `保存发布包失败：${error.message}` : '保存发布包失败');
      throw error;
    }
  };

  const handleSaveCitation = async (input: CitationInput) => {
    try {
      const citation = await saveDraftCitation(topic.id, input);
      queryClient.setQueryData<DraftCitation[]>(['topic-citations', topic.id], (prev = []) => [citation, ...prev]);
      return citation;
    } catch (error) {
      setOperationError(error instanceof Error ? `插入引用失败：${error.message}` : '插入引用失败');
      throw error;
    }
  };

  const handleResolveDraftRecovery = async (choice: 'local' | 'remote') => {
    if (!draftRecovery) return;
    setIsResolvingDraft(true);
    setOperationError(null);
    try {
      const resolved = await resolveDraftRecovery(topic.id, draftRecovery, choice);
      queryClient.setQueryData(['topic-draft', topic.id], { draft: resolved, conflict: null });
      setDraftRecovery(null);
      onDraftWordCountChange(topic.id, resolved?.word_count || 0);
    } catch (error) {
      setOperationError(error instanceof Error ? `恢复文案失败：${error.message}` : '恢复文案失败');
    } finally {
      setIsResolvingDraft(false);
    }
  };

  const handleNavigateToTab = async (tab: DetailTab) => {
    if (tab !== 'publish') {
      setActiveTab(tab);
      return;
    }

    setOperationError(null);
    setIsFlushingDraft(true);
    try {
      if (activeTab === 'script' && draftFlushRef.current) {
        await draftFlushRef.current();
      }
      await queryClient.invalidateQueries({ queryKey: ['topic-workspace', topic.id] });
      setActiveTab('publish');
    } catch (error) {
      setOperationError(error instanceof Error ? `同步最新文案失败：${error.message}` : '同步最新文案失败，请先解决文案保存问题');
    } finally {
      setIsFlushingDraft(false);
    }
  };

  const tabs: { id: DetailTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: 'overview', label: '概览与评分', icon: LayoutDashboard },
    { id: 'sources', label: '资料与素材', icon: FileSearch, count: sources.length },
    { id: 'timeline', label: '故事时间线', icon: Clock, count: timeline.length },
    { id: 'people', label: '人物与关系', icon: Users, count: topic.people?.length || 0 },
    { id: 'deals', label: '商单', icon: Handshake, count: topic.commercial_deals_count },
    { id: 'script', label: '文案创作', icon: PenTool },
    { id: 'publish', label: '发布包', icon: FileText },
  ];

  useLayoutEffect(() => {
    const container = detailSubtabsRef.current;
    const activeButton = activeSubtabRef.current;

    if (!container || !activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const activeButtonRect = activeButton.getBoundingClientRect();
    const isOutsideViewport =
      activeButtonRect.left < containerRect.left ||
      activeButtonRect.right > containerRect.right;

    if (isOutsideViewport) {
      activeButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeTab, sources.length, timeline.length, topic.people?.length, topic.commercial_deals_count]);

  const metricTopic: Topic = {
    ...topic,
    sources_count: sources.length,
    verified_sources_count: sources.filter((source) => source.verification_status === 'confirmed').length,
    draft_word_count: draft?.word_count || topic.draft_word_count || 0,
  };

  const handleExportMarkdown = () => {
    const md = exportSingleTopicMarkdown(
      metricTopic,
      { sources, timeline, draft },
      readingSpeed
    );
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `选题档案-${topic.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConvertSourceToTimeline = async (source: Source) => {
    try {
      await saveTimelineEvent({
        topic_id: topic.id,
        title: source.title,
        description: source.content || (source.notes ? `【备注】${source.notes}` : ''),
        event_date: source.published_at || '',
        date_precision: source.published_at ? (source.published_at.length >= 10 ? 'exact' : 'year_month') : 'unknown',
        verification_status: source.verification_status,
      });
      const updated = await fetchTimelineByTopicId(topic.id);
      queryClient.setQueryData(['topic-timeline', topic.id], updated);
    } catch (err) {
      setOperationError(err instanceof Error ? `流转时间线事件失败：${err.message}` : '流转时间线事件失败');
    }
  };

  const handleInjectOutlineIntoDraft = async (outlineHtml: string) => {
    try {
      const existing = await fetchDraftByTopicId(topic.id);
      queryClient.setQueryData(['topic-draft', topic.id], existing);
      setPendingOutlineHtml(outlineHtml);
      setActiveTab('script');
    } catch (err) {
      setOperationError(err instanceof Error ? `注入文案草稿失败：${err.message}` : '注入文案草稿失败');
    }
  };

  const handleConvertStorylineToTimeline = async (steps: Array<{ title: string; desc: string }>) => {
    try {
      for (const step of steps) {
        await saveTimelineEvent({
          topic_id: topic.id,
          title: step.title,
          description: step.desc,
          date_precision: 'unknown',
          verification_status: 'confirmed',
        });
      }
      const updated = await fetchTimelineByTopicId(topic.id);
      queryClient.setQueryData(['topic-timeline', topic.id], updated);
      setActiveTab('timeline');
    } catch (err) {
      setOperationError(err instanceof Error ? `流转时间线失败：${err.message}` : '流转时间线失败');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#fafaf9] dark:bg-[#0c0a09] transition-colors">
      <Modal
        isOpen={Boolean(draftRecovery)}
        onClose={() => undefined}
        title="发现两份不同的文案"
        maxWidth="lg"
      >
        {draftRecovery && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-4">
                <div className="font-semibold text-rose-900 dark:text-rose-200">浏览器本地草稿</div>
                <div className="mt-2 text-xs text-stone-600 dark:text-stone-300">{draftRecovery.local.word_count} 字 · {new Date(draftRecovery.local.updated_at).toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/60 p-4">
                <div className="font-semibold text-stone-900 dark:text-stone-100">云端文案</div>
                <div className="mt-2 text-xs text-stone-600 dark:text-stone-300">{draftRecovery.remote ? `${draftRecovery.remote.word_count} 字 · ${new Date(draftRecovery.remote.updated_at).toLocaleString()}` : '云端尚无文案'}</div>
              </div>
            </div>
            <p className="text-sm text-stone-600 dark:text-stone-300">选择本地版本会立即覆盖当前云端文案；选择云端版本会清除这份本地待同步草稿。</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={isResolvingDraft} onClick={() => void handleResolveDraftRecovery('remote')} className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-300 disabled:opacity-50 cursor-pointer">使用云端版本</button>
              <button type="button" disabled={isResolvingDraft} onClick={() => void handleResolveDraftRecovery('local')} className="rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer">{isResolvingDraft ? '正在处理…' : '使用本地版本'}</button>
            </div>
          </div>
        )}
      </Modal>
      {/* Fixed Topic Detail Header */}
      <TopicDetailHeader
        topic={metricTopic}
        onBack={onBack}
        onUpdateTopic={onUpdateTopic}
        onDeleteTopic={onDeleteTopic}
        onExportMarkdown={handleExportMarkdown}
      />

      {/* Sub Tabs Navigation (Scrollable on mobile) */}
      <div ref={detailSubtabsRef} className="detail-subtabs-container bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-4 sm:px-8 shrink-0 overflow-x-auto no-scrollbar transition-colors">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={isActive ? activeSubtabRef : undefined}
                onClick={() => void handleNavigateToTab(tab.id)}
                disabled={isFlushingDraft}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-9 sm:min-h-10 items-center gap-1.5 border-b-2 px-2.5 sm:px-3 text-xs sm:text-[13px] font-semibold transition-all cursor-pointer touch-manipulation ${
                  isActive
                    ? 'border-rose-600 text-rose-600 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-950/20'
                    : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-300 dark:hover:border-stone-700'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isActive ? 'text-rose-600 dark:text-rose-400' : 'text-stone-400 dark:text-stone-500'}`} />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span className="text-[10px] sm:text-[11px] bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-1.5 py-0.2 rounded-full font-mono">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Container */}
      <div
        data-testid="topic-detail-scroll-container"
        className={`relative flex-1 min-h-0 ${
          activeTab === 'script'
            ? 'overflow-hidden flex flex-col'
            : 'overflow-y-auto overscroll-contain px-4 sm:px-8 pb-24 md:pb-12'
        }`}
      >
        {operationError && (
          <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 sm:mx-8">
            <span>{operationError}</span>
            <button type="button" onClick={() => setOperationError(null)} className="shrink-0 font-semibold hover:text-red-950">关闭</button>
          </div>
        )}
        {activeTab === 'overview' && (
          <div key="overview" className="view-tab-transition">
            <OverviewTab
              topic={topic}
              onUpdateTopic={onUpdateTopic}
              allPeople={allPeople}
              allTags={allTags}
              onSavePerson={onSavePerson}
              onSaveTag={onSaveTag}
              onDeleteTag={onDeleteTag}
              onNavigateToTab={(tab) => setActiveTab(tab)}
              onInjectOutlineIntoDraft={handleInjectOutlineIntoDraft}
              onConvertStorylineToTimeline={handleConvertStorylineToTimeline}
            />
          </div>
        )}

        {activeTab === 'sources' && (
          <div key="sources" className="view-tab-transition">
            <SourcesTab
              topicId={topic.id}
              sources={sources}
              onSaveSource={handleSaveSource}
              onDeleteSource={handleDeleteSource}
              onConvertToTimeline={handleConvertSourceToTimeline}
            />
          </div>
        )}

        {activeTab === 'timeline' && (
          <div key="timeline" className="view-tab-transition">
            <TimelineTab
              topicId={topic.id}
              timeline={timeline}
              onSaveEvent={handleSaveTimelineEvent}
              onDeleteEvent={handleDeleteTimelineEvent}
              onReorder={handleReorderTimeline}
            />
          </div>
        )}

        {activeTab === 'people' && (
          <div key="people" className="view-tab-transition">
            <PeopleTab
              topicPeople={topic.people || []}
              allPeople={allPeople}
              relationships={relationships}
              onToggleTopicPerson={async (person) => {
                const cur = topic.people || [];
                const exists = cur.some((p) => p.id === person.id);
                const updated = exists ? cur.filter((p) => p.id !== person.id) : [...cur, person];
                await onUpdateTopic({ people: updated });
              }}
              onSavePerson={onSavePerson}
              onNavigateToPeople={onNavigateToPeople}
            />
          </div>
        )}

        {activeTab === 'deals' && !loading && (
          <div key="deals" className="view-tab-transition">
            <CommercialDealsTab
              topic={topic}
              onOpenDeal={onOpenDeal}
              onCreateTopicFromDeal={onCreateTopicFromDeal}
            />
          </div>
        )}

        {activeTab === 'deals' && loading && (
          <div className="py-16 text-center text-sm text-stone-500">正在加载关联商单...</div>
        )}

        {activeTab === 'script' && !loading && (
          <React.Suspense fallback={<div className="py-16 text-center text-sm text-stone-500">正在加载文案编辑器...</div>}>
            <ScriptEditorTab
              topicId={topic.id}
              topicTitle={topic.title}
              topic={topic}
              timeline={timeline}
              sources={sources}
              initialDraft={draft}
              pendingOutlineHtml={pendingOutlineHtml}
              onOutlineInjected={() => setPendingOutlineHtml(null)}
              citations={citations}
              readingSpeed={readingSpeed}
              settings={settings}
              onSaveDraft={handleSaveDraft}
              onSaveCitation={handleSaveCitation}
              onRegisterDraftFlush={registerDraftFlush}
              onCacheDraftLocally={(contentHtml, contentJson, wordCount, title) => {
                const cached = cacheDraftLocally(topic.id, contentHtml, contentJson, wordCount, title);
                queryClient.setQueryData(['topic-draft', topic.id], (prev?: { draft: Draft | null; conflict: DraftRecoveryConflict | null }) => ({
                  draft: cached,
                  conflict: prev?.conflict || null,
                }));
                onDraftWordCountChange(topic.id, wordCount);
              }}
              onSaveDraftImmediately={(contentHtml, contentJson, wordCount, title) => {
                const updated = saveDraftImmediately(topic.id, contentHtml, contentJson, wordCount, title);
                queryClient.setQueryData(['topic-draft', topic.id], (prev?: { draft: Draft | null; conflict: DraftRecoveryConflict | null }) => ({
                  draft: updated,
                  conflict: prev?.conflict || null,
                }));
                onDraftWordCountChange(topic.id, wordCount);
              }}
            />
          </React.Suspense>
        )}

        {activeTab === 'publish' && !loading && workspaceQuery.data && (
          <React.Suspense fallback={<div className="py-16 text-center text-sm text-stone-500">正在生成发布包...</div>}>
            <PublishPackageTab
              topic={topic}
              workspace={workspaceQuery.data}
              readingSpeed={readingSpeed}
              onNavigateToScript={() => setActiveTab('script')}
              onSavePublishPackage={handleSavePublishPackage}
            />
          </React.Suspense>
        )}

        {activeTab === 'publish' && loading && (
          <div className="py-16 text-center text-sm text-stone-500">正在加载发布包资料...</div>
        )}

        {activeTab === 'script' && loading && (
          <div className="py-16 text-center text-sm text-stone-500">正在加载文案草稿...</div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 dark:border-stone-800 bg-white/95 dark:bg-stone-900/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden transition-colors">
        {(isStageMenuOpen || isMoreMenuOpen) && (
          <button
            type="button"
            aria-label="关闭快捷菜单"
            className="fixed inset-0 -z-10 bg-transparent"
            onClick={() => {
              setIsStageMenuOpen(false);
              setIsMoreMenuOpen(false);
            }}
          />
        )}
        {isStageMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2 shadow-modal animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 pb-1 text-[11px] font-bold text-stone-400 dark:text-stone-500">切换生产阶段</div>
            <div className="grid grid-cols-3 gap-1.5">
              {COLUMNS.map((column) => (
                <button
                  key={column.status}
                  type="button"
                  onClick={() => {
                    void onUpdateTopic({ status: column.status });
                    setIsStageMenuOpen(false);
                  }}
                  className={`min-h-11 rounded-lg border px-2 text-xs font-semibold cursor-pointer transition-colors ${
                    topic.status === column.status
                      ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                      : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                  }`}
                >
                  {column.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {isMoreMenuOpen && (
          <div className="absolute bottom-full right-2 mb-2 w-52 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2 shadow-modal animate-in fade-in zoom-in-95 duration-100">
            {tabs.filter((tab) => tab.id !== 'script').map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  void handleNavigateToTab(tab.id);
                  setIsMoreMenuOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
              >
                <tab.icon className="h-4 w-4 text-stone-400 dark:text-stone-500" /> {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => setIsActionDialogOpen(true)}
            className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-1 text-[10px] font-bold text-white cursor-pointer shadow-2xs"
          >
            <CheckCircle2 className="h-4 w-4" /> 下一步
          </button>
          <button
            type="button"
            onClick={() => {
              setIsStageMenuOpen((previous) => !previous);
              setIsMoreMenuOpen(false);
            }}
            className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
          >
            <GitBranch className="h-4 w-4" /> 改阶段
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('script')}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold cursor-pointer transition-colors ${
              activeTab === 'script'
                ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-2xs'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            <PenTool className="h-4 w-4" /> 写文案
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMoreMenuOpen((previous) => !previous);
              setIsStageMenuOpen(false);
            }}
            className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" /> 更多
          </button>
        </div>
      </div>

      <NextActionDialog
        isOpen={isActionDialogOpen}
        topic={metricTopic}
        onClose={() => setIsActionDialogOpen(false)}
        onUpdate={onUpdateTopic}
      />
    </div>
  );
};
