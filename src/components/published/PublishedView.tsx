import React, { useState, useRef, useMemo, useEffect } from 'react';
import { PublishedVideo, Topic } from '../../types';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { CustomSelect } from '../ui/CustomSelect';
import { extractBvid, fetchBilibiliVideoData } from '../../lib/bilibili';
import {
  Film,
  Plus,
  ExternalLink,
  Edit2,
  Trash2,
  ThumbsUp,
  Coins,
  Bookmark,
  MessageSquare,
  Eye,
  Calendar,
  Sparkles,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Zap,
  X,
  BarChart2,
  TrendingUp,
  Award
} from 'lucide-react';
import { calculateDeepMetrics } from '../../lib/videoAnalytics';

const AnalyticsDashboard = React.lazy(() =>
  import('./AnalyticsDashboard').then((m) => ({ default: m.AnalyticsDashboard }))
);

interface PublishedViewProps {
  publishedList: PublishedVideo[];
  topics: Topic[];
  onSavePublished: (videoData: Partial<PublishedVideo> & { title: string; topic_id?: string | null }) => Promise<void>;
  onDeletePublished: (id: string) => Promise<void>;
  onSelectTopic: (topicId: string) => void;
}

export const PublishedView: React.FC<PublishedViewProps> = ({
  publishedList,
  topics,
  onSavePublished,
  onDeletePublished,
  onSelectTopic,
}) => {
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<PublishedVideo | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'analytics'>('cards');

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

  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  // Filter out topics that are already linked to other published videos
  const selectableTopics = useMemo(() => {
    const usedTopicIds = new Set(
      publishedList
        .filter((v) => (editingVideo ? v.id !== editingVideo.id : true))
        .map((v) => v.topic_id)
        .filter(Boolean)
    );
    return topics.filter((t) => !usedTopicIds.has(t.id));
  }, [publishedList, editingVideo, topics]);

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

  const openAddModal = () => {
    setEditingVideo(null);
    const usedTopicIds = new Set(publishedList.map((v) => v.topic_id).filter(Boolean));
    const available = topics.filter((t) => !usedTopicIds.has(t.id));
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

  const openEditModal = (v: PublishedVideo) => {
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
    } catch (err) {
      showToast({ message: `同步「${video.title}」失败: ${err instanceof Error ? err.message : '未知错误'}`, tone: 'error' });
    } finally {
      setSyncingId(null);
    }
  };

  // Bulk sync all videos with BV id
  const handleBulkSyncAll = async () => {
    const syncable = publishedList.filter((v) => extractBvid(v.bvid || v.url));
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

  const syncableCount = publishedList.filter((v) => extractBvid(v.bvid || v.url)).length;

  return (
    <div className="flex-1 w-full h-full overflow-y-auto transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white dark:bg-stone-900 p-5 sm:p-6 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight flex items-center gap-2.5">
              <span className="p-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Film className="w-5 h-5 sm:w-6 sm:h-6" />
              </span>
              <span>已发布视频复盘与数据沉淀</span>
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
              记录成片上线表现与长尾收益，支持输入 BV 号一键拉取与同步 B 站播放/点赞/投币数据
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {syncableCount > 0 && (
              <button
                onClick={handleBulkSyncAll}
                disabled={isBulkSyncing}
                className="flex items-center gap-1.5 bg-stone-100/80 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                title="批量刷新所有包含 BV 号的视频数据"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBulkSyncing ? 'animate-spin text-rose-600' : 'text-stone-500 dark:text-stone-400'}`} />
                <span>{isBulkSyncing ? '同步中...' : '批量同步数据'}</span>
              </button>
            )}

            <button
              onClick={openAddModal}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs hover:shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>归档已发布视频</span>
            </button>
          </div>
        </div>

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
            <span>视频卡片流 ({publishedList.length})</span>
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
              publishedList={publishedList}
              topics={topics}
              onSelectTopic={onSelectTopic}
            />
          </React.Suspense>
        ) : (
          /* Published Cards List */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {publishedList.map((video) => {
              const hasBvid = !!extractBvid(video.bvid || video.url);
              const isSyncingThis = syncingId === video.id;
              const matchedTopic = video.topic_id ? topicMap.get(video.topic_id) : undefined;
              const metrics = calculateDeepMetrics(video, matchedTopic);

              return (
                <div
                  key={video.id}
                  className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 sm:p-6 space-y-4 shadow-2xs hover:shadow-card hover:-translate-y-0.5 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 overflow-hidden h-6">
                          <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-300 bg-rose-500/10 dark:bg-rose-950/60 border border-rose-500/20 px-2 py-0.5 rounded-full shrink-0">
                            {video.bvid || 'BVxxxxxx'}
                          </span>
                          {video.topic_title && (
                            <button
                              type="button"
                              onClick={() => video.topic_id && onSelectTopic(video.topic_id)}
                              className="text-[11px] text-stone-600 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 bg-stone-100 dark:bg-stone-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2 py-0.5 rounded-full truncate max-w-[180px] transition-colors text-left cursor-pointer font-medium"
                              title={`查看选题: ${video.topic_title}`}
                            >
                              选题: {video.topic_title}
                            </button>
                          )}
                        </div>
                        <h3
                          className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-snug break-words line-clamp-2 h-[2.75rem] sm:h-[3.25rem] flex items-start"
                          title={video.title}
                        >
                          {video.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {hasBvid && (
                          <button
                            onClick={() => handleSyncSingleVideo(video)}
                            disabled={isSyncingThis || isBulkSyncing}
                            className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-50 cursor-pointer"
                            title="从 B站 同步最新播放与互动数据"
                          >
                            <RefreshCw className={`w-4 h-4 ${isSyncingThis ? 'animate-spin text-rose-600 dark:text-rose-400' : ''}`} />
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(video)}
                          className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
                          title="编辑数据"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`确定要删除发布归档「${video.title}」吗？`)) {
                              onDeletePublished(video.id);
                            }
                          }}
                          className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Stats Bar */}
                    <div className="grid grid-cols-5 gap-2 bg-stone-500/[0.03] dark:bg-stone-800/60 p-3 rounded-xl border border-stone-200/50 dark:border-stone-800 text-center font-mono">
                      <div>
                        <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                          <Eye className="w-3 h-3" />
                          <span>播放</span>
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                          {formatNumber(video.views)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                          <ThumbsUp className="w-3 h-3" />
                          <span>点赞</span>
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-400 mt-0.5">
                          {formatNumber(video.likes)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                          <Coins className="w-3 h-3" />
                          <span>投币</span>
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                          {formatNumber(video.coins)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                          <Bookmark className="w-3 h-3" />
                          <span>收藏</span>
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                          {formatNumber(video.favorites)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                          <MessageSquare className="w-3 h-3" />
                          <span>评论</span>
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mt-0.5">
                          {formatNumber(video.comments)}
                        </div>
                      </div>
                    </div>

                    {/* Deep Key Ratio Badges */}
                    {video.views > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px] font-mono">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300">
                          <span>投币率</span>
                          <span className="font-bold">{metrics.coinRate}%</span>
                          <span className="text-[9px] font-bold px-1 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-200">
                            {metrics.coinGrade}级
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-800 dark:text-rose-300">
                          <span>三连率</span>
                          <span className="font-bold">{metrics.tripleRate}%</span>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-800 dark:text-blue-300">
                          <span>收藏比</span>
                          <span className="font-bold">{metrics.favoriteRate}%</span>
                        </span>
                        {metrics.viewsPerKWord > 0 && (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-800 dark:text-purple-300"
                            title="每千字文案产出的播放量"
                          >
                            <span>千字产出</span>
                            <span className="font-bold">{formatNumber(metrics.viewsPerKWord)}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    {video.notes && (
                      <div
                        className="text-xs text-stone-600 dark:text-stone-300 bg-amber-500/[0.04] dark:bg-amber-950/20 p-3 rounded-xl border border-amber-500/20 leading-relaxed line-clamp-2"
                        title={video.notes}
                      >
                        <strong className="text-stone-800 dark:text-stone-200">复盘笔记：</strong> {video.notes}
                      </div>
                    )}
                  </div>

                  {/* Bottom URL link & date */}
                  <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-400 dark:text-stone-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      发布时间: {video.published_at}
                    </span>

                    {video.url && (
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-semibold"
                      >
                        <span>观看成片</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}

            {publishedList.length === 0 && (
              <div className="col-span-full p-12 text-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500">
                暂无已发布视频归档，制作完成发布后可在此沉淀播放与互动数据！
              </div>
            )}
          </div>
        )}

        {/* Modal: Record / Edit Published */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingVideo ? '编辑已发布视频数据' : '归档已发布视频'}
          subtitle="输入 BV 号可一键自动抓取 B 站播放量、点赞、投币与收藏互动数据"
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

              <div className="relative">
                <CustomSelect
                  value={topicId}
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
                  className="w-full"
                  buttonClassName="w-full min-h-[42px] px-3 py-2 bg-stone-50 dark:bg-stone-800 border-stone-300 dark:border-stone-700 rounded-lg text-sm pr-10"
                  popoverClassName="w-full"
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
                {topicId && <button type="button" onClick={() => setTopicId('')} aria-label="取消关联选题" title="取消关联选题" className="absolute right-8 top-1/2 -translate-y-1/2 z-10 p-1 text-stone-400 hover:text-red-600 dark:hover:text-red-400 rounded-md"><X className="w-3.5 h-3.5" /></button>}
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
                <input
                  type="date"
                  value={publishedAt}
                  onChange={(e) => setPublishedAt(e.target.value)}
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
                  value={views}
                  onChange={(e) => setViews(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-mono text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">点赞数</label>
                <input
                  type="number"
                  value={likes}
                  onChange={(e) => setLikes(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-mono text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">投币数</label>
                <input
                  type="number"
                  value={coins}
                  onChange={(e) => setCoins(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-mono text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">收藏数</label>
                <input
                  type="number"
                  value={favorites}
                  onChange={(e) => setFavorites(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm font-mono text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">评论数</label>
                <input
                  type="number"
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
