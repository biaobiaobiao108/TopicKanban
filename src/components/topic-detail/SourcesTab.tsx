import React, { useRef, useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Source, VerificationStatus, PlatformType, DatePrecision } from '../../types';
import { VerificationBadge, PlatformBadge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import {
  Plus,
  ExternalLink,
  Trash2,
  Edit2,
  Search,
  Copy,
  Check,
  Calendar,
  Sparkles,
  X,
  RefreshCw,
  LayoutGrid,
  Clock,
  ArrowDownUp,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { parseClientMetadata } from '../../lib/clientUrlParser';
import { copyTextToClipboard } from '../../lib/clipboard';
import { sanitizeExternalHttpUrl } from '../../lib/urlSafety';
import { useToast } from '../ui/Toast';

interface SourcesTabProps {
  topicId: string;
  sources: Source[];
  onSaveSource: (source: Partial<Source> & { topic_id: string; title: string }) => Promise<void>;
  onDeleteSource: (sourceId: string) => Promise<void>;
  onReorderSources?: (topicId: string, sources: Source[]) => Promise<void>;
}

const PLATFORM_OPTIONS: { value: PlatformType | 'all'; label: string }[] = [
  { value: 'all', label: '全部平台' },
  { value: 'bilibili', label: 'Bilibili' },
  { value: 'douyin', label: '抖音' },
  { value: 'weibo', label: '微博' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'zhihu', label: '知乎' },
  { value: 'wechat', label: '微信' },
  { value: 'kuaishou', label: '快手' },
  { value: 'news', label: '新闻媒体' },
  { value: 'live', label: '直播切片' },
  { value: 'other', label: '其他' },
];

function inferDatePrecision(dateStr: string): DatePrecision {
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '待考证' || trimmed === '未知') return 'unknown';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) return 'exact';
  if (/^\d{4}-\d{1,2}$/.test(trimmed)) return 'year_month';
  if (/^\d{4}$/.test(trimmed)) return 'year';
  return 'exact';
}

function formatEventDate(dateStr?: string, precision?: DatePrecision): string {
  if (!dateStr) return '待考证';
  const trimmed = dateStr.trim();
  if (!trimmed || precision === 'unknown' || trimmed === '待考证' || trimmed === '未知') {
    return '待考证';
  }
  if (precision === 'year' || /^\d{4}$/.test(trimmed)) return `${trimmed} 年`;
  if (precision === 'year_month' || /^\d{4}-\d{1,2}$/.test(trimmed)) return `${trimmed} 月`;
  return trimmed;
}

interface SortableTimelineItemProps {
  source: Source;
  index: number;
  onEdit: (s: Source) => void;
  onDelete: (s: Source) => void;
  onCycleVerification: (s: Source) => void;
  onCopyUrl: (id: string, url: string) => void;
  copiedId: string | null;
  selected: boolean;
  onToggleSelected: (id: string) => void;
}

