import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  ChevronUp,
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

const SOURCES_PAGE_SIZE = 24;

function SourcePageControls({
  page,
  total,
  label,
  onPageChange,
}: {
  page: number;
  total: number;
  label: string;
  onPageChange: (nextPage: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / SOURCES_PAGE_SIZE));
  if (totalPages <= 1) return null;

  const firstItem = (page - 1) * SOURCES_PAGE_SIZE + 1;
  const lastItem = Math.min(page * SOURCES_PAGE_SIZE, total);

  return (
    <nav aria-label={`${label}分页`} className="flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-3 text-xs text-ink-muted">
      <span aria-live="polite">显示 {firstItem}-{lastItem} / 共 {total} 条</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`${label}上一页`}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="min-h-9 rounded-xl border border-line bg-surface px-3 font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
        >
          上一页
        </button>
        <span className="min-w-14 text-center font-mono tabular-nums">{page} / {totalPages}</span>
        <button
          type="button"
          aria-label={`${label}下一页`}
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="min-h-9 rounded-xl border border-line bg-surface px-3 font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </nav>
  );
}

function inferDatePrecision(dateStr: string): DatePrecision {
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '待考证' || trimmed === '未知') return 'unknown';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) return 'exact';
  if (/^\d{4}-\d{1,2}$/.test(trimmed)) return 'year_month';
  if (/^\d{4}$/.test(trimmed)) return 'year';
  return 'exact';
}

export type TimelineSortMode = 'date-asc' | 'date-desc' | 'manual';

