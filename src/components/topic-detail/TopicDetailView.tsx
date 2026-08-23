import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CitationInput, Topic, Source, TimelineEvent, Person, PersonRelationship, Draft, DraftCitation, DraftRecoveryConflict, Tag, AppSettings } from '../../types';
import { TopicDetailHeader } from './TopicDetailHeader';
import { OverviewTab } from './OverviewTab';
import { SourcesTab } from './SourcesTab';
import { TimelineTab } from './TimelineTab';
import { PeopleTab } from './PeopleTab';
import { ScriptEditorTab } from './ScriptEditorTab';
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
  fetchDraftCitations,
  saveDraft,
  cacheDraftLocally,
  saveDraftImmediately,
  resolveDraftRecovery,
  saveDraftCitation,
  exportSingleTopicMarkdown,
} from '../../lib/storage';
import { Modal } from '../ui/Modal';
import { LayoutDashboard, FileSearch, Clock, Users, PenTool, CheckCircle2, GitBranch, MoreHorizontal } from 'lucide-react';

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
}

type DetailTab = 'overview' | 'sources' | 'timeline' | 'people' | 'script';

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
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [sources, setSources] = useState<Source[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [citations, setCitations] = useState<DraftCitation[]>([]);
  const [draftRecovery, setDraftRecovery] = useState<DraftRecoveryConflict | null>(null);
  const [isResolvingDraft, setIsResolvingDraft] = useState(false);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [isStageMenuOpen, setIsStageMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
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
  const loading = (activeTab === 'sources' && sourcesQuery.isLoading)
    || (activeTab === 'timeline' && timelineQuery.isLoading)
    || (activeTab === 'script' && (draftQuery.isLoading || citationsQuery.isLoading || sourcesQuery.isLoading || timelineQuery.isLoading));

  useEffect(() => {
    if (sourcesQuery.data) setSources(sourcesQuery.data);
    if (timelineQuery.data) setTimeline(timelineQuery.data);
    if (draftQuery.data) {
      setDraft(draftQuery.data.draft);
      setDraftRecovery(draftQuery.data.conflict);
    }
    if (citationsQuery.data) setCitations(citationsQuery.data);
    onTopicMetricsChangeRef.current(topic.id, {
      sources_count: sourcesQuery.data?.length ?? sources.length,
      verified_facts_count: (sourcesQuery.data || sources).filter((source) => source.type === 'fact' && source.verification_status === 'confirmed').length,
      materials_count: (sourcesQuery.data || sources).filter((source) => source.type === 'material').length,
      unverified_facts_count: (sourcesQuery.data || sources).filter((source) => source.type === 'fact' && source.verification_status === 'unverified').length,
      draft_word_count: draftQuery.data?.draft?.word_count ?? draft?.word_count ?? 0,
    });
  }, [sourcesQuery.data, timelineQuery.data, draftQuery.data, citationsQuery.data, topic.id, sources, draft]);

  useEffect(() => {
    const error = sourcesQuery.error || timelineQuery.error || draftQuery.error || citationsQuery.error;
    if (!error) return;
    console.error(error);
    setOperationError(error instanceof Error ? `加载选题资料失败：${error.message}` : '加载选题资料失败');
  }, [sourcesQuery.error, timelineQuery.error, draftQuery.error, citationsQuery.error]);

  const handleSaveSource = async (sourceData: Partial<Source> & { topic_id: string; title: string }) => {
    try {
      await saveSource(sourceData);
      const updated = await fetchSourcesByTopicId(topic.id);
      setSources(updated);
      onTopicMetricsChange(topic.id, {
        sources_count: updated.length,
        verified_facts_count: updated.filter((source) => source.type === 'fact' && source.verification_status === 'confirmed').length,
        materials_count: updated.filter((source) => source.type === 'material').length,
        unverified_facts_count: updated.filter((source) => source.type === 'fact' && source.verification_status === 'unverified').length,
      });
    } catch (error) {
      setOperationError(error instanceof Error ? `保存资料失败：${error.message}` : '保存资料失败');
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    try {
      await deleteSource(sourceId);
      const updated = await fetchSourcesByTopicId(topic.id);
      setSources(updated);
      onTopicMetricsChange(topic.id, {
        sources_count: updated.length,
        verified_facts_count: updated.filter((source) => source.type === 'fact' && source.verification_status === 'confirmed').length,
        materials_count: updated.filter((source) => source.type === 'material').length,
        unverified_facts_count: updated.filter((source) => source.type === 'fact' && source.verification_status === 'unverified').length,
      });
    } catch (error) {
      setOperationError(error instanceof Error ? `删除资料失败：${error.message}` : '删除资料失败');
    }
  };

  const handleSaveTimelineEvent = async (eventData: Partial<TimelineEvent> & { topic_id: string; title: string }) => {
    try {
      await saveTimelineEvent(eventData);
      setTimeline(await fetchTimelineByTopicId(topic.id));
    } catch (error) {
      setOperationError(error instanceof Error ? `保存时间线失败：${error.message}` : '保存时间线失败');
    }
  };

  const handleDeleteTimelineEvent = async (eventId: string) => {
    try {
      await deleteTimelineEvent(eventId);
      setTimeline(await fetchTimelineByTopicId(topic.id));
    } catch (error) {
      setOperationError(error instanceof Error ? `删除时间线失败：${error.message}` : '删除时间线失败');
    }
  };

  const handleReorderTimeline = async (topicId: string, events: TimelineEvent[]) => {
    try {
      await reorderTimelineEvents(events);
      setTimeline(events);
    } catch (error) {
      setOperationError(error instanceof Error ? `调整时间线失败：${error.message}` : '调整时间线失败');
    }
  };

  const handleSaveDraft = async (
    topicId: string,
    contentHtml: string,
    contentJson: string,
    wordCount: number
  ) => {
    try {
      const updated = await saveDraft(topicId, contentHtml, contentJson, wordCount, topic.title);
      setDraft(updated);
      onDraftWordCountChange(topicId, wordCount);
    } catch (error) {
      setOperationError(error instanceof Error ? `保存草稿失败：${error.message}` : '保存草稿失败');
      throw error;
    }
  };

  const handleSaveCitation = async (input: CitationInput) => {
    try {
      const citation = await saveDraftCitation(topic.id, input);
      setCitations((previous) => [citation, ...previous]);
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
      setDraft(resolved);
      setDraftRecovery(null);
      onDraftWordCountChange(topic.id, resolved?.word_count || 0);
    } catch (error) {
      setOperationError(error instanceof Error ? `恢复文案失败：${error.message}` : '恢复文案失败');
    } finally {
      setIsResolvingDraft(false);
    }
  };

  const tabs: { id: DetailTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: 'overview', label: '概览与评分', icon: LayoutDashboard },
    { id: 'sources', label: '资料与素材', icon: FileSearch, count: sources.length },
    { id: 'timeline', label: '故事时间线', icon: Clock, count: timeline.length },
    { id: 'people', label: '人物与关系', icon: Users, count: topic.people?.length || 0 },
    { id: 'script', label: '文案创作', icon: PenTool },
  ];
  const metricTopic: Topic = {
    ...topic,
    sources_count: sources.length,
    verified_facts_count: sources.filter((source) => source.type === 'fact' && source.verification_status === 'confirmed').length,
    materials_count: sources.filter((source) => source.type === 'material').length,
    unverified_facts_count: sources.filter((source) => source.type === 'fact' && source.verification_status === 'unverified').length,
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
      setTimeline(updated);
    } catch (err) {
      setOperationError(err instanceof Error ? `流转时间线事件失败：${err.message}` : '流转时间线事件失败');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#fafaf9] dark:bg-[#0c0a09] transition-colors">
      <Modal
        isOpen={Boolean(draftRecovery)}
        onClose={() => undefined}
        title="发现两份不同的文案"
        subtitle="为避免覆盖，请先明确选择要保留的版本"
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
      <div className="detail-subtabs-container bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-4 sm:px-8 shrink-0 overflow-x-auto no-scrollbar transition-colors">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-1.5 border-b-2 px-2.5 text-xs font-semibold transition-all cursor-pointer touch-manipulation sm:gap-2 sm:px-3.5 sm:text-sm ${
                  isActive
                    ? 'border-rose-600 text-rose-600 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-950/20'
                    : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-300 dark:hover:border-stone-700'
                }`}
              >
                <Icon className={`w-3.5 sm:w-4 h-3.5 sm:h-4 ${isActive ? 'text-rose-600 dark:text-rose-400' : 'text-stone-400 dark:text-stone-500'}`} />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span className="text-[11px] bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-1.5 py-0.2 rounded-full font-mono">
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
        className={`flex-1 ${
          activeTab === 'script'
            ? 'overflow-hidden flex flex-col'
            : 'overflow-y-auto px-4 sm:px-8 pb-24 md:pb-12'
        }`}
      >
        {operationError && (
          <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 sm:mx-8">
            <span>{operationError}</span>
            <button type="button" onClick={() => setOperationError(null)} className="shrink-0 font-semibold hover:text-red-950">关闭</button>
          </div>
        )}
        {activeTab === 'overview' && (
          <OverviewTab
            topic={topic}
            onUpdateTopic={onUpdateTopic}
            allPeople={allPeople}
            allTags={allTags}
            onSavePerson={onSavePerson}
            onSaveTag={onSaveTag}
            onDeleteTag={onDeleteTag}
          />
        )}

        {activeTab === 'sources' && (
          <SourcesTab
            topicId={topic.id}
            sources={sources}
            onSaveSource={handleSaveSource}
            onDeleteSource={handleDeleteSource}
            onConvertToTimeline={handleConvertSourceToTimeline}
          />
        )}

        {activeTab === 'timeline' && (
          <TimelineTab
            topicId={topic.id}
            timeline={timeline}
            onSaveEvent={handleSaveTimelineEvent}
            onDeleteEvent={handleDeleteTimelineEvent}
            onReorder={handleReorderTimeline}
          />
        )}

        {activeTab === 'people' && (
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
        )}

        {activeTab === 'script' && !loading && (
          <ScriptEditorTab
            topicId={topic.id}
            topicTitle={topic.title}
            topic={topic}
            timeline={timeline}
            sources={sources}
            initialDraft={draft}
            citations={citations}
            readingSpeed={readingSpeed}
            settings={settings}
            onSaveDraft={handleSaveDraft}
            onSaveCitation={handleSaveCitation}
            onCacheDraftLocally={(contentHtml, contentJson, wordCount) => {
              const cached = cacheDraftLocally(topic.id, contentHtml, contentJson, wordCount, topic.title);
              setDraft(cached);
              onDraftWordCountChange(topic.id, wordCount);
            }}
            onSaveDraftImmediately={(contentHtml, contentJson, wordCount) => {
              const updated = saveDraftImmediately(topic.id, contentHtml, contentJson, wordCount, topic.title);
              setDraft(updated);
              onDraftWordCountChange(topic.id, wordCount);
            }}
          />
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
                  setActiveTab(tab.id);
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
