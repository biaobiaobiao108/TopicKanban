import React, { useState, useMemo } from 'react';
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
  Compass
} from 'lucide-react';

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

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagNameInput, setTagNameInput] = useState('');
  const [tagColorInput, setTagColorInput] = useState('stone');

  // Delete Confirm State
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);

  // Compute tag statistics
  const tagStatsMap = useMemo(() => {
    const map = new Map<string, {
      count: number;
      inProgressCount: number;
      publishedCount: number;
      wordsTotal: number;
      avgScore: number;
    }>();

    tags.forEach((tag) => {
      const related = topics.filter((t) =>
        t.tags?.some((tg) => tg.name.toLowerCase() === tag.name.toLowerCase() || tg.id === tag.id)
      );

      const inProgress = related.filter((t) =>
        t.status === 'approved' || t.status === 'scripting' || t.status === 'production'
      ).length;

      const published = related.filter((t) => t.status === 'published').length;
      const words = related.reduce((acc, t) => acc + (t.draft_word_count || 0), 0);
      
      const totalScore = related.reduce((acc, t) => {
        const score = (t.score_character || 0) + (t.score_conflict || 0) + (t.score_contrast || 0) + (t.score_material || 0) + (t.score_story || 0);
        return acc + score;
      }, 0);

      const avgScore = related.length > 0 ? Number((totalScore / related.length).toFixed(1)) : 0;

      map.set(tag.id, {
        count: related.length,
        inProgressCount: inProgress,
        publishedCount: published,
        wordsTotal: words,
        avgScore,
      });
    });

    return map;
  }, [tags, topics]);

  // Overall metrics
  const totalTaggedTopics = useMemo(() => {
    return topics.filter((t) => t.tags && t.tags.length > 0).length;
  }, [topics]);

  const coveragePercent = topics.length > 0 ? Math.round((totalTaggedTopics / topics.length) * 100) : 0;

  // Filtered tag list
  const filteredTags = useMemo(() => {
    if (!searchTerm.trim()) return tags;
    const q = searchTerm.toLowerCase().trim().replace(/^#/, '');
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, searchTerm]);

  // Active selected tag
  const activeTag = tags.find((t) => t.id === selectedTagId) || tags[0] || null;

  // Topics belonging to active selected tag
  const activeTagTopics = useMemo(() => {
    if (!activeTag) return [];
    const raw = topics.filter((t) =>
      t.tags?.some((tg) => tg.name.toLowerCase() === activeTag.name.toLowerCase() || tg.id === activeTag.id)
    );

    if (topicStatusFilter === 'in_progress') {
      return raw.filter((t) => t.status === 'approved' || t.status === 'scripting' || t.status === 'production');
    }
    if (topicStatusFilter === 'pending') {
      return raw.filter((t) => t.status === 'inbox');
    }
    if (topicStatusFilter === 'published') {
      return raw.filter((t) => t.status === 'published' || t.status === 'icebox');
    }
    return raw;
  }, [activeTag, topics, topicStatusFilter]);

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
    setSelectedTagId(saved.id);
    setIsModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingTag) return;
    await onDeleteTag(deletingTag.id);
    if (selectedTagId === deletingTag.id) {
      const remaining = tags.filter((t) => t.id !== deletingTag.id);
      setSelectedTagId(remaining[0]?.id || null);
    }
    setDeletingTag(null);
  };

  const activeStats = activeTag ? tagStatsMap.get(activeTag.id) : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fafaf9] dark:bg-[#0c0a09] overflow-hidden transition-colors">
      {/* 1. Header & Metric Cards */}
      <div className="tags-header-banner px-6 py-5 border-b border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-900/80 backdrop-blur-xs shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Hash className="w-5 h-5 text-rose-600 dark:text-rose-500" />
              <span>标签与创作赛道资产 (Tags & Genres)</span>
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              沉淀 Bilibili 叙事视频的各大核心内容赛道，盘点各类型选题储备与产出
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新建赛道标签</span>
          </button>
        </div>

        {/* Metric Cards */}
        <div className="tags-metrics-container grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="metric-card metric-tag-total bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
              <span>赛道标签总数</span>
            </div>
            <div className="text-xl font-bold text-stone-900 dark:text-stone-100 mt-1 font-mono">{tags.length} 个</div>
          </div>

          <div className="metric-card metric-tag-coverage bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>打标覆盖率</span>
            </div>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 font-mono">
              {coveragePercent}% <span className="text-xs text-stone-400 dark:text-stone-500 font-normal">({totalTaggedTopics}/{topics.length})</span>
            </div>
          </div>

          <div className="metric-card metric-tag-richest bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
              <span>储备最丰富赛道</span>
            </div>
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-1 truncate">
              {tags.length > 0
                ? `#${[...tags].sort((a, b) => (tagStatsMap.get(b.id)?.count || 0) - (tagStatsMap.get(a.id)?.count || 0))[0]?.name}`
                : '暂无'}
            </div>
          </div>

          <div className="metric-card metric-tag-writing bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase flex items-center gap-1">
              <PenTool className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>在写稿赛道数</span>
            </div>
            <div className="text-xl font-bold text-indigo-700 dark:text-indigo-400 mt-1 font-mono">
              {tags.filter((t) => (tagStatsMap.get(t.id)?.inProgressCount || 0) > 0).length} 赛道
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Content Grid (Master-Detail Split) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden min-h-0">
        {/* Left / Tag Selector List Panel (w-80) */}
        <div className="tags-sidebar-panel w-full md:w-80 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col shrink-0 h-64 md:h-full overflow-hidden">
          {/* Search Box */}
          <div className="p-3 border-b border-stone-100 dark:border-stone-800">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="搜索标签名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:outline-none focus:border-stone-900 dark:focus:border-stone-500"
              />
            </div>
          </div>

          {/* Tags List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredTags.map((tag) => {
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
                      ? 'is-selected bg-rose-50/60 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-stone-900 dark:text-stone-100 shadow-2xs'
                      : 'bg-white dark:bg-stone-900 border-transparent hover:bg-stone-50 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
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
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{stats.inProgressCount} 写稿中</span>
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
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded transition-opacity cursor-pointer"
                      title="编辑标签"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingTag(tag);
                      }}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded transition-opacity cursor-pointer"
                      title="删除标签"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredTags.length === 0 && (
              <div className="py-8 text-center text-xs text-stone-400 dark:text-stone-500">
                暂无匹配标签
              </div>
            )}
          </div>
        </div>

        {/* Right / Selected Tag Deep Detail Stream (flex-1) */}
        <div className="flex-none md:flex-1 flex flex-col h-auto md:h-full overflow-visible md:overflow-hidden bg-[#fafaf9] dark:bg-[#0c0a09]">
          {activeTag ? (
            <>
              {/* Tag Header Banner */}
              <div className="p-6 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-center justify-between flex-wrap gap-4 shrink-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl font-black text-stone-900 dark:text-stone-100 flex items-center gap-1">
                      <Hash className="w-6 h-6 text-rose-600 dark:text-rose-500" />
                      {activeTag.name}
                    </span>
                    <span className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-bold px-2 py-0.5 rounded-md border border-stone-200 dark:border-stone-700">
                      共 {activeStats?.count || 0} 个选题
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-3">
                    <span>累计产出文案：<strong className="text-stone-800 dark:text-stone-200">{activeStats?.wordsTotal || 0} 字</strong></span>
                    <span>•</span>
                    <span>平均故事评分：<strong className="text-stone-800 dark:text-stone-200">{activeStats?.avgScore || 0} / 10分</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(activeTag)}
                    className="flex items-center gap-1 text-xs font-semibold text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>编辑标签</span>
                  </button>

                  <button
                    onClick={() => onQuickCreateTopicInTag(activeTag.name)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 px-3.5 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>为此赛道新建选题</span>
                  </button>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="px-6 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/90 flex items-center gap-2 shrink-0 overflow-x-auto">
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
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      topicStatusFilter === tab.id
                        ? 'bg-stone-900 dark:bg-rose-600 text-white font-semibold shadow-xs'
                        : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700'
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
                      className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 space-y-3 shadow-subtle hover:border-stone-400/80 dark:hover:border-stone-600 transition-all cursor-pointer flex flex-col justify-between group"
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
                          <p className="text-xs text-stone-600 dark:text-stone-300 line-clamp-2 leading-relaxed bg-stone-50 dark:bg-stone-800/60 p-2.5 rounded-lg border border-stone-100 dark:border-stone-800">
                            {topic.summary}
                          </p>
                        )}

                        {/* Next Action */}
                        {topic.next_action && (
                          <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-950/40 px-2.5 py-1 rounded-md border border-rose-200/60 dark:border-rose-900/60 flex items-center gap-1.5 font-medium truncate">
                            <span className="shrink-0 font-bold">下一步:</span>
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

                  {activeTagTopics.length === 0 && (
                    <div className="col-span-full py-16 text-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-2xl bg-white dark:bg-stone-900 space-y-3">
                      <FolderKanban className="w-10 h-10 text-stone-300 dark:text-stone-600 mx-auto" />
                      <div className="text-sm font-bold text-stone-700 dark:text-stone-300">该赛道下暂无选题</div>
                      <p className="text-xs text-stone-400 dark:text-stone-500 max-w-sm mx-auto">
                        点击下方按钮立即为此赛道创建第一个叙事选题
                      </p>
                      <button
                        onClick={() => onQuickCreateTopicInTag(activeTag.name)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/70 px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>立即新建选题</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-stone-400 dark:text-stone-500 space-y-3">
              <Compass className="w-12 h-12 text-stone-300 dark:text-stone-600" />
              <div className="text-base font-bold text-stone-700 dark:text-stone-300">暂无选中的赛道标签</div>
              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-stone-900 dark:bg-rose-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                创建第一个标签
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit / Create Tag Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTag ? `编辑标签：#${editingTag.name}` : '新建创作赛道标签'}
        subtitle="为叙事类视频分类，沉淀同一赛道的选题资产"
        maxWidth="sm"
      >
        <form onSubmit={handleSaveTagSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800 dark:text-stone-200">
              标签名称 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-stone-400 dark:text-stone-500 font-bold">#</span>
              <input
                type="text"
                required
                autoFocus
                placeholder="例如：网红翻车、荒诞事件、主播纪实..."
                value={tagNameInput}
                onChange={(e) => setTagNameInput(e.target.value)}
                className="w-full pl-7 pr-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-white dark:focus:bg-stone-800 focus:border-stone-900 dark:focus:border-stone-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800 dark:text-stone-200">主题色彩</label>
            <div className="grid grid-cols-3 gap-2">
              {TAG_COLOR_OPTIONS.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setTagColorInput(c.id)}
                  className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
                    tagColorInput === c.id
                      ? `${c.bg} ${c.border} font-bold ring-2 ring-stone-900/20 dark:ring-stone-400/40`
                      : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${c.dot}`} />
                  <span className="text-stone-800 dark:text-stone-200">{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!tagNameInput.trim()}
              className="px-4 py-2 text-xs bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer transition-colors"
            >
              {editingTag ? '保存修改' : '创建标签'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingTag}
        onClose={() => setDeletingTag(null)}
        title="确认删除赛道标签？"
        subtitle={`将从全局标签库中移除 #${deletingTag?.name}`}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-3 rounded-lg">
            ⚠️ 删除标签不会删除关联的选题卡片，但会从所有打了该标签的选题中解除该标签关联。
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setDeletingTag(null)}
              className="px-4 py-2 text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer transition-colors"
            >
              确认删除
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