const SortableTimelineItem: React.FC<SortableTimelineItemProps> = ({
  source,
  index,
  onEdit,
  onDelete,
  onCycleVerification,
  onCopyUrl,
  copiedId,
  selected,
  onToggleSelected,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const safeUrl = sanitizeExternalHttpUrl(source.url);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? 'opacity-50 z-30 scale-[1.01]' : 'opacity-100'}`}
    >
      {/* Timeline Node Dot on Left Axis */}
      <div className="absolute -left-6 sm:-left-8 top-4 w-6 h-6 rounded-full bg-[var(--surface)] border-2 border-[var(--accent)] flex items-center justify-center text-[10px] font-bold text-[var(--accent-dark)] shadow-2xs z-10 select-none">
        {index + 1}
      </div>

      {/* Main Timeline Card */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-4 sm:p-5 shadow-subtle hover:shadow-card hover:-translate-y-0.5 transition-all space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelected(source.id)}
              aria-label={`选择素材「${source.title}」`}
              className="h-4 w-4 rounded accent-[var(--accent)] cursor-pointer"
            />
            {/* Drag Handle */}
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="p-1 -ml-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 cursor-grab active:cursor-grabbing rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="拖拽调整顺序"
            >
              <GripVertical className="w-4 h-4" />
            </button>

            {/* Date Badge */}
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 bg-[var(--accent-soft)] text-[var(--accent-dark)]">
              📅 {formatEventDate(source.event_date, source.date_precision)}
            </span>

            {/* Platform Badge */}
            <PlatformBadge platform={source.platform} />

            {/* Verification Badge */}
            <button
              type="button"
              onClick={() => onCycleVerification(source)}
              className="cursor-pointer"
              aria-label="切换核实状态"
            >
              <VerificationBadge status={source.verification_status} />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 text-stone-400">
            {safeUrl && (
              <>
                <button
                  type="button"
                  onClick={() => onCopyUrl(source.id, source.url)}
                  className="p-1 hover:text-stone-700 dark:hover:text-stone-300 rounded cursor-pointer"
                  aria-label="复制链接"
                >
                  {copiedId === source.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:text-[var(--accent)] rounded"
                  aria-label="打开来源网页"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </>
            )}
            <button
              type="button"
              onClick={() => onEdit(source)}
              className="p-1 hover:text-stone-700 dark:hover:text-stone-300 rounded cursor-pointer"
              aria-label="编辑素材"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(source)}
              className="p-1 hover:text-red-600 rounded cursor-pointer"
              aria-label="删除素材"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-sm sm:text-base text-[var(--ink)] leading-snug">
          {source.title}
        </h3>

        {/* Content Snippet */}
        {source.content && (
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed bg-[var(--canvas)]/70 p-3 rounded-xl">
            {source.content}
          </p>
        )}

        {/* Note / Tip */}
        {source.notes && (
          <div className="text-[11px] text-stone-600 dark:text-stone-400 bg-amber-500/[0.04] dark:bg-amber-950/30 px-2.5 py-1 rounded-lg border border-amber-500/20 truncate">
            💡 {source.notes}
          </div>
        )}

        {/* Author & Footer */}
        {source.author && (
          <div className="text-[11px] text-stone-400 dark:text-stone-500 font-medium">
            原作者：@{source.author}
          </div>
        )}
      </div>
    </div>
  );
};

export const SourcesTab: React.FC<SourcesTabProps> = ({
  topicId,
  sources,
  onSaveSource,
  onDeleteSource,
  onReorderSources,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'timeline'>('cards');
  const [timelineSortDirection, setTimelineSortDirection] = useState<'asc' | 'desc'>('asc');
  const [undatedCollapsed, setUndatedCollapsed] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<PlatformType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<VerificationStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [smartPasteInput, setSmartPasteInput] = useState('');
  const [isParsingUrl, setIsParsingUrl] = useState(false);
  const parseRequestIdRef = useRef(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
  const [deletingSource, setDeletingSource] = useState<Source | null>(null);
  const { showToast } = useToast();

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('bilibili');
  const [author, setAuthor] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('confirmed');
  const [notes, setNotes] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [datePrecision, setDatePrecision] = useState<DatePrecision>('unknown');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sensors for DnD in timeline
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const openAddModal = () => {
    setEditingSource(null);
    setTitle('');
    setContent('');
    setUrl('');
    setPlatform('bilibili');
    setAuthor('');
    setPublishedAt('');
    setVerificationStatus('confirmed');
    setNotes('');
    setEventDate('');
    setDatePrecision('unknown');
    setSmartPasteInput('');
    setIsModalOpen(true);
  };

  const openEditModal = (s: Source, focusDate = false) => {
    setEditingSource(s);
    setTitle(s.title);
    setContent(s.content);
    setUrl(s.url);
    setPlatform(s.platform);
    setAuthor(s.author);
    setPublishedAt(s.published_at);
    setVerificationStatus(s.verification_status);
    setNotes(s.notes);
    setEventDate(s.event_date || '');
    setDatePrecision(s.date_precision || (s.event_date ? inferDatePrecision(s.event_date) : 'unknown'));
    setSmartPasteInput('');
    setIsModalOpen(true);
    if (focusDate) {
      setTimeout(() => {
        const el = document.getElementById('source-event-date');
        el?.focus();
      }, 100);
    }
  };

  const handleEventDateChange = (val: string) => {
    setEventDate(val);
    const inferred = inferDatePrecision(val);
    setDatePrecision(inferred);
  };

  const handleSmartParse = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    const requestId = ++parseRequestIdRef.current;
    setIsParsingUrl(true);
    try {
      const meta = await parseClientMetadata(trimmed);
      if (requestId !== parseRequestIdRef.current) return;
      if (meta.title) setTitle(meta.title);
      if (meta.author) setAuthor(meta.author);
      if (meta.content) setContent(meta.content);
      if (meta.published_at) {
        setPublishedAt(meta.published_at);
        if (!eventDate) {
          setEventDate(meta.published_at);
          setDatePrecision(inferDatePrecision(meta.published_at));
        }
      }
      if (meta.platform) setPlatform(meta.platform);
      if (meta.url) setUrl(meta.url);
    } catch {
      // ignore
    } finally {
      if (requestId === parseRequestIdRef.current) setIsParsingUrl(false);
    }
  };

  const handleCycleVerification = async (s: Source) => {
    const nextStatus: VerificationStatus =
      s.verification_status === 'confirmed'
        ? 'unverified'
        : s.verification_status === 'unverified'
        ? 'rejected'
        : 'confirmed';
    await onSaveSource({
      id: s.id,
      topic_id: topicId,
      title: s.title,
      verification_status: nextStatus,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const normalizedUrl = url.trim().toLowerCase().replace(/\/$/, '');
    const duplicate = sources.find((source) => source.id !== editingSource?.id && (
      (normalizedUrl && source.url.trim().toLowerCase().replace(/\/$/, '') === normalizedUrl)
      || source.title.trim().toLowerCase() === title.trim().toLowerCase()
    ));
    if (duplicate) showToast({ message: `检测到可能重复的素材：「${duplicate.title}」，仍会继续保存`, tone: 'info' });

    setIsSubmitting(true);
    try {
      await onSaveSource({
        id: editingSource?.id,
        topic_id: topicId,
        title: title.trim(),
        content: content.trim(),
        url: url.trim(),
        platform,
        author: author.trim(),
        published_at: publishedAt.trim(),
        verification_status: verificationStatus,
        notes: notes.trim(),
        event_date: eventDate.trim() || undefined,
        date_precision: datePrecision,
      });
      setIsModalOpen(false);
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelected = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    setIsDeleteSelectedModalOpen(true);
  };

  const copyUrl = async (id: string, link: string) => {
    const copied = await copyTextToClipboard(link);
    if (!copied) {
      showToast({ message: '无法复制链接，请检查浏览器剪贴板权限后重试', tone: 'info' });
      return;
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const q = searchQuery.toLowerCase().trim();
  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      if (filterPlatform !== 'all' && s.platform !== filterPlatform) return false;
      if (filterStatus !== 'all' && s.verification_status !== filterStatus) return false;
      if (q) {
        const matchTitle = s.title.toLowerCase().includes(q);
        const matchContent = (s.content || '').toLowerCase().includes(q);
        const matchAuthor = (s.author || '').toLowerCase().includes(q);
        const matchNotes = (s.notes || '').toLowerCase().includes(q);
        const matchUrl = (s.url || '').toLowerCase().includes(q);
        const matchDate = (s.event_date || '').toLowerCase().includes(q);
        if (!matchTitle && !matchContent && !matchAuthor && !matchNotes && !matchUrl && !matchDate) return false;
      }
      return true;
    });
  }, [sources, filterPlatform, filterStatus, q]);

  // Partition sources into timed and undated
  const { timedSources, undatedSources } = useMemo(() => {
    const timed: Source[] = [];
    const undated: Source[] = [];

    for (const s of filteredSources) {
      const date = s.event_date?.trim();
      const hasValidDate = Boolean(date && s.date_precision !== 'unknown' && date !== '待考证' && date !== '未知');
      if (hasValidDate) {
        timed.push(s);
      } else {
        undated.push(s);
      }
    }

    timed.sort((a, b) => {
      const dateA = a.event_date?.trim() || '';
      const dateB = b.event_date?.trim() || '';
      const cmp = dateA.localeCompare(dateB);
      if (cmp !== 0) return timelineSortDirection === 'asc' ? cmp : -cmp;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return { timedSources: timed, undatedSources: undated };
  }, [filteredSources, timelineSortDirection]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderSources) return;

    const oldIndex = timedSources.findIndex((item) => item.id === active.id);
    const newIndex = timedSources.findIndex((item) => item.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrdered = arrayMove(timedSources, oldIndex, newIndex);
      await onReorderSources(topicId, [...newOrdered, ...undatedSources]);
    }
  };

  return (
    <div className="py-4 sm:py-6 space-y-5">
      {/* Header & Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-[var(--surface)] p-4 sm:p-5 rounded-2xl border border-[var(--line)] shadow-subtle transition-colors">
        <div className="flex items-center gap-2.5 flex-wrap flex-1">
          {/* View Mode Toggle */}
          <div className="inline-flex items-center rounded-xl bg-stone-500/[0.04] p-1 border border-[var(--line)]/60">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-[var(--surface)] text-[var(--accent-dark)] dark:text-[var(--accent)] font-semibold shadow-2xs'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>卡片列表</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-[var(--surface)] text-[var(--accent-dark)] dark:text-[var(--accent)] font-semibold shadow-2xs'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>故事时间轴</span>
              {timedSources.length > 0 && (
                <span className="text-[10px] font-mono opacity-80 tabular-nums">({timedSources.length})</span>
              )}
            </button>
          </div>

          <div className="h-5 w-px bg-stone-200 dark:bg-stone-700 mx-0.5 hidden sm:block" />

          {/* Real-time Search Input */}
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
            <input
              type="text"
              id="sources-search"
              name="sources_search"
              aria-label="搜索素材"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索素材标题、内容、备忘、日期..."
              className="w-full pl-9 pr-7 py-1.5 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700 rounded-xl text-xs text-[var(--ink)] placeholder:text-stone-400 focus:bg-[var(--surface)] dark:focus:bg-stone-800 focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="清除素材搜索"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Platform Filter */}
          <CustomSelect
            value={filterPlatform}
            onChange={(val) => setFilterPlatform(val as PlatformType | 'all')}
            options={PLATFORM_OPTIONS}
            ariaLabel="平台筛选"
            buttonClassName="py-1.5 text-xs bg-stone-500/[0.03] dark:bg-stone-800 border-stone-200/70 dark:border-stone-700 rounded-xl"
          />

          {/* Verification Status Filter */}
          <CustomSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as VerificationStatus | 'all')}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'confirmed', label: '已确认', dot: 'bg-emerald-500' },
              { value: 'unverified', label: '待核实', dot: 'bg-amber-500' },
              { value: 'rejected', label: '不采用', dot: 'bg-stone-400' },
            ]}
            ariaLabel="可信度筛选"
            buttonClassName="py-1.5 text-xs bg-stone-500/[0.03] dark:bg-stone-800 border-stone-200/70 dark:border-stone-700 rounded-xl"
          />

          {/* Timeline Sort Toggle (only in timeline view) */}
          {viewMode === 'timeline' && (
            <button
              type="button"
              onClick={() => setTimelineSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-stone-200/70 dark:border-stone-700 bg-stone-500/[0.03] dark:bg-stone-800 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
              aria-label="切换时间排序"
            >
              <ArrowDownUp className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{timelineSortDirection === 'asc' ? '正序 (故事线)' : '倒序 (最新在前)'}</span>
            </button>
          )}
        </div>

        {/* Right Action: Add Source Button & Batch Delete */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              className="flex items-center gap-1 rounded-xl bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>删除选中 ({selectedIds.size})</span>
            </button>
          )}

          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>添加素材</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: Cards View */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSources.map((s) => {
            const safeUrl = sanitizeExternalHttpUrl(s.url);
            return (
              <div
                key={s.id}
                className="bg-[var(--surface)] p-4 sm:p-5 rounded-2xl border border-[var(--line)] shadow-subtle hover:shadow-card hover:-translate-y-0.5 transition-all space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  {/* Top Bar: Checkbox + Badges + Actions */}
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelected(s.id)}
                        aria-label={`选择素材「${s.title}」`}
                        className="h-3.5 w-3.5 rounded accent-[var(--accent)] cursor-pointer"
                      />
                      <PlatformBadge platform={s.platform} />
                      <button
                        type="button"
                        onClick={() => handleCycleVerification(s)}
                        className="cursor-pointer"
                        aria-label="切换核实状态"
                      >
                        <VerificationBadge status={s.verification_status} />
                      </button>
                      {s.event_date && (
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-dark)]">
                          📅 {formatEventDate(s.event_date, s.date_precision)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-stone-400">
                      <button
                        type="button"
                        onClick={() => openEditModal(s)}
                        className="p-1 hover:text-stone-700 dark:hover:text-stone-300 rounded cursor-pointer"
                        aria-label="编辑素材"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingSource(s)}
                        className="p-1 hover:text-red-600 rounded cursor-pointer"
                        aria-label="删除素材"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="font-semibold text-sm sm:text-base text-[var(--ink)] leading-snug line-clamp-2">
                    {s.title}
                  </h3>

                  {/* Content snippet */}
                  {s.content && (
                    <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed line-clamp-3 bg-[var(--canvas)]/70 p-2.5 rounded-xl">
                      {s.content}
                    </p>
                  )}

                  {/* Notes / Tips */}
                  {s.notes && (
                    <div className="text-[11px] text-stone-600 dark:text-stone-400 bg-amber-500/[0.04] dark:bg-amber-950/30 px-2.5 py-1 rounded-lg border border-amber-500/20 truncate">
                      💡 {s.notes}
                    </div>
                  )}
                </div>

                {/* Bottom Meta & Links */}
                <div className="pt-2.5 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between flex-wrap gap-1.5 text-[11px] text-stone-400 dark:text-stone-500">
                  <div className="flex items-center gap-2 truncate">
                    {s.author && <span className="truncate max-w-[90px] font-semibold">@{s.author}</span>}
                    {s.published_at && <span>{s.published_at}</span>}
                  </div>

                  {safeUrl && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyUrl(s.id, s.url)}
                        className="hover:text-stone-700 dark:hover:text-stone-300 p-0.5 cursor-pointer"
                        aria-label="复制链接"
                      >
                        {copiedId === s.id ? (
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[var(--accent)] hover:text-[var(--accent-dark)] font-semibold"
                      >
                        <span>来源</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredSources.length === 0 && (
            <div className="col-span-full p-12 text-center border-2 border-dashed border-[var(--line)] rounded-2xl bg-[var(--surface)] text-stone-400 dark:text-stone-500 space-y-2">
              <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">
                {searchQuery ? `未找到包含「${searchQuery}」的素材记录` : '暂无素材记录'}
              </p>
              <p className="text-xs text-stone-400 dark:text-stone-500">
                点击右上角「+ 添加素材」，支持一键智能抓取 B站/YouTube 视频信息
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: Timeline View */}
      {viewMode === 'timeline' && (
        <div className="space-y-6">
          {/* Main Vertical Timeline List with DnD */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={timedSources.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="relative pl-6 sm:pl-8 space-y-4 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-stone-200 dark:before:bg-stone-800 transition-colors">
                {timedSources.map((source, idx) => (
                  <SortableTimelineItem
                    key={source.id}
                    source={source}
                    index={idx}
                    onEdit={openEditModal}
                    onDelete={(s) => setDeletingSource(s)}
                    onCycleVerification={handleCycleVerification}
                    onCopyUrl={copyUrl}
                    copiedId={copiedId}
                    selected={selectedIds.has(source.id)}
                    onToggleSelected={toggleSelected}
                  />
                ))}

                {timedSources.length === 0 && (
                  <div className="p-8 text-center border-2 border-dashed border-[var(--line)] rounded-xl bg-[var(--surface)] text-stone-400 dark:text-stone-500 space-y-2">
                    <Clock className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-600 stroke-[1.5]" />
                    <div className="text-sm font-medium">暂无定时的素材节点</div>
                    <p className="text-xs text-stone-400 dark:text-stone-500">
                      编辑素材并设定「发生日期」，即可按时间先后顺序在此自动串联故事线
                    </p>
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>

          {/* Undated Sources Collapsible Pool */}
          {undatedSources.length > 0 && (
            <div className="border border-[var(--line)] rounded-2xl bg-[var(--surface)] overflow-hidden shadow-subtle">
              <button
                type="button"
                onClick={() => setUndatedCollapsed((prev) => !prev)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-stone-500/[0.02] cursor-pointer transition-colors"
                aria-expanded={!undatedCollapsed}
              >
                <div className="flex items-center gap-2">
                  {undatedCollapsed ? <ChevronRight className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                  <span className="text-xs font-bold text-[var(--ink)]">待定时间素材</span>
                  <span className="px-2 py-0.5 rounded-full bg-stone-500/10 text-stone-600 dark:text-stone-400 font-mono text-[11px] font-semibold">
                    {undatedSources.length} 条
                  </span>
                </div>
                <span className="text-[11px] text-[var(--ink-muted)]">
                  {undatedCollapsed ? '展开查看' : '点击收起'}
                </span>
              </button>

              {!undatedCollapsed && (
                <div className="p-4 pt-0 border-t border-[var(--line)]/50 divide-y divide-[var(--line)]/50">
                  {undatedSources.map((source) => (
                    <div key={source.id} className="py-3 first:pt-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <PlatformBadge platform={source.platform} />
                          <h4 className="text-xs font-semibold text-[var(--ink)] truncate max-w-md">
                            {source.title}
                          </h4>
                          {source.author && (
                            <span className="text-[11px] text-stone-400">@{source.author}</span>
                          )}
                        </div>
                        {source.content && (
                          <p className="text-[11px] text-stone-500 line-clamp-1">
                            {source.content}
                          </p>
                        )}
                      </div>

                      {/* Quick Assign Date Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(source, true)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line)] hover:border-[var(--accent)] bg-[var(--canvas)] hover:bg-[var(--accent-soft)] text-xs text-[var(--accent-dark)] dark:text-[var(--accent)] font-medium transition-all cursor-pointer shadow-2xs"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>设定时间</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(source)}
                          className="p-1 hover:text-stone-700 dark:hover:text-stone-300 rounded cursor-pointer text-stone-400"
                          aria-label="编辑素材"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSource(source)}
                          className="p-1 hover:text-red-600 rounded cursor-pointer text-stone-400"
                          aria-label="删除素材"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Source Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSource ? '编辑素材资料' : '录入新素材'}
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Smart Paste / Parse helper */}
          {!editingSource && (
            <div className="p-3 bg-[var(--accent-soft)] rounded-xl border border-[var(--line)] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[var(--accent-dark)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Bilibili / YouTube 智能识别</span>
                </span>
                {isParsingUrl && (
                  <span className="text-[11px] text-[var(--accent)] font-medium flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>正在解析元数据...</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="source-smart-paste"
                  name="smart_source_url"
                  type="text"
                  aria-label="粘贴 B站或 YouTube 链接以识别素材"
                  autoComplete="url"
                  inputMode="url"
                  value={smartPasteInput}
                  onChange={(e) => setSmartPasteInput(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted) {
                      setSmartPasteInput(pasted);
                      void handleSmartParse(pasted);
                    }
                  }}
                  placeholder="粘贴 B站（含 b23.tv）或 YouTube 链接，自动拉取标题、UP主与简介..."
                  className="flex-1 px-3 py-1.5 bg-stone-500/[0.03] dark:bg-stone-900 border border-[var(--line)] dark:border-stone-700 rounded-lg text-xs text-[var(--ink)] placeholder:text-stone-400 focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)]"
                />
                {smartPasteInput && (
                  <button
                    type="button"
                    onClick={() => void handleSmartParse(smartPasteInput)}
                    disabled={isParsingUrl}
                    className="px-2.5 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0 disabled:opacity-50 cursor-pointer shadow-2xs"
                    aria-label="重新识别抓取"
                  >
                    <RefreshCw className={`w-3 h-3 ${isParsingUrl ? 'animate-spin' : ''}`} />
                    <span>识别</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="source-title" className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              素材标题 <span className="text-stone-400">*</span>
            </label>
            <input
              id="source-title"
              name="source_title"
              type="text"
              required
              autoComplete="off"
              placeholder="例如：良子出征誓师直播录屏"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-[var(--ink)] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-[var(--surface)] dark:focus:bg-stone-800 focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          {/* Event Date & Date Precision for Timeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="source-event-date" className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                故事发生时间 (时间轴排序依据)
              </label>
              <input
                id="source-event-date"
                name="source_event_date"
                type="text"
                autoComplete="off"
                placeholder="例如：2026-07-28 / 2026-05 / 2026"
                value={eventDate}
                onChange={(e) => handleEventDateChange(e.target.value)}
                className="w-full px-3 py-2 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-[var(--ink)] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-[var(--surface)] dark:focus:bg-stone-800 focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            <div>
              <label id="source-precision-label" className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                时间精度
              </label>
              <CustomSelect
                value={datePrecision}
                onChange={(val) => setDatePrecision(val as DatePrecision)}
                ariaLabel="时间精度"
                ariaLabelledBy="source-precision-label"
                className="w-full"
                buttonClassName="w-full justify-between py-2 text-sm bg-stone-500/[0.03] dark:bg-stone-800 border-stone-300 dark:border-stone-700 rounded-lg"
                options={[
                  { value: 'exact', label: '精确到日 (YYYY-MM-DD)' },
                  { value: 'year_month', label: '精确到月 (YYYY-MM)' },
                  { value: 'year', label: '精确到年 (YYYY)' },
                  { value: 'unknown', label: '待考证 / 未知时间' },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label id="source-platform-label" className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">来源平台</label>
              <CustomSelect
                value={platform}
                onChange={(val) => setPlatform(val as PlatformType)}
                ariaLabel="来源平台"
                ariaLabelledBy="source-platform-label"
                className="w-full"
                buttonClassName="w-full justify-between py-2 text-sm bg-stone-500/[0.03] dark:bg-stone-800 border-stone-300 dark:border-stone-700 rounded-lg"
                options={[
                  { value: 'bilibili', label: 'Bilibili' },
                  { value: 'douyin', label: '抖音' },
                  { value: 'kuaishou', label: '快手' },
                  { value: 'weibo', label: '微博' },
                  { value: 'xiaohongshu', label: '小红书' },
                  { value: 'wechat', label: '微信公众号' },
                  { value: 'zhihu', label: '知乎' },
                  { value: 'youtube', label: 'YouTube' },
                  { value: 'news', label: '新闻媒体' },
                  { value: 'live', label: '直播切片' },
                  { value: 'other', label: '其他' },
                ]}
              />
            </div>

            <div>
              <label htmlFor="source-author" className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">原作者 / 发布者</label>
              <input
                id="source-author"
                name="source_author"
                type="text"
                autoComplete="name"
                placeholder="例如：良子官方录播组"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-[var(--ink)] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-[var(--surface)] dark:focus:bg-stone-800 focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="source-url" className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">来源 URL 链接</label>
              <input
                id="source-url"
                name="source_url"
                type="url"
                autoComplete="url"
                placeholder="https://www.bilibili.com/video/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (pasted && !title.trim()) {
                    void handleSmartParse(pasted);
                  }
                }}
                className="w-full px-3 py-2 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-[var(--ink)] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-[var(--surface)] dark:focus:bg-stone-800 focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            <div>
              <label id="source-verification-label" className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">可信度状态</label>
              <CustomSelect
                value={verificationStatus}
                onChange={(val) => setVerificationStatus(val as VerificationStatus)}
                ariaLabel="可信度状态"
                ariaLabelledBy="source-verification-label"
                className="w-full"
                buttonClassName="w-full justify-between py-2 text-sm bg-stone-500/[0.03] dark:bg-stone-800 border-stone-300 dark:border-stone-700 rounded-lg"
                options={[
                  { value: 'confirmed', label: '已确认 (多方可靠来源)', dot: 'bg-emerald-500' },
                  { value: 'unverified', label: '待核实 (信息不足)', dot: 'bg-amber-500' },
                  { value: 'rejected', label: '不采用 (已证伪或无价值)', dot: 'bg-stone-400' },
                ]}
              />
            </div>
          </div>

          <div>
            <label htmlFor="source-content" className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">内容摘要 / 关键发言</label>
            <textarea
              id="source-content"
              name="source_content"
              autoComplete="off"
              rows={3}
              placeholder="提取原视频或文章中的关键信息、时间码（如04:15处金句）或关键截图要点..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-[var(--ink)] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-[var(--surface)] dark:focus:bg-stone-800 focus:border-[var(--accent)] focus:outline-none resize-none"
            />
          </div>

          <div>
            <label htmlFor="source-notes" className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">使用备注与提示</label>
            <input
              id="source-notes"
              name="source_notes"
              type="text"
              autoComplete="off"
              placeholder="例如：可用作第一章转折画面"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-stone-500/[0.03] dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-[var(--ink)] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:bg-[var(--surface)] dark:focus:bg-stone-800 focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

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
              className="px-5 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white rounded-lg font-medium cursor-pointer transition-colors disabled:opacity-50"
            >
              {editingSource ? '更新素材' : '添加素材'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteSelectedModalOpen}
        onClose={() => setIsDeleteSelectedModalOpen(false)}
        onConfirm={async () => {
          for (const id of selectedIds) {
            await onDeleteSource(id);
          }
          const count = selectedIds.size;
          setSelectedIds(new Set());
          setIsDeleteSelectedModalOpen(false);
          showToast({ message: `已删除 ${count} 条素材资料`, tone: 'info' });
        }}
        title="批量删除素材资料"
        description={`确定要删除选中的 ${selectedIds.size} 条素材资料吗？此操作无法撤销。`}
        confirmText="批量删除"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={Boolean(deletingSource)}
        onClose={() => setDeletingSource(null)}
        onConfirm={async () => {
          if (!deletingSource) return;
          await onDeleteSource(deletingSource.id);
          showToast({ message: `已删除素材「${deletingSource.title}」`, tone: 'info' });
          setDeletingSource(null);
        }}
        title="删除素材资料"
        description={deletingSource ? `确定要删除素材「${deletingSource.title}」吗？此操作无法撤销。` : ''}
        confirmText="删除素材"
        tone="danger"
      />
    </div>
  );
};
