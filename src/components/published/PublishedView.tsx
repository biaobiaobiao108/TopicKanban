import React, { useState, useRef, useMemo, useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { PublishedVideo, Topic } from '../../types';
import { Modal } from '../ui/Modal';
import { DateInput } from '../ui/DateInput';
import { useToast } from '../ui/Toast';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { CustomSelect } from '../ui/CustomSelect';
import { PageHeader } from '../layout/PageHeader';
import { extractBvid, fetchBilibiliVideoData, getBilibiliCoverFromCache } from '../../lib/bilibili';
import { PublishedVideoCard } from './PublishedVideoCard';
import {
  Film,
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Zap,
  X,
  BarChart2,
  Sparkles,
} from 'lucide-react';
import { fetchPublishedVideoPage, fetchPublishedVideos, fetchTopicPage } from '../../lib/storage';

const AnalyticsDashboard = React.lazy(() =>
  import('./AnalyticsDashboard').then((m) => ({ default: m.AnalyticsDashboard }))
);

interface PublishedViewProps {
  topics: Topic[];
  onSavePublished: (videoData: Partial<PublishedVideo> & { title: string; topic_id?: string | null }) => Promise<void>;
  onDeletePublished: (id: string) => Promise<void>;
  onSelectTopic: (topicId: string) => void;
}

export const PublishedView: React.FC<PublishedViewProps> = ({
  topics,
  onSavePublished,
  onDeletePublished,
  onSelectTopic,
}) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<PublishedVideo | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'analytics'>('cards');
  const [page, setPage] = useState(1);
  const [formPublished, setFormPublished] = useState<PublishedVideo[]>([]);
  const [topicOptions, setTopicOptions] = useState<Topic[]>(topics);
  const pageQuery = useQuery({
    queryKey: ['published-page', page],
    queryFn: () => fetchPublishedVideoPage(page, 30),
    placeholderData: keepPreviousData,
  });
  const pageItems = pageQuery.data?.items || [];
  const totalPublished = pageQuery.data?.total || 0;

  // Form State
  const [topicId, setTopicId] = useState('');
  const [title, setTitle] = useState('');
  const [bvid, setBvid] = useState('');
  const [url, setUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [views, setViews] = useState(0);
  const [likes, setLikes] = useState(0);
  const [coins, setCoins] = useState(0);
  const [favorites, setFavorites] = useState(0);
  const [comments, setComments] = useState(0);
  const [notes, setNotes] = useState('');
  const [modalCoverUrl, setModalCoverUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [topicSearchQuery, setTopicSearchQuery] = useState('');

  // Fetch & Sync State
  const [isFetchingBili, setIsFetchingBili] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchSuccessTip, setFetchSuccessTip] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [bulkSyncMessage, setBulkSyncMessage] = useState<string | null>(null);
  const fetchSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bulkSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (fetchSuccessTimerRef.current) clearTimeout(fetchSuccessTimerRef.current);
    if (bulkSyncTimerRef.current) clearTimeout(bulkSyncTimerRef.current);
  }, []);

  const refreshPublishedQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['published-page'] }),
      queryClient.invalidateQueries({ queryKey: ['published-analytics'] }),
    ]);
  };

  const topicMap = useMemo(() => new Map([...topics, ...topicOptions].map((t) => [t.id, t])), [topics, topicOptions]);
  const availableTopics = topicOptions.length > 0 ? topicOptions : topics;

  // Filter out topics that are already linked to other published videos
  const selectableTopics = useMemo(() => {
    const usedTopicIds = new Set(
      formPublished
        .filter((v) => (editingVideo ? v.id !== editingVideo.id : true))
        .map((v) => v.topic_id)
        .filter(Boolean)
    );
    return availableTopics.filter((t) => !usedTopicIds.has(t.id));
  }, [availableTopics, formPublished, editingVideo]);

  // Filter selectable topics by search query
  const filteredSelectableTopics = useMemo(() => {
    const q = topicSearchQuery.trim().toLowerCase();
    if (!q) return selectableTopics;
    return selectableTopics.filter((t) => {
      const titleMatch = t.title.toLowerCase().includes(q);
      const summaryMatch = (t.summary || '').toLowerCase().includes(q);
      const nextActionMatch = (t.next_action || '').toLowerCase().includes(q);
      const tagMatch = t.tags?.some((tag) => tag.name.toLowerCase().includes(q));
      return titleMatch || summaryMatch || nextActionMatch || tagMatch;
    });
  }, [selectableTopics, topicSearchQuery]);

  const openAddModal = async () => {
    setEditingVideo(null);
    setModalCoverUrl(null);
    const existingPublished = await fetchPublishedVideos();
    setFormPublished(existingPublished);
    const usedTopicIds = new Set(existingPublished.map((v) => v.topic_id).filter(Boolean));
    const topicPage = await fetchTopicPage({ scope: 'all', page: 1, page_size: 100, q: '' });
    setTopicOptions(topicPage.items);
    const available = topicPage.items.filter((t) => !usedTopicIds.has(t.id));
    const defaultTopic = available[0] || null;

    setTopicId(defaultTopic?.id || '');
    setTitle(defaultTopic?.title || '');
    setBvid('');
    setUrl('');
    setPublishedAt(new Date().toISOString().slice(0, 10));
    setViews(0);
    setLikes(0);
    setCoins(0);
    setFavorites(0);
    setComments(0);
    setNotes('');
    setFetchError(null);
    setFetchSuccessTip(null);
    setSubmitError(null);
    setTopicSearchQuery('');
    setIsModalOpen(true);
  };

  const openEditModal = async (v: PublishedVideo) => {
    const topicPage = await fetchTopicPage({ scope: 'all', page: 1, page_size: 100, q: '' });
    setTopicOptions(topicPage.items);
    setEditingVideo(v);
    setTopicId(v.topic_id || '');
    setTitle(v.title);
    setBvid(v.bvid);
    setUrl(v.url);
    setPublishedAt(v.published_at);
    setViews(v.views);
    setLikes(v.likes);
    setCoins(v.coins);
    setFavorites(v.favorites);
    setComments(v.comments);
    setNotes(v.notes);
    const cleanBvid = extractBvid(v.bvid || v.url);
    const cachedCover = cleanBvid ? getBilibiliCoverFromCache(cleanBvid) : null;
    setModalCoverUrl(cachedCover);
    setFetchError(null);
    setFetchSuccessTip(null);
    setSubmitError(null);
    setTopicSearchQuery('');
    setIsModalOpen(true);
  };

  // Auto extract and fetch Bilibili data in modal
  const handleFetchBiliData = async (overrideInput?: string) => {
    const rawInput = (overrideInput ?? (bvid || url)).trim();
    if (!rawInput) {
      setFetchError('请先输入 BV 号或视频链接（例如：BV1xx411c7xx 或完整 B 站播放页链接）');
      return;
    }

    const cleanBvid = extractBvid(rawInput);
    if (!cleanBvid) {
      setFetchError('未识别到有效的 BV 号，请检查输入格式');
      return;
    }

    setIsFetchingBili(true);
    setFetchError(null);
    setFetchSuccessTip(null);

    try {
      const meta = await fetchBilibiliVideoData(cleanBvid);
      setBvid(meta.bvid);
      setUrl(meta.url);
      if (meta.cover_url) {
        setModalCoverUrl(meta.cover_url);
      }
      if (!title.trim() || !editingVideo) {
        setTitle(meta.title);
      }
      setPublishedAt(meta.published_at);
      setViews(meta.views);
      setLikes(meta.likes);
      setCoins(meta.coins);
      setFavorites(meta.favorites);
      setComments(meta.comments);
      setFetchSuccessTip(`已成功抓取《${meta.title}》最新数据！`);
      if (fetchSuccessTimerRef.current) clearTimeout(fetchSuccessTimerRef.current);
      fetchSuccessTimerRef.current = setTimeout(() => setFetchSuccessTip(null), 3000);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : '获取 B站 数据失败，请检查网络或 BV 号');
    } finally {
      setIsFetchingBili(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const matchedTopic = topics.find((t) => t.id === topicId);
    const cleanBvid = extractBvid(bvid) || bvid.trim();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSavePublished({
        id: editingVideo?.id,
        topic_id: topicId || null,
        title: title.trim(),
        bvid: cleanBvid,
        url: url.trim() || (cleanBvid ? `https://www.bilibili.com/video/${cleanBvid}` : ''),
        published_at: publishedAt,
        views: Number(views),
        likes: Number(likes),
        coins: Number(coins),
        favorites: Number(favorites),
        comments: Number(comments),
        notes: notes.trim(),
        topic_title: matchedTopic?.title || null,
      });
      await refreshPublishedQueries();
      setIsModalOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '归档失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sync single video on card
  const handleSyncSingleVideo = async (video: PublishedVideo) => {
    const cleanBvid = extractBvid(video.bvid || video.url);
    if (!cleanBvid) {
      showToast({ message: '该视频未填写有效 BV 号，无法自动同步', tone: 'info' });
      return;
    }

    setSyncingId(video.id);
    try {
      const meta = await fetchBilibiliVideoData(cleanBvid);
      const matchedTopic = topics.find((t) => t.id === video.topic_id);
      await onSavePublished({
        ...video,
        bvid: meta.bvid,
        views: meta.views,
        likes: meta.likes,
        coins: meta.coins,
        favorites: meta.favorites,
        comments: meta.comments,
        url: meta.url || video.url,
        published_at: meta.published_at || video.published_at,
        topic_title: video.topic_title || matchedTopic?.title || '',
        updated_at: new Date().toISOString(),
      });
      await refreshPublishedQueries();
    } catch (err) {
      showToast({ message: `同步「${video.title}」失败: ${err instanceof Error ? err.message : '未知错误'}`, tone: 'error' });
    } finally {
      setSyncingId(null);
    }
  };

  // Bulk sync all videos with BV id
  const handleBulkSyncAll = async () => {
    const syncable = pageItems.filter((v) => extractBvid(v.bvid || v.url));
    if (syncable.length === 0) {
      showToast({ message: '没有找到包含有效 BV 号的已发布视频', tone: 'info' });
      return;
    }

    setIsBulkSyncing(true);
    setBulkSyncMessage(`正在同步数据 (0/${syncable.length})...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < syncable.length; i++) {
      const video = syncable[i];
      const cleanBvid = extractBvid(video.bvid || video.url)!;
      setBulkSyncMessage(`正在同步 (${i + 1}/${syncable.length}): ${video.title}...`);
      try {
        const meta = await fetchBilibiliVideoData(cleanBvid);
        const matchedTopic = topics.find((t) => t.id === video.topic_id);
        await onSavePublished({
          ...video,
          bvid: meta.bvid,
          views: meta.views,
          likes: meta.likes,
          coins: meta.coins,
          favorites: meta.favorites,
          comments: meta.comments,
          url: meta.url || video.url,
          topic_title: video.topic_title || matchedTopic?.title || '',
          updated_at: new Date().toISOString(),
        });
        successCount++;
      } catch (e) {
        failCount++;
        console.error(`Failed to sync ${video.title}`, e);
      }
      if (i < syncable.length - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }

    setIsBulkSyncing(false);
    await refreshPublishedQueries();
    setBulkSyncMessage(`同步完成：成功 ${successCount} 个${failCount > 0 ? `，失败 ${failCount} 个` : ''}`);
    if (bulkSyncTimerRef.current) clearTimeout(bulkSyncTimerRef.current);
    bulkSyncTimerRef.current = setTimeout(() => setBulkSyncMessage(null), 4000);
  };

  const formatNumber = (num: number) => {
    if (num >= 10000) {
      return `${(num / 10000).toFixed(1)}万`;
    }
    return num.toLocaleString();
  };

  const syncableCount = pageItems.filter((v) => extractBvid(v.bvid || v.url)).length;

  return (
    <div className="flex-1 w-full h-full overflow-y-auto transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <PageHeader
          title="已发布视频复盘与数据沉淀"
          icon={Film}
          actions={(
            <>
            {syncableCount > 0 && (
              <button
                type="button"
                onClick={handleBulkSyncAll}
                disabled={isBulkSyncing}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-stone-100/80 px-3.5 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-200/80 disabled:opacity-50 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 sm:text-sm"
                title="批量刷新所有包含 BV 号的视频数据"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isBulkSyncing ? 'animate-spin text-rose-600' : 'text-stone-500 dark:text-stone-400'}`} aria-hidden="true" />
                <span>{isBulkSyncing ? '同步中...' : '批量同步数据'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-rose-700 hover:shadow-xs active:scale-[0.98] sm:text-sm"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
              <span>归档已发布视频</span>
            </button>
            </>
          )}
        />

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-stone-100/80 dark:bg-stone-800/80 p-1 rounded-2xl border border-stone-200/70 dark:border-stone-700/80 w-fit shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>视频卡片流 ({totalPublished})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('analytics')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'analytics'
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>深度复盘分析</span>
          </button>
        </div>

        {/* Bulk Sync Notification */}
        {bulkSyncMessage && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 animate-in fade-in">
            {isBulkSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span>{bulkSyncMessage}</span>
          </div>
        )}

        {/* Conditional View: Analytics Dashboard vs Cards Grid */}
        {viewMode === 'analytics' ? (
          <React.Suspense
            fallback={
              <div className="flex items-center justify-center p-16 text-stone-400 dark:text-stone-500">
                <Loader2 className="w-6 h-6 animate-spin text-rose-600 dark:text-rose-400 mr-2" />
                <span className="text-sm">正在载入选题分析看板...</span>
              </div>
            }
          >
            <AnalyticsDashboard
              onSelectTopic={onSelectTopic}
            />
          </React.Suspense>
        ) : (
          /* Published Cards List */
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
            {pageItems.map((video) => {
              const matchedTopic = video.topic_id ? topicMap.get(video.topic_id) : undefined;

              return (
                <PublishedVideoCard
                  key={video.id}
                  video={video}
                  topic={matchedTopic}
                  isSyncingThis={syncingId === video.id}
                  isBulkSyncing={isBulkSyncing}
                  onSync={() => handleSyncSingleVideo(video)}
                  onEdit={() => openEditModal(video)}
                  onDelete={async () => {
                    if (window.confirm(`确定要删除发布归档「${video.title}」吗？`)) {
                      await onDeletePublished(video.id);
                      if (pageItems.length === 1 && page > 1) setPage((current) => current - 1);
                      await refreshPublishedQueries();
                    }
                  }}
                  onSelectTopic={onSelectTopic}
                  formatNumber={formatNumber}
                />
              );
            })}

            {totalPublished === 0 && (
              <div className="col-span-full p-12 text-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500">
                暂无已发布视频归档，制作完成发布后可在此沉淀播放与互动数据！
              </div>
            )}
          </div>
        )}

        {viewMode === 'cards' && totalPublished > 0 && (
          <div className="flex items-center justify-center gap-3 text-xs text-stone-500 dark:text-stone-400">
            <button
              type="button"
              disabled={page <= 1 || pageQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900"
            >上一页</button>
            <span className="font-mono">{page} / {Math.max(1, pageQuery.data?.total_pages || 1)} · 共 {totalPublished} 条</span>
            <button
              type="button"
              disabled={page >= (pageQuery.data?.total_pages || 1) || pageQuery.isFetching}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900"
            >下一页</button>
          </div>
        )}

        {/* Modal: Record / Edit Published */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingVideo ? '编辑已发布视频数据' : '归档已发布视频'}
          maxWidth="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Topic Select */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  对应选题 <span className="text-stone-400 dark:text-stone-500 font-normal">（自动过滤已关联选题）</span>
                </label>
                {selectableTopics.length > 0 && (
                  <span className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">
                    {selectableTopics.length} 个可用选题
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <CustomSelect
                  value={topicId}
                  ariaLabel="关联选题"
                  onChange={(nextTopicId) => {
                    setTopicId(nextTopicId);
                    if (nextTopicId) {
                      const selectedTopic = topicMap.get(nextTopicId);
                      if (selectedTopic && (!title.trim() || !editingVideo)) setTitle(selectedTopic.title);
                    }
                    setTopicSearchQuery('');
                  }}
                  options={[
                    { value: '', label: '不关联任何选题（独立归档视频）' },
                    ...filteredSelectableTopics.map((topic) => ({ value: topic.id, label: topic.title })),
                  ]}
                  searchable
                  searchPlaceholder="搜索选题标题、看点、赛道标签..."
                  searchValue={topicSearchQuery}
                  onSearchChange={setTopicSearchQuery}
                  placeholder="请选择关联选题"
                  className="min-w-0 flex-1"
                  buttonClassName="w-full min-h-[42px] px-3 py-2 bg-stone-50 dark:bg-stone-800 border-stone-300 dark:border-stone-700 rounded-lg text-sm pr-10"
                  renderValue={() => {
                    const selectedTopic = topicMap.get(topicId);
                    return selectedTopic ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-stone-900 dark:text-stone-100 truncate text-xs sm:text-sm">{selectedTopic.title}</span>
                        {selectedTopic.priority !== 'none' && <span className="hidden sm:inline-flex shrink-0"><PriorityBadge priority={selectedTopic.priority} showLabel={false} /></span>}
                      </div>
                    ) : (
                      <span className="text-xs sm:text-sm text-stone-400 dark:text-stone-500 italic">独立归档视频（未关联选题）</span>
                    );
                  }}
                  renderOption={(option, state) => {
                    if (!option.value) {
                      return <span className="flex items-center gap-1.5"><span className="text-stone-400 dark:text-stone-500">✕</span><span>不关联任何选题（独立归档视频）</span>{state.selected && <span className="ml-auto">✓</span>}</span>;
                    }
                    const topic = topicMap.get(option.value);
                    if (!topic) return option.label;
                    return (
                      <div className="flex items-center justify-between gap-2 w-full min-w-0">
                        <div className="min-w-0 pr-2 space-y-0.5">
                          <div className="text-xs sm:text-sm font-semibold truncate leading-tight">{topic.title}</div>
                          {(topic.summary || topic.next_action) && <div className="text-[11px] text-stone-400 dark:text-stone-500 truncate">{topic.next_action ? `下一步: ${topic.next_action}` : topic.summary}</div>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0"><StatusBadge status={topic.status} size="sm" />{state.selected && <span className="text-rose-600 dark:text-rose-400">✓</span>}</div>
                      </div>
                    );
                  }}
                  emptyState={selectableTopics.length === 0 ? (
                    <div className="py-6 text-center text-xs text-stone-400 dark:text-stone-500 space-y-1"><p className="font-semibold text-stone-600 dark:text-stone-400">所有选题均已关联视频</p><p className="text-[11px]">可选择「不关联任何选题」或前往看板新建选题</p></div>
                  ) : (
                    <div className="py-6 text-center text-xs text-stone-400 dark:text-stone-500">未找到匹配「{topicSearchQuery}」的可用选题</div>
                  )}
                />
                <button
                  type="button"
                  onClick={() => setTopicId('')}
                  aria-label="取消关联选题"
                  title="取消关联选题"
                  aria-hidden={!topicId}
                  tabIndex={topicId ? 0 : -1}
                  className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-stone-300 bg-stone-50 text-stone-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-red-800 dark:hover:bg-red-950/40 dark:hover:text-red-400 ${topicId ? '' : 'invisible pointer-events-none'}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Quick Fetch Box */}
            <div className="bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 p-3 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-stone-800 dark:text-stone-200">
                B站 BV 号 或 视频链接
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="例如：BV1xx411c7xx 或粘贴 B站播放链接"
                  value={bvid}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted) {
                      setBvid(pasted);
                      const clean = extractBvid(pasted);
                      if (clean) {
                        setUrl(`https://www.bilibili.com/video/${clean}`);
                        void handleFetchBiliData(pasted);
                      }
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBvid(val);
                    const clean = extractBvid(val);
                    if (clean) {
                      setUrl(`https://www.bilibili.com/video/${clean}`);
                      if (val.trim().length === 12 && val.trim().startsWith('BV')) {
                        void handleFetchBiliData(val.trim());
                      }
                    }
                  }}
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-rose-500 dark:focus:border-rose-500 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => void handleFetchBiliData()}
                  disabled={isFetchingBili || !bvid.trim()}
                  className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 dark:disabled:bg-rose-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 shadow-2xs cursor-pointer"
                >
                  {isFetchingBili ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>{isFetchingBili ? '抓取中...' : '一键抓取'}</span>
                </button>
              </div>

              {/* Real-time Cover Preview inside modal */}
              {modalCoverUrl && (
                <div className="relative rounded-xl overflow-hidden border border-rose-200/80 dark:border-rose-900/60 bg-stone-100 dark:bg-stone-900 aspect-video max-h-44 w-full mt-2">
                  <img
                    src={modalCoverUrl}
                    alt="视频封面预览"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[11px] font-medium backdrop-blur-xs flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>封面已就绪</span>
                  </div>
                </div>
              )}

              {fetchError && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 pt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fetchError}</span>
                </div>
              )}

              {fetchSuccessTip && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 pt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{fetchSuccessTip}</span>
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                最终视频标题 <span className="text-rose-600 dark:text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="例如：【良子】峨眉山名场面深度复盘"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
              />
            </div>

            {/* Date and URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">发布日期</label>
                <DateInput
                  name="published_at"
                  value={publishedAt}
                  onChange={setPublishedAt}
                  className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">成片链接</label>
                <input
                  type="url"
                  placeholder="https://www.bilibili.com/video/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
            </div>

            {/* Interactive stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">播放量</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={views}
                  onChange={(e) => setViews(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-mono text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">点赞数</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={likes}
                  onChange={(e) => setLikes(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-mono text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">投币数</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={coins}
                  onChange={(e) => setCoins(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-mono text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">收藏数</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={favorites}
                  onChange={(e) => setFavorites(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-mono text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">评论数</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={comments}
                  onChange={(e) => setComments(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-mono text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">复盘心得与观众反馈</label>
              <textarea
                rows={3}
                placeholder="记录本期视频哪些包袱响了、弹幕集中讨论什么、哪些地方剪辑拖沓..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none resize-none"
              />
            </div>

            {/* Actions */}
            {submitError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-800 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>归档失败：{submitError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-sm bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded-lg font-medium shadow-xs disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer transition-colors"
              >
                {isSubmitting ? '正在保存…' : editingVideo ? '更新归档' : '立即归档'}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
};