export function normalizeTimelineDate(date?: string): string | null {
  const match = date?.trim().match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 0;
  const day = match[3] ? Number(match[3]) : 0;
  if (month > 12 || day > 31 || (match[2] && month < 1) || (match[3] && day < 1)) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function reorderVisibleSourcesInFullList(sources: Source[], reorderedVisible: Source[]): Source[] {
  const reorderedIds = new Set(reorderedVisible.map((source) => source.id));
  const fullOrder = [...sources].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  let nextVisibleIndex = 0;
  return fullOrder.map((source) => (
    reorderedIds.has(source.id) ? reorderedVisible[nextVisibleIndex++] || source : source
  ));
}

export function canReorderTimeline(mode: TimelineSortMode): boolean {
  return mode === 'manual';
}

export function shouldAutofillEventDate(currentValue: string, wasTouched: boolean): boolean {
  return !wasTouched && !currentValue.trim();
}

export function sortTimelineSources(sources: Source[], mode: TimelineSortMode): Source[] {
  return [...sources].sort((a, b) => {
    if (mode === 'manual') return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    const dateA = a.event_date?.trim() || '';
    const dateB = b.event_date?.trim() || '';
    const normalizedA = normalizeTimelineDate(dateA) || dateA;
    const normalizedB = normalizeTimelineDate(dateB) || dateB;
    const cmp = normalizedA.localeCompare(normalizedB, undefined, { numeric: true });
    if (cmp !== 0) return mode === 'date-asc' ? cmp : -cmp;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
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
  canReorder: boolean;
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
  canReorder,
  onEdit,
  onDelete,
  onCycleVerification,
  onCopyUrl,
  copiedId,
  selected,
  onToggleSelected,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source.id, disabled: !canReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const safeUrl = sanitizeExternalHttpUrl(source.url);
  const hasLongDetails = source.title.length > 64
    || (source.content?.length || 0) > 220
    || (source.notes?.length || 0) > 100;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="source-timeline-item"
      className={`relative group w-full ${isDragging ? 'opacity-50 z-30 scale-[1.01]' : 'opacity-100'}`}
    >
      {/* Timeline Node Dot on Left Axis */}
      <div className="absolute -left-6 sm:-left-8 top-4 w-6 h-6 rounded-full bg-surface border-2 border-accent flex items-center justify-center text-3xs font-bold text-accent-dark shadow-2xs z-10 select-none">
        {index + 1}
      </div>

      {/* Main Timeline Card */}
      <div className="bg-surface rounded-2xl border border-line p-4 sm:p-5 shadow-subtle hover:shadow-card hover:-translate-y-0.5 transition-all space-y-2.5">
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
              {...(canReorder ? attributes : {})}
              {...(canReorder ? listeners : {})}
              disabled={!canReorder}
              className={`p-1 -ml-1 rounded-lg transition-colors ${canReorder ? 'text-ink-muted hover:text-ink cursor-grab active:cursor-grabbing hover:bg-control' : 'text-ink-faint cursor-not-allowed'}`}
              aria-label={canReorder ? '拖拽调整顺序' : '切换至手动顺序后可拖拽'}
            >
              <GripVertical className="w-4 h-4" />
            </button>

            {/* Date Badge */}
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 bg-accent-soft text-accent-dark">
              📅 {formatEventDate(source.event_date ?? undefined, source.date_precision)}
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
          <div className="flex items-center gap-1 text-ink-muted">
            {safeUrl && (
              <>
                <button
                  type="button"
                  onClick={() => onCopyUrl(source.id, source.url)}
                  className="p-1 hover:text-ink rounded cursor-pointer"
                  aria-label="复制链接"
                >
                  {copiedId === source.id ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:text-accent rounded"
                  aria-label="打开来源网页"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </>
            )}
            <button
              type="button"
              onClick={() => onEdit(source)}
              className="p-1 hover:text-ink rounded cursor-pointer"
              aria-label="编辑素材"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(source)}
              className="p-1 hover:text-danger rounded cursor-pointer"
              aria-label="删除素材"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className={`font-semibold text-sm sm:text-base text-ink leading-snug ${isExpanded ? '' : 'line-clamp-2'}`}>
          {source.title}
        </h3>

        {/* Content Snippet */}
        {source.content && (
          <p className={`text-xs text-ink-muted leading-relaxed bg-canvas/70 p-3 rounded-xl ${isExpanded ? '' : 'line-clamp-3'}`}>
            {source.content}
          </p>
        )}

        {/* Note / Tip */}
        {source.notes && (
          <div className={`text-2xs text-ink-muted bg-warning-soft] px-2.5 py-1 rounded-lg border border-warning-soft ${isExpanded ? '' : 'line-clamp-2'}`}>
            💡 {source.notes}
          </div>
        )}

        {hasLongDetails && (
          <button
            type="button"
            onClick={() => setIsExpanded((expanded) => !expanded)}
            aria-expanded={isExpanded}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-accent-dark transition-colors hover:bg-accent-soft"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
            {isExpanded ? '收起详情' : '展开详情'}
          </button>
        )}

        {/* Author & Footer */}
        {source.author && (
          <div className="truncate text-2xs font-medium text-ink-muted">
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
  const [timelineSortMode, setTimelineSortMode] = useState<TimelineSortMode>(() => {
    try {
      const saved = localStorage.getItem(`source_timeline_sort_mode:${topicId}`);
      if (saved === 'date-asc' || saved === 'date-desc' || saved === 'manual') return saved;
    } catch {
      // Keep the default when browser storage is unavailable.
    }
    return 'date-asc';
  });
  const [undatedCollapsed, setUndatedCollapsed] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<PlatformType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<VerificationStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cardPage, setCardPage] = useState(1);
  const [undatedPage, setUndatedPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [smartPasteInput, setSmartPasteInput] = useState('');
  const [isParsingUrl, setIsParsingUrl] = useState(false);
  const parseRequestIdRef = useRef(0);
  const eventDateRef = useRef('');
  const eventDateTouchedRef = useRef(false);
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

  const invalidateSmartParse = () => {
    parseRequestIdRef.current += 1;
    setIsParsingUrl(false);
  };

  const closeSourceModal = () => {
    invalidateSmartParse();
    setIsModalOpen(false);
  };

  const openAddModal = () => {
    invalidateSmartParse();
    setEditingSource(null);
    setTitle('');
    setContent('');
    setUrl('');
    setPlatform('bilibili');
    setAuthor('');
    setPublishedAt('');
    setVerificationStatus('confirmed');
    setNotes('');
    eventDateRef.current = '';
    eventDateTouchedRef.current = false;
    setEventDate('');
    setDatePrecision('unknown');
    setSmartPasteInput('');
    setIsModalOpen(true);
  };

  const openEditModal = (s: Source, focusDate = false) => {
    invalidateSmartParse();
    setEditingSource(s);
    setTitle(s.title);
    setContent(s.content);
    setUrl(s.url);
    setPlatform(s.platform);
    setAuthor(s.author);
    setPublishedAt(s.published_at);
    setVerificationStatus(s.verification_status);
    setNotes(s.notes);
    eventDateRef.current = s.event_date || '';
    eventDateTouchedRef.current = false;
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
    eventDateRef.current = val;
    eventDateTouchedRef.current = true;
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
        if (shouldAutofillEventDate(eventDateRef.current, eventDateTouchedRef.current)) {
          eventDateRef.current = meta.published_at;
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
      closeSourceModal();
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

    return { timedSources: sortTimelineSources(timed, timelineSortMode), undatedSources: undated };
  }, [filteredSources, timelineSortMode]);

  const cardPageCount = Math.max(1, Math.ceil(filteredSources.length / SOURCES_PAGE_SIZE));
  const undatedPageCount = Math.max(1, Math.ceil(undatedSources.length / SOURCES_PAGE_SIZE));
  const currentCardSources = filteredSources.slice((cardPage - 1) * SOURCES_PAGE_SIZE, cardPage * SOURCES_PAGE_SIZE);
  const currentUndatedSources = undatedSources.slice((undatedPage - 1) * SOURCES_PAGE_SIZE, undatedPage * SOURCES_PAGE_SIZE);

  useEffect(() => {
    setCardPage(1);
    setUndatedPage(1);
  }, [filterPlatform, filterStatus, searchQuery]);

  useEffect(() => {
    setCardPage((page) => Math.min(page, cardPageCount));
  }, [cardPageCount]);

  useEffect(() => {
    setUndatedPage((page) => Math.min(page, undatedPageCount));
  }, [undatedPageCount]);

  const cycleTimelineSortMode = () => {
    setTimelineSortMode((current) => {
      const next = current === 'date-asc' ? 'date-desc' : current === 'date-desc' ? 'manual' : 'date-asc';
      try {
        localStorage.setItem(`source_timeline_sort_mode:${topicId}`, next);
      } catch {
        // Sorting remains usable for this session if browser storage is unavailable.
      }
      return next;
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!canReorderTimeline(timelineSortMode) || !over || active.id === over.id || !onReorderSources) return;

    const oldIndex = timedSources.findIndex((item) => item.id === active.id);
    const newIndex = timedSources.findIndex((item) => item.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      const reorderedVisibleSources = arrayMove(timedSources, oldIndex, newIndex);
      const nextFullOrder = reorderVisibleSourcesInFullList(sources, reorderedVisibleSources);
      await onReorderSources(topicId, nextFullOrder);
    }
  };

  return (
    <div className="py-4 sm:py-6 space-y-5">
      {/* Header & Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-surface p-4 sm:p-5 rounded-2xl border border-line shadow-subtle transition-colors">
        <div className="flex items-center gap-2.5 flex-wrap flex-1">
          {/* View Mode Toggle */}
          <div className="inline-flex items-center rounded-xl bg-control p-1 border border-line/60">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-surface text-accent-dark font-semibold shadow-2xs'
                  : 'text-ink-muted hover:text-ink'
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
                  ? 'bg-surface text-accent-dark font-semibold shadow-2xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>故事时间轴</span>
              {timedSources.length > 0 && (
                <span className="text-3xs font-mono opacity-80 tabular-nums">({timedSources.length})</span>
              )}
            </button>
          </div>

          <div className="h-5 w-px bg-surface-subtle mx-0.5 hidden sm:block" />

          {/* Real-time Search Input */}
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              id="sources-search"
              name="sources_search"
              aria-label="搜索素材"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索素材标题、内容、备忘、日期..."
              className="w-full pl-9 pr-7 py-1.5 bg-control border border-line rounded-xl text-xs text-ink placeholder:text-ink-muted focus:bg-surface focus:outline-none focus:border-accent transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="清除素材搜索"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-muted cursor-pointer"
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
            buttonClassName="py-1.5 text-xs bg-control border-line rounded-xl"
          />

          {/* Verification Status Filter */}
          <CustomSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as VerificationStatus | 'all')}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'confirmed', label: '已确认', dot: 'bg-success' },
              { value: 'unverified', label: '待核实', dot: 'bg-warning' },
              { value: 'rejected', label: '不采用', dot: 'bg-ink-faint' },
            ]}
            ariaLabel="可信度筛选"
            buttonClassName="py-1.5 text-xs bg-control border-line rounded-xl"
          />

          {/* Timeline Sort Toggle (only in timeline view) */}
          {viewMode === 'timeline' && (
            <button
              type="button"
              onClick={cycleTimelineSortMode}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-line bg-control text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
              aria-label="切换时间轴排序方式"
            >
              <ArrowDownUp className="w-3.5 h-3.5 text-accent" />
              <span>{timelineSortMode === 'date-asc' ? '日期正序' : timelineSortMode === 'date-desc' ? '日期倒序' : '手动顺序'}</span>
            </button>
          )}
        </div>

        {/* Right Action: Add Source Button & Batch Delete */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              className="flex items-center gap-1 rounded-xl bg-danger-soft hover:bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>删除选中 ({selectedIds.size})</span>
            </button>
          )}

          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>添加素材</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: Cards View */}
      {viewMode === 'cards' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentCardSources.map((s) => {
            const safeUrl = sanitizeExternalHttpUrl(s.url);
            return (
              <div
                key={s.id}
                className="bg-surface p-4 sm:p-5 rounded-2xl border border-line shadow-subtle hover:shadow-card hover:-translate-y-0.5 transition-all space-y-3 flex flex-col justify-between"
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
                        <span className="text-3xs font-mono font-medium px-2 py-0.5 rounded-full bg-accent-soft text-accent-dark">
                          📅 {formatEventDate(s.event_date, s.date_precision)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-ink-muted">
                      <button
                        type="button"
                        onClick={() => openEditModal(s)}
                        className="p-1 hover:text-ink rounded cursor-pointer"
                        aria-label="编辑素材"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingSource(s)}
                        className="p-1 hover:text-danger rounded cursor-pointer"
                        aria-label="删除素材"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="font-semibold text-sm sm:text-base text-ink leading-snug line-clamp-2">
                    {s.title}
                  </h3>

                  {/* Content snippet */}
                  {s.content && (
                    <p className="text-xs text-ink-muted leading-relaxed line-clamp-3 bg-canvas/70 p-2.5 rounded-xl">
                      {s.content}
                    </p>
                  )}

                  {/* Notes / Tips */}
                  {s.notes && (
                    <div className="text-2xs text-ink-muted bg-warning-soft] px-2.5 py-1 rounded-lg border border-warning-soft truncate">
                      💡 {s.notes}
                    </div>
                  )}
                </div>

                {/* Bottom Meta & Links */}
                <div className="pt-2.5 border-t border-line flex items-center justify-between flex-wrap gap-1.5 text-2xs text-ink-muted">
                  <div className="flex items-center gap-2 truncate">
                    {s.author && <span className="truncate max-w-[90px] font-semibold">@{s.author}</span>}
                    {s.published_at && <span>{s.published_at}</span>}
                  </div>

                  {safeUrl && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyUrl(s.id, s.url)}
                        className="hover:text-ink p-0.5 cursor-pointer"
                        aria-label="复制链接"
                      >
                        {copiedId === s.id ? (
                          <Check className="w-3 h-3 text-success" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-accent hover:text-accent-dark font-semibold"
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
            <div className="col-span-full p-12 text-center border-2 border-dashed border-line rounded-2xl bg-surface text-ink-muted space-y-2">
              <p className="text-sm font-semibold text-ink-muted">
                {searchQuery ? `未找到包含「${searchQuery}」的素材记录` : '暂无素材记录'}
              </p>
              <p className="text-xs text-ink-muted">
                点击右上角「+ 添加素材」，支持一键智能抓取 B站/YouTube 视频信息
              </p>
            </div>
          )}
          </div>
          <SourcePageControls page={cardPage} total={filteredSources.length} label="素材列表" onPageChange={setCardPage} />
        </>
      )}

      {/* VIEW MODE 2: Timeline View */}
      {viewMode === 'timeline' && (
        <div className="space-y-6">
          {/* Main Vertical Timeline List with DnD */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={timedSources.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="relative mx-auto w-full max-w-5xl pl-6 sm:pl-8 space-y-4 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-surface-subtle transition-colors">
                {timedSources.map((source, idx) => (
                  <SortableTimelineItem
                    key={source.id}
                    source={source}
                    index={idx}
                    canReorder={canReorderTimeline(timelineSortMode)}
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
                  <div className="p-8 text-center border-2 border-dashed border-line rounded-xl bg-surface text-ink-muted space-y-2">
                    <Clock className="w-8 h-8 mx-auto text-ink-faint stroke-[1.5]" />
                    <div className="text-sm font-medium">暂无定时的素材节点</div>
                    <p className="text-xs text-ink-muted">
                      编辑素材并设定「发生日期」，即可按时间先后顺序在此自动串联故事线
                    </p>
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>

          {/* Undated Sources Collapsible Pool */}
          {undatedSources.length > 0 && (
            <div className="border border-line rounded-2xl bg-surface overflow-hidden shadow-subtle">
              <button
                type="button"
                onClick={() => setUndatedCollapsed((prev) => !prev)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-control cursor-pointer transition-colors"
                aria-expanded={!undatedCollapsed}
              >
                <div className="flex items-center gap-2">
                  {undatedCollapsed ? <ChevronRight className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                  <span className="text-xs font-bold text-ink">待定时间素材</span>
                  <span className="px-2 py-0.5 rounded-full bg-control text-ink-muted text-2xs font-semibold">
                    <span className="font-mono tabular-nums">{undatedSources.length}</span> 条
                  </span>
                </div>
                <span className="text-2xs text-ink-muted">
                  {undatedCollapsed ? '展开查看' : '点击收起'}
                </span>
              </button>

              {!undatedCollapsed && (
                <div className="p-4 pt-0 border-t border-line/50 divide-y divide-line/50">
                  {currentUndatedSources.map((source) => (
                    <div key={source.id} className="py-3 first:pt-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <PlatformBadge platform={source.platform} />
                          <h4 className="text-xs font-semibold text-ink truncate max-w-md">
                            {source.title}
                          </h4>
                          {source.author && (
                            <span className="text-2xs text-ink-muted">@{source.author}</span>
                          )}
                        </div>
                        {source.content && (
                          <p className="text-2xs text-ink-muted line-clamp-1">
                            {source.content}
                          </p>
                        )}
                      </div>

                      {/* Quick Assign Date Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(source, true)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-line hover:border-accent bg-canvas hover:bg-accent-soft text-xs text-accent-dark font-medium transition-all cursor-pointer shadow-2xs"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>设定时间</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(source)}
                          className="p-1 hover:text-ink rounded cursor-pointer text-ink-muted"
                          aria-label="编辑素材"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSource(source)}
                          className="p-1 hover:text-danger rounded cursor-pointer text-ink-muted"
                          aria-label="删除素材"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <SourcePageControls page={undatedPage} total={undatedSources.length} label="待定时间素材" onPageChange={setUndatedPage} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Source Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeSourceModal}
        title={editingSource ? '编辑素材资料' : '录入新素材'}
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Smart Paste / Parse helper */}
          {!editingSource && (
            <div className="p-3 bg-accent-soft rounded-xl border border-line space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-accent-dark flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>Bilibili / YouTube 智能识别</span>
                </span>
                {isParsingUrl && (
                  <span className="text-2xs text-accent font-medium flex items-center gap-1">
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
                  className="flex-1 px-3 py-1.5 bg-control border border-line rounded-lg text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-accent focus:bg-surface"
                />
                {smartPasteInput && (
                  <button
                    type="button"
                    onClick={() => void handleSmartParse(smartPasteInput)}
                    disabled={isParsingUrl}
                    className="px-2.5 py-1.5 bg-accent hover:bg-accent-dark text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0 disabled:opacity-50 cursor-pointer shadow-2xs"
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
            <label htmlFor="source-title" className="block text-xs font-semibold text-ink mb-1">
              素材标题 <span className="text-ink-muted">*</span>
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
              className="w-full px-3 py-2 bg-control border border-line rounded-lg text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
            />
          </div>

          {/* Event Date & Date Precision for Timeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="source-event-date" className="block text-xs font-semibold text-ink mb-1">
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
                className="w-full px-3 py-2 bg-control border border-line rounded-lg text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label id="source-precision-label" className="block text-xs font-semibold text-ink mb-1">
                时间精度
              </label>
              <CustomSelect
                value={datePrecision}
                onChange={(val) => setDatePrecision(val as DatePrecision)}
                ariaLabel="时间精度"
                ariaLabelledBy="source-precision-label"
                className="w-full"
                buttonClassName="w-full justify-between py-2 text-sm bg-control border-line rounded-lg"
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
              <label id="source-platform-label" className="block text-xs font-semibold text-ink mb-1">来源平台</label>
              <CustomSelect
                value={platform}
                onChange={(val) => setPlatform(val as PlatformType)}
                ariaLabel="来源平台"
                ariaLabelledBy="source-platform-label"
                className="w-full"
                buttonClassName="w-full justify-between py-2 text-sm bg-control border-line rounded-lg"
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
              <label htmlFor="source-author" className="block text-xs font-semibold text-ink mb-1">原作者 / 发布者</label>
              <input
                id="source-author"
                name="source_author"
                type="text"
                autoComplete="name"
                placeholder="例如：良子官方录播组"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 bg-control border border-line rounded-lg text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="source-url" className="block text-xs font-semibold text-ink mb-1">来源 URL 链接</label>
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
                className="w-full px-3 py-2 bg-control border border-line rounded-lg text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label id="source-verification-label" className="block text-xs font-semibold text-ink mb-1">可信度状态</label>
              <CustomSelect
                value={verificationStatus}
                onChange={(val) => setVerificationStatus(val as VerificationStatus)}
                ariaLabel="可信度状态"
                ariaLabelledBy="source-verification-label"
                className="w-full"
                buttonClassName="w-full justify-between py-2 text-sm bg-control border-line rounded-lg"
                options={[
                  { value: 'confirmed', label: '已确认 (多方可靠来源)', dot: 'bg-success' },
                  { value: 'unverified', label: '待核实 (信息不足)', dot: 'bg-warning' },
                  { value: 'rejected', label: '不采用 (已证伪或无价值)', dot: 'bg-ink-faint' },
                ]}
              />
            </div>
          </div>

          <div>
            <label htmlFor="source-content" className="block text-xs font-semibold text-ink mb-1">内容摘要 / 关键发言</label>
            <textarea
              id="source-content"
              name="source_content"
              autoComplete="off"
              rows={3}
              placeholder="提取原视频或文章中的关键信息、时间码（如04:15处金句）或关键截图要点..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 bg-control border border-line rounded-lg text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none resize-none"
            />
          </div>

          <div>
            <label htmlFor="source-notes" className="block text-xs font-semibold text-ink mb-1">使用备注与提示</label>
            <input
              id="source-notes"
              name="source_notes"
              type="text"
              autoComplete="off"
              placeholder="例如：可用作第一章转折画面"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-control border border-line rounded-lg text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
            <button
              type="button"
              onClick={closeSourceModal}
              className="px-4 py-2 text-sm text-ink-muted hover:bg-control rounded-lg cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-sm bg-accent hover:bg-accent-dark text-white rounded-lg font-medium cursor-pointer transition-colors disabled:opacity-50"
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
