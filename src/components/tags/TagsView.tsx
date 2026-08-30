import React, { useState, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topic, Tag, TopicStatus } from '../../types';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import {
  Hash,
  Plus,
  Search,
  Tag as TagIcon,
  FolderKanban,
  Edit2,
  Trash2,
  ArrowRight,
  TrendingUp,
  FileText,
  Clock,
  Sparkles,
  Layers,
  CheckCircle2,
  PenTool,
  Film,
  Compass,
  Zap
} from 'lucide-react';
import { fetchTagsPage, fetchTopicPage } from '../../lib/storage';
import { PageHeader } from '../layout/PageHeader';

interface TagsViewProps {
  tags: Tag[];
  topics: Topic[];
  onSaveTag: (tagName: string, color?: string, tagId?: string) => Promise<Tag>;
  onDeleteTag: (tagId: string) => Promise<void>;
  onSelectTopic: (topicId: string) => void;
  onQuickCreateTopicInTag: (tagName: string) => void;
}

const TAG_COLOR_OPTIONS = [
  { id: 'stone', name: '经典雅灰', bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-300', dot: 'bg-stone-500' },
  { id: 'rose', name: '赤陶绯红', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-300', dot: 'bg-rose-500' },
  { id: 'amber', name: '琥珀金黄', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300', dot: 'bg-amber-500' },
  { id: 'emerald', name: '鼠尾草绿', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-500' },
  { id: 'indigo', name: '静谧靛蓝', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-300', dot: 'bg-indigo-500' },
  { id: 'purple', name: '葡萄冷紫', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300', dot: 'bg-purple-500' },
];

export const TagsView: React.FC<TagsViewProps> = ({
  tags,
  topics,
  onSaveTag,
  onDeleteTag,
  onSelectTopic,
  onQuickCreateTopicInTag,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(tags[0]?.id || null);
  const [topicStatusFilter, setTopicStatusFilter] = useState<'all' | 'in_progress' | 'pending' | 'published'>('all');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [tagPage, setTagPage] = useState(1);
  const [topicPage, setTopicPage] = useState(1);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setTagPage(1);
      setDebouncedSearchTerm(searchTerm.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const tagsPageQuery = useQuery({
    queryKey: ['tags-page', tagPage, debouncedSearchTerm],
    queryFn: () => fetchTagsPage(tagPage, 30, debouncedSearchTerm),
    placeholderData: keepPreviousData,
  });
  const visibleTags = tagsPageQuery.data?.items || [];
  const totalTags = tagsPageQuery.data?.total || 0;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagNameInput, setTagNameInput] = useState('');
  const [tagColorInput, setTagColorInput] = useState('stone');

  // Delete Confirm State
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);

  const tagStatsMap = useMemo(() => new Map(visibleTags.map((tag) => [tag.id, {
    count: tag.stats?.count || 0,
    inProgressCount: tag.stats?.in_progress_count || 0,
    publishedCount: tag.stats?.published_count || 0,
    wordsTotal: tag.stats?.words_total || 0,
    avgScore: tag.stats?.avg_score || 0,
  }])), [visibleTags]);

  const totalTaggedTopics = tagsPageQuery.data?.summary.tagged_topics || 0;
  const totalTopicCount = tagsPageQuery.data?.summary.total_topics || 0;
  const coveragePercent = totalTopicCount > 0 ? Math.round((totalTaggedTopics / totalTopicCount) * 100) : 0;

  // Active selected tag
  const activeTag = visibleTags.find((t) => t.id === selectedTagId) || visibleTags[0] || null;

  React.useEffect(() => {
    if (activeTag && activeTag.id !== selectedTagId) setSelectedTagId(activeTag.id);
  }, [activeTag, selectedTagId]);

  React.useEffect(() => {
    setTopicPage(1);
  }, [activeTag?.id, topicStatusFilter]);

  // Topics belonging to active selected tag
  const topicStatus = topicStatusFilter === 'in_progress'
    ? 'approved,scripting,production'
    : topicStatusFilter === 'pending' ? 'inbox'
      : topicStatusFilter === 'published' ? 'published,icebox' : undefined;
  const tagTopicsPageQuery = useQuery({
    queryKey: ['tag-topics-page', activeTag?.id || '', topicStatusFilter, topicPage],
    queryFn: () => fetchTopicPage({
      scope: 'all',
      page: topicPage,
      page_size: 30,
      tag_id: activeTag?.id,
      status: topicStatus,
      sort: 'updated_at',
      direction: 'desc',
    }),
    enabled: Boolean(activeTag),
    placeholderData: keepPreviousData,
  });
  const activeTagTopics = tagTopicsPageQuery.data?.items || [];

  const openCreateModal = () => {
    setEditingTag(null);
    setTagNameInput('');
    setTagColorInput('stone');
    setIsModalOpen(true);
  };

  const openEditModal = (tag: Tag) => {
    setEditingTag(tag);
    setTagNameInput(tag.name);
    setTagColorInput(tag.color || 'stone');
    setIsModalOpen(true);
  };

  const handleSaveTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = tagNameInput.trim().replace(/^#/, '');
    if (!name) return;

    const saved = await onSaveTag(name, tagColorInput, editingTag?.id);
    await queryClient.invalidateQueries({ queryKey: ['tags'] });
    await queryClient.invalidateQueries({ queryKey: ['tags-page'] });
    await queryClient.invalidateQueries({ queryKey: ['tags-options'] });
    await queryClient.invalidateQueries({ queryKey: ['tag-topics-page'] });
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });
    setSelectedTagId(saved.id);
    setIsModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingTag) return;
    await onDeleteTag(deletingTag.id);
    if (selectedTagId === deletingTag.id) {
      const remaining = visibleTags.filter((t) => t.id !== deletingTag.id);
      setSelectedTagId(remaining[0]?.id || null);
    }
    if (visibleTags.length === 1 && tagPage > 1) setTagPage((current) => current - 1);
    await queryClient.invalidateQueries({ queryKey: ['tags'] });
    await queryClient.invalidateQueries({ queryKey: ['tags-page'] });
    await queryClient.invalidateQueries({ queryKey: ['tags-options'] });
    await queryClient.invalidateQueries({ queryKey: ['tag-topics-page'] });
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });
    setDeletingTag(null);
  };

  const activeStats = activeTag ? tagStatsMap.get(activeTag.id) : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fafaf9] dark:bg-[#0c0a09] overflow-hidden transition-colors">
      {/* 1. Header & Metric Cards */}
      <div className="tags-header-banner px-4 sm:px-8 py-5 border-b border-stone-200/70 dark:border-stone-800 bg-white/80 dark:bg-stone-900/90 backdrop-blur-sm shrink-0">
        <PageHeader
          title="标签与创作赛道资产"
          icon={Hash}
          className="mb-4"
          actions={(
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-rose-700 hover:shadow-xs active:scale-[0.98] sm:text-sm"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
              <span>新建赛道标签</span>
            </button>
          )}
        />

        {/* Metric Cards */}
        <div className="tags-metrics-container grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-stone-800/80 border border-stone-200/70 dark:border-stone-700/80 rounded-2xl p-3.5 shadow-2xs">
            <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
              <span>赛道标签总数</span>
            </div>
            <div className="text-xl font-bold text-stone-900 dark:text-stone-100 mt-1 font-mono">{totalTags} 个</div>
          </div>

          <div className="bg-white dark:bg-stone-800/80 border border-stone-200/70 dark:border-stone-700/80 rounded-2xl p-3.5 shadow-2xs">
            <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>打标覆盖率</span>
            </div>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 font-mono">
              {coveragePercent}% <span className="text-xs text-stone-600 dark:text-stone-400 font-normal">({totalTaggedTopics}/{totalTopicCount})</span>
            </div>
          </div>

          <div className="bg-white dark:bg-stone-800/80 border border-stone-200/70 dark:border-stone-700/80 rounded-2xl p-3.5 shadow-2xs">
            <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
              <span>储备最丰富赛道</span>
            </div>
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-1 truncate">
              {visibleTags.length > 0
                ? `#${[...visibleTags].sort((a, b) => (tagStatsMap.get(b.id)?.count || 0) - (tagStatsMap.get(a.id)?.count || 0))[0]?.name}`
                : '暂无'}
            </div>
          </div>

          <div className="bg-white dark:bg-stone-800/80 border border-stone-200/70 dark:border-stone-700/80 rounded-2xl p-3.5 shadow-2xs">
            <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase flex items-center gap-1">
              <PenTool className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>在写稿赛道数</span>
            </div>
            <div className="text-xl font-bold text-indigo-700 dark:text-indigo-400 mt-1 font-mono">
              {visibleTags.filter((t) => (tagStatsMap.get(t.id)?.inProgressCount || 0) > 0).length} 赛道
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Content Grid (Master-Detail Split) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden min-h-0">
        {/* Left / Tag Selector List Panel (w-80) */}
        <div className="tags-sidebar-panel w-full md:w-80 border-r border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col shrink-0 h-64 md:h-full overflow-hidden">
          {/* Search Box */}
          <div className="p-3 border-b border-stone-100 dark:border-stone-800">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute left-3 top-2.5" />
              <input
                type="text"
                id="tags-search"
                name="tags_search"
                aria-label="搜索标签"
                autoComplete="off"
                placeholder="搜索标签名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Tags List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {visibleTags.map((tag) => {
              const isSelected = activeTag?.id === tag.id;
              const stats = tagStatsMap.get(tag.id);
              const count = stats?.count || 0;
              const colorConf = TAG_COLOR_OPTIONS.find((c) => c.id === tag.color) || TAG_COLOR_OPTIONS[0];

              return (
                <div
                  key={tag.id}
                  onClick={() => setSelectedTagId(tag.id)}
                  className={`tag-menu-item group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'is-selected bg-rose-500/10 dark:bg-rose-950/40 border-rose-500/20 text-stone-900 dark:text-stone-100 shadow-2xs font-semibold'
                      : 'bg-white dark:bg-stone-900 border-transparent hover:bg-stone-100/70 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${colorConf.dot} shrink-0`} />
                    <div className="truncate">
                      <div className="text-sm font-bold truncate flex items-center gap-1.5">
                        <span>#{tag.name}</span>
                      </div>
                      <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center gap-2 mt-0.5">
                        <span>{count} 选题</span>
                        {stats && stats.inProgressCount > 0 && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{stats.inProgressCount} 写稿</span>
                        )}
                        {stats && stats.publishedCount > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{stats.publishedCount} 已发布</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Count Badge */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                      isSelected ? 'bg-rose-200/80 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200' : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                    }`}>
                      {count}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(tag);
                      }}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg transition-opacity cursor-pointer"
                      title="编辑标签"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingTag(tag);
                      }}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-opacity cursor-pointer"
                      title="删除标签"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {visibleTags.length === 0 && !tagsPageQuery.isFetching && (
              <div className="py-8 text-center text-xs text-stone-600 dark:text-stone-400">
                暂无匹配标签
              </div>
            )}
          </div>
          {totalTags > 0 && (
            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-stone-100 px-2 py-2 text-[11px] text-stone-500 dark:border-stone-800 dark:text-stone-400">
              <button type="button" disabled={tagPage <= 1 || tagsPageQuery.isFetching} onClick={() => setTagPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-stone-200 bg-white px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900">上一页</button>
              <span className="font-mono">{tagPage} / {Math.max(1, tagsPageQuery.data?.total_pages || 1)}</span>
              <button type="button" disabled={tagPage >= (tagsPageQuery.data?.total_pages || 1) || tagsPageQuery.isFetching} onClick={() => setTagPage((current) => current + 1)} className="rounded-lg border border-stone-200 bg-white px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900">下一页</button>
            </div>
          )}
        </div>

        {/* Right / Selected Tag Deep Detail Stream (flex-1) */}
        <div className="flex-none md:flex-1 flex flex-col h-auto md:h-full overflow-visible md:overflow-hidden bg-[#fafaf9] dark:bg-[#0c0a09]">
          {activeTag ? (
            <>
              {/* Tag Header Banner */}
              <div className="p-6 border-b border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-center justify-between flex-wrap gap-4 shrink-0 shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl font-black text-stone-900 dark:text-stone-100 flex items-center gap-1">
                      <Hash className="w-6 h-6 text-rose-600 dark:text-rose-500" />
                      {activeTag.name}
                    </span>
                    <span className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-bold px-2.5 py-0.5 rounded-full font-mono">
                      共 {activeStats?.count || 0} 个选题
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-3">
                    <span>累计产出文案：<strong className="text-stone-800 dark:text-stone-200 font-mono">{activeStats?.wordsTotal || 0} 字</strong></span>
                    <span>•</span>
                    <span>平均故事评分：<strong className="text-stone-800 dark:text-stone-200 font-mono">{activeStats?.avgScore || 0} / 10分</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(activeTag)}
                    className="flex items-center gap-1 text-xs font-semibold text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>编辑标签</span>
                  </button>

                  <button
                    onClick={() => onQuickCreateTopicInTag(activeTag.name)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 px-3.5 py-1.5 rounded-xl shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>为此赛道新建选题</span>
                  </button>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="px-6 py-3 border-b border-stone-200/70 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/90 flex items-center gap-2 shrink-0 overflow-x-auto">
                <span className="text-xs font-semibold text-stone-400 dark:text-stone-500 mr-2">阶段筛选：</span>
                {([
                  { id: 'all', label: '全部' },
                  { id: 'in_progress', label: '⚡ 活跃生产中' },
                  { id: 'pending', label: '🌱 待立项/收集箱' },
                  { id: 'published', label: '🎬 已发布成片' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setTopicStatusFilter(tab.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      topicStatusFilter === tab.id
                        ? 'bg-stone-900 dark:bg-rose-600 text-white font-bold shadow-2xs'
                        : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200/70 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Topics Grid */}
              <div className="flex-none md:flex-1 overflow-visible md:overflow-y-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {activeTagTopics.map((topic) => (
                    <div
                      key={topic.id}
                      onClick={() => onSelectTopic(topic.id)}
                      className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-3 shadow-2xs hover:shadow-card hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="space-y-2.5">
                        {/* Status & Priority */}
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge status={topic.status} />
                          <PriorityBadge priority={topic.priority} />
                        </div>

                        {/* Title */}
                        <h4 className="font-bold text-stone-900 dark:text-stone-100 text-base leading-snug group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                          {topic.title}
                        </h4>

                        {/* Summary */}
                        {topic.summary && (
                          <p className="text-xs text-stone-600 dark:text-stone-300 line-clamp-2 leading-relaxed bg-stone-500/[0.03] dark:bg-stone-800/60 p-2.5 rounded-xl border border-stone-200/50 dark:border-stone-800">
                            {topic.summary}
                          </p>
                        )}

                        {/* Next Action */}
                        {topic.next_action && (
                          <div className="text-xs text-rose-950 dark:text-rose-200 bg-rose-500/10 dark:bg-rose-950/40 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium truncate">
                            <span className="shrink-0 font-bold text-rose-600 dark:text-rose-400">⚡ 下一步:</span>
                            <span className="truncate">{topic.next_action}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-400 dark:text-stone-500">
                        <span className="font-mono">{topic.draft_word_count ? `${topic.draft_word_count} 字` : '未开始文案'}</span>
                        <div className="flex items-center gap-1 text-stone-600 dark:text-stone-300 font-semibold group-hover:translate-x-0.5 transition-transform">
                          <span>进入工作台</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  ))}

                  {activeTagTopics.length === 0 && !tagTopicsPageQuery.isFetching && (
                    <div className="col-span-full py-16 text-center border-2 border-dashed border-stone-200/80 dark:border-stone-800 rounded-2xl bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500">
                      当前赛道在所选筛选条件下暂无选题
                    </div>
                  )}
                </div>
                {(tagTopicsPageQuery.data?.total || 0) > 0 && (
                  <div className="mt-5 flex items-center justify-center gap-3 text-xs text-stone-500 dark:text-stone-400">
                    <button type="button" disabled={topicPage <= 1 || tagTopicsPageQuery.isFetching} onClick={() => setTopicPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900">上一页</button>
                    <span className="font-mono">{topicPage} / {Math.max(1, tagTopicsPageQuery.data?.total_pages || 1)} · 共 {tagTopicsPageQuery.data?.total || 0} 个选题</span>
                    <button type="button" disabled={topicPage >= (tagTopicsPageQuery.data?.total_pages || 1) || tagTopicsPageQuery.isFetching} onClick={() => setTopicPage((current) => current + 1)} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900">下一页</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-stone-400 text-sm">
              请选择或创建一个赛道标签
            </div>
          )}
        </div>

      </div>

      {/* Modal: Create / Edit Tag */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTag ? '编辑赛道标签' : '新建赛道标签'}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveTagSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1">
              标签名称 <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-stone-400 font-bold">#</span>
              <input
                type="text"
                required
                autoFocus
                placeholder="例如：网红打假"
                value={tagNameInput}
                onChange={(e) => setTagNameInput(e.target.value)}
                className="w-full pl-7 pr-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5">
              赛道标识色
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TAG_COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setTagColorInput(c.id)}
                  className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    tagColorInput === c.id
                      ? 'border-rose-500 bg-rose-500/10 text-rose-800 dark:text-rose-200 font-bold'
                      : 'border-stone-200/70 dark:border-stone-700 bg-stone-500/[0.03] dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200/70 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold cursor-pointer transition-all shadow-2xs"
            >
              {editingTag ? '更新标签' : '保存标签'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirm */}
      <Modal
        isOpen={Boolean(deletingTag)}
        onClose={() => setDeletingTag(null)}
        title="确认删除此赛道标签？"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
            删除标签 <strong className="text-stone-900 dark:text-stone-100">#{deletingTag?.name}</strong> 将仅移除标签本身，关联选题不会被删除。
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200/70 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setDeletingTag(null)}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-5 py-2 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold cursor-pointer transition-all shadow-2xs"
            >
              确认删除
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
