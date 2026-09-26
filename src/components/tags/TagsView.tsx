import React, { useState, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topic, Tag, TagStats } from '../../types';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import {
  Hash,
  Plus,
  Search,
  Edit2,
  Trash2,
  ArrowRight,
  TrendingUp,
  Layers,
  CheckCircle2,
  PenTool,
} from 'lucide-react';
import { fetchTagsPage, fetchTopicPage } from '../../lib/storage';
import { PageHeader } from '../layout/PageHeader';
import { CustomSelect, type SelectOption } from '../ui/CustomSelect';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';
import { invalidateQueryGroups } from '../../lib/topicQueryCache';

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

type TagWithStats = Tag & { stats?: TagStats };

function TagMetricCard({
  icon,
  label,
  value,
  detail,
  tone = 'stone',
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: 'stone' | 'accent' | 'amber' | 'emerald';
}) {
  const tones = {
    stone: 'bg-stone-500/5 text-stone-600 dark:bg-stone-800/80 dark:text-stone-300',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent-dark)]',
    amber: 'bg-amber-500/10 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  };

  return (
    <div className="flex h-full min-h-[4.5rem] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 shadow-2xs sm:gap-3 sm:px-4">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-8 sm:w-8 ${tones[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="min-w-0 truncate text-[11px] font-semibold leading-tight text-[var(--ink-muted)]">{label}</p>
        <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
          <p className="min-w-0 truncate text-[1.05rem] font-bold leading-tight tracking-tight text-[var(--ink)] sm:text-lg">{value}</p>
          <span className="shrink-0 text-[10px] font-medium leading-tight text-[var(--ink-muted)]">{detail}</span>
        </div>
      </div>
    </div>
  );
}

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
  const [tagPickerSearch, setTagPickerSearch] = useState('');
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

  const allTagCandidates = useMemo(() => {
    const tagMap = new Map<string, TagWithStats>(tags.map((tag) => [tag.id, tag]));
    visibleTags.forEach((tag) => {
      const existing = tagMap.get(tag.id);
      tagMap.set(tag.id, existing ? { ...existing, ...tag } : tag);
    });
    return [...tagMap.values()];
  }, [tags, visibleTags]);

  const tagStatsMap = useMemo(() => new Map(allTagCandidates.map((tag) => [tag.id, {
    count: tag.stats?.count || 0,
    inProgressCount: tag.stats?.in_progress_count || 0,
    publishedCount: tag.stats?.published_count || 0,
    wordsTotal: tag.stats?.words_total || 0,
    avgScore: tag.stats?.avg_score || 0,
  }])), [allTagCandidates]);

  const totalTaggedTopics = tagsPageQuery.data?.summary.tagged_topics || 0;
  const totalTopicCount = tagsPageQuery.data?.summary.total_topics || 0;
  const coveragePercent = totalTopicCount > 0 ? Math.round((totalTaggedTopics / totalTopicCount) * 100) : 0;

  // Active selected tag
  const activeTag = allTagCandidates.find((t) => t.id === selectedTagId) || allTagCandidates[0] || null;

  const mobileTagOptions = useMemo<SelectOption[]>(() => {
    const query = tagPickerSearch.trim().toLowerCase();
    return allTagCandidates
      .filter((tag) => !query || tag.name.toLowerCase().includes(query))
      .map((tag) => ({
        value: tag.id,
        label: `#${tag.name}`,
        dot: (TAG_COLOR_OPTIONS.find((color) => color.id === tag.color) || TAG_COLOR_OPTIONS[0]).dot,
        description: `${tag.stats?.count || 0} 个选题`,
      }));
  }, [allTagCandidates, tagPickerSearch]);

  React.useEffect(() => {
    if (activeTag && activeTag.id !== selectedTagId) setSelectedTagId(activeTag.id);
  }, [activeTag, selectedTagId]);

  React.useEffect(() => {
    setTopicPage(1);
  }, [activeTag?.id, topicStatusFilter]);

  // Topics belonging to active selected tag
  const topicStatus = topicStatusFilter === 'in_progress'
    ? 'scripting,production'
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
    subscribed: Boolean(activeTag),
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
    await invalidateQueryGroups(queryClient, [['tags'], ['tags-page'], ['tags-options'], ['tag-topics-page'], ['workspace']]);
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
    await invalidateQueryGroups(queryClient, [['tags'], ['tags-page'], ['tags-options'], ['tag-topics-page'], ['workspace']]);
    setDeletingTag(null);
  };

  const activeStats = activeTag ? tagStatsMap.get(activeTag.id) : null;

  return (
    <div data-testid="tags-page" className="min-h-0 min-w-0 flex-1 w-full h-full overflow-y-auto overscroll-contain mobile-bottom-nav-content bg-[var(--canvas)] transition-colors md:overflow-hidden md:pb-8">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-7 sm:px-8 sm:py-7">
        <PageHeader
          title="标签与创作赛道资产"
          icon={Hash}
          actions={(
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-xs font-bold text-white shadow-2xs transition-all hover:bg-[var(--accent-dark)] active:scale-[0.98] sm:text-sm"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
              <span>新建赛道标签</span>
            </button>
          )}
        />

        <section aria-label="标签资产概览" className="tags-metrics-container grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <TagMetricCard
            icon={<Layers className="h-4 w-4" aria-hidden="true" />}
            label="赛道标签总数"
            value={<><span className="font-mono tabular-nums">{totalTags}</span> 个</>}
            detail="标签资产"
          />
          <TagMetricCard
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            label="打标覆盖率"
            value={<><span className="font-mono tabular-nums">{coveragePercent}%</span> <span className="text-xs font-normal text-[var(--ink-muted)]"><span className="font-mono tabular-nums">({totalTaggedTopics}/{totalTopicCount})</span></span></>}
            detail="选题覆盖"
            tone="emerald"
          />
          <TagMetricCard
            icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            label="储备最丰富赛道"
            value={visibleTags.length > 0
              ? `#${[...visibleTags].sort((a, b) => (tagStatsMap.get(b.id)?.count || 0) - (tagStatsMap.get(a.id)?.count || 0))[0]?.name}`
              : '暂无'}
            detail="选题储备"
            tone="accent"
          />
          <TagMetricCard
            icon={<PenTool className="h-4 w-4" aria-hidden="true" />}
            label="在写稿赛道数"
            value={<><span className="font-mono tabular-nums">{visibleTags.filter((t) => (tagStatsMap.get(t.id)?.inProgressCount || 0) > 0).length}</span> 赛道</>}
            detail="活跃生产"
            tone="amber"
          />
        </section>

        <section aria-label="标签与选题工作区" className="flex min-h-[34rem] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xs md:min-h-0">
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Left / Tag Selector List Panel (w-80) - background aligned with right */}
        <div className="tags-sidebar-panel hidden w-full shrink-0 flex-col overflow-hidden border-b border-[var(--line)] bg-[var(--canvas)] md:flex md:h-auto md:w-80 md:border-b-0 md:border-r">
          {/* Search Box */}
          <div className="border-b border-[var(--line)] bg-[var(--canvas)] p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--ink-muted)]" aria-hidden="true" />
              <input
                type="text"
                id="tags-search"
                name="tags_search"
                aria-label="搜索标签"
                autoComplete="off"
                placeholder="搜索标签名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="min-h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 pl-9 text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>

          {/* Tags List */}
          <FloatingScrollbar className="space-y-1 bg-[var(--canvas)] p-3" wrapperClassName="min-h-0 flex-1">
            {visibleTags.map((tag) => {
              const isSelected = activeTag?.id === tag.id;
              const stats = tagStatsMap.get(tag.id);
              const count = stats?.count || 0;
              const colorConf = TAG_COLOR_OPTIONS.find((c) => c.id === tag.color) || TAG_COLOR_OPTIONS[0];

              return (
                <div
                  key={tag.id}
                  className={`tag-menu-item group relative flex items-center justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'is-selected bg-[var(--surface)] border-[var(--line)] text-[var(--ink)] shadow-2xs font-semibold'
                      : 'bg-transparent border-transparent hover:border-[var(--line)] hover:bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTagId(tag.id)}
                    aria-pressed={isSelected}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${colorConf.dot}`} />
                    <span className="truncate">
                      <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        <span>#{tag.name}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
                        <span>{count} 选题</span>
                        {stats && stats.inProgressCount > 0 && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium">{stats.inProgressCount} 写稿</span>
                        )}
                        {stats && stats.publishedCount > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{stats.publishedCount} 已发布</span>
                        )}
                      </span>
                    </span>
                  </button>

                  {/* Actions & Count Badge */}
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="px-1.5 py-0.5 font-mono text-xs tabular-nums text-[var(--ink-muted)]">
                      {count}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(tag);
                      }}
                      className="cursor-pointer rounded-lg p-1.5 text-[var(--ink-muted)] opacity-100 transition-opacity hover:text-[var(--ink)] md:opacity-0 md:group-hover:opacity-100"
                      title="编辑标签"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingTag(tag);
                      }}
                      className="cursor-pointer rounded-lg p-1.5 text-[var(--ink-muted)] opacity-100 transition-opacity hover:text-[var(--h1-color)] md:opacity-0 md:group-hover:opacity-100"
                      title="删除标签"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {visibleTags.length === 0 && !tagsPageQuery.isFetching && (
              <div className="px-3 py-8 text-center text-xs text-[var(--ink-muted)]">
                暂无匹配标签
              </div>
            )}
          </FloatingScrollbar>
          {totalTags > 0 && (
            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-[var(--line)] bg-[var(--canvas)] px-3 py-3 text-[11px] text-[var(--ink-muted)]">
              <button type="button" disabled={tagPage <= 1 || tagsPageQuery.isFetching} onClick={() => setTagPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-40">上一页</button>
              <span className="font-mono tabular-nums">{tagPage} / {Math.max(1, tagsPageQuery.data?.total_pages || 1)}</span>
              <button type="button" disabled={tagPage >= (tagsPageQuery.data?.total_pages || 1) || tagsPageQuery.isFetching} onClick={() => setTagPage((current) => current + 1)} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-40">下一页</button>
            </div>
          )}
        </div>

        <div data-testid="tags-mobile-picker" className="shrink-0 border-b border-[var(--line)] bg-[var(--canvas)] p-4 md:hidden">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span id="mobile-tag-picker-label" className="text-xs font-bold text-[var(--ink)]">当前赛道</span>
            <span className="text-[11px] text-[var(--ink-muted)]">共 {tags.length} 个标签</span>
          </div>
          <CustomSelect
            value={activeTag?.id || ''}
            onChange={(value) => {
              setSelectedTagId(value || null);
              setTopicPage(1);
            }}
            options={mobileTagOptions}
            ariaLabel="选择赛道标签"
            ariaLabelledBy="mobile-tag-picker-label"
            placeholder="请选择赛道标签"
            searchable
            searchValue={tagPickerSearch}
            onSearchChange={setTagPickerSearch}
            searchPlaceholder="搜索标签名称..."
            className="block w-full"
            buttonClassName="min-h-11 w-full"
          />
        </div>

        {/* Right / Selected Tag Deep Detail Stream (flex-1) */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-visible bg-[var(--canvas)] md:overflow-hidden">
          {activeTag ? (
            <>
              {/* Tag Header Banner */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="flex min-w-0 items-center gap-1 text-xl font-bold text-[var(--ink)] sm:text-2xl">
                      <Hash className="h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                      {activeTag.name}
                    </span>
                    <span className="rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
                      共 <span className="font-mono tabular-nums">{activeStats?.count || 0}</span> 个选题
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-muted)]">
                    <span>累计产出文案：<strong className="text-[var(--ink)]"><span className="font-mono tabular-nums">{activeStats?.wordsTotal || 0}</span> 字</strong></span>
                    <span>•</span>
                    <span>平均故事评分：<strong className="text-[var(--ink)]"><span className="font-mono tabular-nums">{activeStats?.avgScore || 0} / 10</span> 分</strong></span>
                  </div>
                </div>

                <div className="flex w-full sm:w-auto items-center gap-2">
                  <button
                    onClick={() => openEditModal(activeTag)}
                    className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--line)] hover:bg-[var(--canvas)] sm:flex-none"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>编辑标签</span>
                  </button>

                  <button
                    onClick={() => onQuickCreateTopicInTag(activeTag.name)}
                    className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-[var(--accent-dark)] sm:flex-none"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>为此赛道新建选题</span>
                  </button>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--line)] bg-[var(--canvas)] px-4 py-2.5 no-scrollbar sm:px-6">
                <span className="mr-2 text-xs font-medium text-[var(--ink-muted)]">阶段筛选：</span>
                {([
                  { id: 'all', label: '全部' },
                  { id: 'in_progress', label: '活跃生产中' },
                  { id: 'pending', label: '待立项/收集箱' },
                  { id: 'published', label: '已发布成片' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setTopicStatusFilter(tab.id)}
                    className={`min-h-8 shrink-0 rounded-lg px-3 py-1 text-xs transition-all cursor-pointer ${
                      topicStatusFilter === tab.id
                        ? 'bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] font-semibold shadow-2xs'
                        : 'border border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Topics Grid */}
              <FloatingScrollbar key={`${activeTag.id}-${topicStatusFilter}-${topicPage}`} data-testid="tags-topic-stream" className="mobile-scroll-reveal p-4 sm:p-6" wrapperClassName="min-h-0 flex-none md:flex-1">
                <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {activeTagTopics.map((topic) => (
                    <div
                      key={topic.id}
                      onClick={() => onSelectTopic(topic.id)}
                      role="button"
                      tabIndex={0}
                      aria-label={`打开选题：${topic.title}`}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectTopic(topic.id);
                        }
                      }}
                      className="mobile-motion-card group flex min-w-0 cursor-pointer flex-col justify-between space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                    >
                      <div className="space-y-2.5">
                        {/* Status & Priority */}
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge status={topic.status} />
                          <PriorityBadge priority={topic.priority} />
                        </div>

                        {/* Title */}
                        <h4 className="font-medium text-[var(--ink)] text-base leading-snug group-hover:text-[var(--accent)] transition-colors">
                          {topic.title}
                        </h4>

                        {/* Summary */}
                        {topic.summary && (
                            <p className="line-clamp-2 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-2.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                            {topic.summary}
                          </p>
                        )}

                        {/* Current Action */}
                        {topic.current_todo && (
                          <div className="flex items-center gap-1.5 truncate rounded-xl bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
                            <span className="shrink-0 font-semibold">当前行动:</span>
                            <span className="truncate">{topic.current_todo.title}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-muted)]">
                        <span>{topic.draft_word_count ? <><span className="font-mono tabular-nums">{topic.draft_word_count}</span> 字</> : '未开始文案'}</span>
                        <div className="flex items-center gap-1 text-[var(--ink)] font-medium group-hover:translate-x-0.5 transition-transform">
                          <span>进入工作台</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  ))}

                  {activeTagTopics.length === 0 && !tagTopicsPageQuery.isFetching && (
                    <div className="col-span-full rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] py-16 text-center text-[var(--ink-muted)]">
                      当前赛道在所选筛选条件下暂无选题
                    </div>
                  )}
                </div>
                {(tagTopicsPageQuery.data?.total || 0) > 0 && (
                  <div className="mt-5 flex items-center justify-center gap-3 text-xs text-[var(--ink-muted)]">
                    <button type="button" disabled={topicPage <= 1 || tagTopicsPageQuery.isFetching} onClick={() => setTopicPage((current) => Math.max(1, current - 1))} className="min-h-9 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 font-medium text-[var(--ink)] hover:bg-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-40">上一页</button>
                    <span><span className="font-mono tabular-nums">{topicPage} / {Math.max(1, tagTopicsPageQuery.data?.total_pages || 1)}</span> · 共 <span className="font-mono tabular-nums">{tagTopicsPageQuery.data?.total || 0}</span> 个选题</span>
                    <button type="button" disabled={topicPage >= (tagTopicsPageQuery.data?.total_pages || 1) || tagTopicsPageQuery.isFetching} onClick={() => setTopicPage((current) => current + 1)} className="min-h-9 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 font-medium text-[var(--ink)] hover:bg-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-40">下一页</button>
                  </div>
                )}
              </FloatingScrollbar>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-[var(--ink-muted)] text-sm">
              请选择或创建一个赛道标签
            </div>
          )}
        </div>

          </div>
        </section>
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
              标签名称 <span className="text-stone-400">*</span>
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
                className="w-full pl-7 pr-3.5 py-2.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-[var(--accent)] focus:outline-none"
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
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dark)] dark:text-[var(--accent)] font-bold'
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
              className="px-5 py-2 text-xs sm:text-sm bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white rounded-xl font-bold cursor-pointer transition-all shadow-2xs"
            >
              {editingTag ? '更新标签' : '保存标签'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete Confirm */}
      <ConfirmDialog
        isOpen={Boolean(deletingTag)}
        onClose={() => setDeletingTag(null)}
        onConfirm={handleConfirmDelete}
        title="确认删除此赛道标签？"
        description={deletingTag ? `删除标签「#${deletingTag.name}」将仅移除标签本身，关联选题不会被删除。` : ''}
        confirmText="确认删除"
        tone="danger"
      />
    </div>
  );
};
