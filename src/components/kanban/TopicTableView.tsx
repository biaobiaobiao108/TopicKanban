import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topic, TopicStatus, Priority } from '../../types';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { COLUMNS } from './columns';
import { fetchTopicPage, purgeExpiredTrash } from '../../lib/storageApi';
import {
  Pin,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Zap,
  ChevronDown,
  Archive,
  RotateCcw,
  Columns3,
  Rows3,
  Bookmark,
  Check,
  CheckSquare,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { FloatingMenu } from '../ui/FloatingMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';
import { getBeijingDateString } from '../../lib/beijingTime';

interface TopicTableViewProps {
  topics: Topic[];
  onOpenDetail: (topicId: string, tab?: 'todos') => void;
  onOpenCurrentAction: (topicId: string) => void;
  onTogglePin: (topicId: string) => void | Promise<void>;
  onUpdateTopicStatus: (topicId: string, status: TopicStatus) => Promise<void>;
  onDeleteTopic: (topicId: string) => void | Promise<void>;
  trashedTopics: Topic[];
  onRestoreTopic: (topicId: string) => Promise<void>;
  onPermanentlyDeleteTopic: (topicId: string) => Promise<void>;
  onPermanentlyDeleteTopicsBatch?: (ids: string[]) => Promise<void>;
  onEmptyTrash?: () => Promise<void>;
  readingSpeed?: number;
  searchTerm?: string;
}

type SortCol = 'title' | 'status' | 'priority' | 'score' | 'words' | 'updated_at' | 'created_at';
type ArchiveScope = 'all' | 'active' | 'archived' | 'trash';
type Density = 'compact' | 'comfortable';
type ColumnKey = 'status' | 'priority' | 'current_action' | 'tags' | 'people' | 'score' | 'words' | 'updated_at';

interface TableViewPreferences {
  archiveScope: ArchiveScope;
  sortCol: SortCol;
  sortDir: 'asc' | 'desc';
  density: Density;
  visibleColumns: ColumnKey[];
}

const TABLE_VIEW_KEY = 'topic_kanban_table_view_v1';
const ALL_COLUMN_KEYS: ColumnKey[] = [
  'status',
  'priority',
  'current_action',
  'tags',
  'people',
  'score',
  'words',
  'updated_at',
];
const COLUMN_LABELS: Record<ColumnKey, string> = {
  status: '阶段状态',
  priority: '优先级',
  current_action: '当前行动',
  tags: '分类标签',
  people: '关联人物',
  score: '故事评分',
  words: '字数 / 时长',
  updated_at: '更新时间',
};

function readTablePreferences(): TableViewPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(TABLE_VIEW_KEY) || '{}') as Partial<TableViewPreferences>;
    return {
      archiveScope: saved.archiveScope || 'active',
      sortCol: saved.sortCol || 'updated_at',
      sortDir: saved.sortDir || 'desc',
      density: saved.density || 'comfortable',
      visibleColumns:
        saved.visibleColumns?.filter((column): column is ColumnKey => ALL_COLUMN_KEYS.includes(column as ColumnKey)) ||
        ALL_COLUMN_KEYS,
    };
  } catch {
    return {
      archiveScope: 'active',
      sortCol: 'updated_at',
      sortDir: 'desc',
      density: 'comfortable',
      visibleColumns: ALL_COLUMN_KEYS,
    };
  }
}

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 4,
  medium: 3,
  low: 2,
  none: 1,
};

const STATUS_ORDER: Record<TopicStatus, number> = {
  inbox: 1,
  scripting: 2,
  production: 3,
  published: 4,
  icebox: 5,
};

function TableStatusCell({
  topic,
  rowPadding,
  updateTopicStatus,
}: {
  topic: Topic;
  rowPadding: string;
  updateTopicStatus: (id: string, status: TopicStatus) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <td onClick={e => e.stopPropagation()} className={`${rowPadding} px-3`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer"
        aria-label="修改阶段"
      >
        <StatusBadge status={topic.status} />
        <ChevronDown className="w-3 h-3 text-ink-muted" />
      </button>

      <FloatingMenu
        isOpen={isOpen}
        anchorRef={triggerRef}
        onClose={() => setIsOpen(false)}
        width={130}
        minWidth={130}
        maxHeight={280}
        ariaLabel="修改选题阶段"
        className="p-1.5 space-y-0.5"
      >
        {COLUMNS.map(col => (
          <button
            key={col.status}
            type="button"
            onClick={async () => {
              setIsOpen(false);
              await updateTopicStatus(topic.id, col.status).catch(() => undefined);
            }}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
              topic.status === col.status
                ? 'bg-control text-ink font-bold'
                : 'text-ink-muted hover:bg-canvas hover:text-ink'
            }`}
          >
            <span>{col.label}</span>
            {topic.status === col.status && <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />}
          </button>
        ))}
      </FloatingMenu>
    </td>
  );
}

export const TopicTableView: React.FC<TopicTableViewProps> = ({
  topics,
  onOpenDetail,
  onOpenCurrentAction,
  onTogglePin,
  onUpdateTopicStatus,
  onDeleteTopic,
  trashedTopics,
  onRestoreTopic,
  onPermanentlyDeleteTopic,
  onPermanentlyDeleteTopicsBatch,
  onEmptyTrash,
  readingSpeed = 280,
  searchTerm = '',
}) => {
  const initialPreferences = useMemo(readTablePreferences, []);
  const [archiveScope, setArchiveScope] = useState<ArchiveScope>(initialPreferences.archiveScope);
  const [sortCol, setSortCol] = useState<SortCol>(initialPreferences.sortCol);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialPreferences.sortDir);
  const [density, setDensity] = useState<Density>(initialPreferences.density);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(initialPreferences.visibleColumns);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const columnButtonRef = useRef<HTMLButtonElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<TopicStatus>('inbox');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [viewSaved, setViewSaved] = useState(false);
  const { showToast } = useToast();
  const [archiveTopicId, setArchiveTopicId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const isColumnVisible = (column: ColumnKey) => visibleColumns.includes(column);
  const rowPadding = density === 'compact' ? 'py-1.5' : 'py-3';

  const saveCurrentView = () => {
    localStorage.setItem(TABLE_VIEW_KEY, JSON.stringify({ archiveScope, sortCol, sortDir, density, visibleColumns }));
    setViewSaved(true);
    window.setTimeout(() => setViewSaved(false), 1600);
  };

  useEffect(() => setPage(1), [archiveScope, searchTerm, sortCol, sortDir]);
  useEffect(() => setSelectedIds(new Set()), [archiveScope, page, searchTerm, sortCol, sortDir]);
  const pageQuery = useQuery({
    queryKey: ['topics-page', archiveScope, page, searchTerm, sortCol, sortDir],
    queryFn: () =>
      fetchTopicPage({
        scope: archiveScope,
        page,
        page_size: 50,
        q: searchTerm,
        sort: sortCol,
        direction: sortDir,
      }),
  });
  useEffect(() => {
    const totalPages = Math.max(1, pageQuery.data?.total_pages || 1);
    if (page > totalPages) setPage(totalPages);
  }, [page, pageQuery.data?.total_pages]);

  // Opening the trash view is the agreed moment to drop entries past the
  // 30-day retention window. It is an explicit POST so that a replayed or
  // prefetched list request can never remove rows.
  useEffect(() => {
    if (archiveScope !== 'trash') return;
    let cancelled = false;
    void purgeExpiredTrash()
      .then(result => {
        if (cancelled || result.purged_count === 0) return;
        void pageQuery.refetch();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveScope]);

  const activeCount = useMemo(() => {
    return pageQuery.data?.scope_counts?.active || 0;
  }, [pageQuery.data]);
  const archivedCount = useMemo(() => {
    return pageQuery.data?.scope_counts?.archived || 0;
  }, [pageQuery.data]);
  const trashCount = pageQuery.data?.scope_counts?.trash || 0;

  const updateTopicStatus = async (topicId: string, status: TopicStatus) => {
    await onUpdateTopicStatus(topicId, status);
  };

  const restoreTopic = async (topicId: string) => {
    await onRestoreTopic(topicId);
  };

  const permanentlyDeleteTopic = async (topicId: string) => {
    await onPermanentlyDeleteTopic(topicId);
  };

  const togglePin = async (topicId: string) => {
    await onTogglePin(topicId);
  };

  const deleteTopic = async (topicId: string) => {
    await onDeleteTopic(topicId);
  };

  const handleHeaderClick = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const scrollTableHorizontally = (direction: -1 | 1) => {
    const container = tableScrollRef.current;
    if (!container) return;
    container.scrollBy({
      left: direction * Math.max(240, container.clientWidth * 0.65),
      behavior: 'smooth',
    });
  };

  // 1. Scoped topics pre-sorted and paginated by the SQLite database
  const scopedTopics = useMemo(() => {
    return pageQuery.data?.items || [];
  }, [pageQuery.data]);

  // Directly use the backend sorted topics to avoid double sorting
  const sortedTopics = scopedTopics;
  const allVisibleSelected = sortedTopics.length > 0 && sortedTopics.every(topic => selectedIds.has(topic.id));

  const toggleSelectAll = () => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (allVisibleSelected) sortedTopics.forEach(topic => next.delete(topic.id));
      else sortedTopics.forEach(topic => next.add(topic.id));
      return next;
    });
  };

  const applyBulkStatus = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkUpdating(true);
    try {
      await Promise.all([...selectedIds].map(topicId => updateTopicStatus(topicId, bulkStatus)));
      setSelectedIds(new Set());
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkUpdating(true);
    try {
      const ids = [...selectedIds];
      for (const id of ids) {
        await restoreTopic(id);
      }
      setSelectedIds(new Set());
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description?: React.ReactNode;
    confirmText?: string;
    tone?: 'danger' | 'warning' | 'primary';
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {},
  });

  const requestDeleteTopic = (topic: Topic) => {
    setConfirmDialog({
      isOpen: true,
      title: '移入回收站',
      description: `确定要将选题「${topic.title}」移入回收站吗？\n\n之后可以在选题库的回收站中随时恢复。`,
      confirmText: '移入回收站',
      tone: 'warning',
      onConfirm: async () => {
        await deleteTopic(topic.id);
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        showToast({ message: `已将选题「${topic.title}」移入回收站`, tone: 'info' });
      },
    });
  };

  const requestPermanentlyDeleteTopic = (topic: Topic) => {
    const linkedVideoNotice =
      topic.status === 'published'
        ? '\n\n该选题已标记为「已发布」，其已发布视频记录与播放、点赞、投币等互动数据也会一并删除，分析看板中的历史数据将同步消失。'
        : '';
    setConfirmDialog({
      isOpen: true,
      title: '永久删除选题',
      description: `确定要永久删除选题「${topic.title}」吗？\n\n全部关联数据（资料与时间线、文案草稿与选题报告、引用记录、发布包、商单关联）将一并永久删除，且无法恢复。${linkedVideoNotice}`,
      confirmText: '永久删除',
      tone: 'danger',
      onConfirm: async () => {
        await permanentlyDeleteTopic(topic.id);
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        showToast({ message: `已永久删除选题「${topic.title}」`, tone: 'info' });
      },
    });
  };

  const handleBulkTrash = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setConfirmDialog({
      isOpen: true,
      title: '批量移入回收站',
      description: `确定要将选中的 ${count} 个选题移入回收站吗？\n\n之后可以在选题库的回收站中随时恢复。`,
      confirmText: '移入回收站',
      tone: 'warning',
      onConfirm: async () => {
        setIsBulkUpdating(true);
        try {
          const ids = [...selectedIds];
          for (const id of ids) {
            await deleteTopic(id);
          }
          setSelectedIds(new Set());
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          showToast({ message: `已将选中的 ${count} 个选题移入回收站`, tone: 'info' });
        } finally {
          setIsBulkUpdating(false);
        }
      },
    });
  };

  const handleBulkPermanentDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setConfirmDialog({
      isOpen: true,
      title: '批量永久删除',
      description: `确定要永久删除选中的 ${count} 个选题吗？\n\n全部关联数据（资料与时间线、草稿与选题报告、引用、发布包、商单关联，以及已发布视频的播放数据）将一并删除，且无法撤销！`,
      confirmText: '永久删除',
      tone: 'danger',
      onConfirm: async () => {
        setIsBulkUpdating(true);
        try {
          const ids = [...selectedIds];
          if (onPermanentlyDeleteTopicsBatch) {
            await onPermanentlyDeleteTopicsBatch(ids);
          } else {
            for (const id of ids) {
              await permanentlyDeleteTopic(id);
            }
          }
          setSelectedIds(new Set());
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          showToast({ message: `已永久删除选中的 ${count} 个选题`, tone: 'info' });
        } finally {
          setIsBulkUpdating(false);
        }
      },
    });
  };

  const handleEmptyTrash = () => {
    if (trashCount === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: '清空回收站',
      description: `确定要清空回收站吗？\n\n将永久删除回收站内的全部 ${trashCount} 个选题，包含其资料、草稿、发布包、商单关联与已发布视频的播放数据，此操作无法撤销！`,
      confirmText: '清空回收站',
      tone: 'danger',
      onConfirm: async () => {
        setIsBulkUpdating(true);
        try {
          if (onEmptyTrash) {
            await onEmptyTrash();
          } else {
            const ids = trashedTopics.map(t => t.id);
            for (const id of ids) {
              await permanentlyDeleteTopic(id);
            }
          }
          setSelectedIds(new Set());
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          showToast({ message: `已清空回收站`, tone: 'info' });
        } finally {
          setIsBulkUpdating(false);
        }
      },
    });
  };

  const renderSortIndicator = (col: SortCol) => {
    if (sortCol !== col) {
      return (
        <ArrowUpDown
          aria-hidden="true"
          className="w-3 h-3 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity"
        />
      );
    }
    return sortDir === 'asc' ? (
      <ArrowUp aria-hidden="true" className="w-3 h-3 text-accent" />
    ) : (
      <ArrowDown aria-hidden="true" className="w-3 h-3 text-accent" />
    );
  };

  const renderSortButton = (label: string, col: SortCol, alignment: 'left' | 'center' | 'right' = 'left') => (
    <button
      type="button"
      onClick={() => handleHeaderClick(col)}
      aria-label={`按${label}排序${sortCol === col ? `，当前${sortDir === 'asc' ? '升序' : '降序'}` : ''}`}
      className={`group flex min-h-8 w-full items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
        alignment === 'center'
          ? 'justify-center text-center'
          : alignment === 'right'
            ? 'justify-end text-right'
            : 'justify-start text-left'
      }`}
    >
      <span>{label}</span>
      {renderSortIndicator(col)}
    </button>
  );

  const formatRelativeTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 5) return '刚刚';
      if (diffMins < 60) return `${diffMins}分钟前`;
      if (diffHours < 24) return `${diffHours}小时前`;
      if (diffDays < 7) return `${diffDays}天前`;
      return getBeijingDateString(d).slice(5, 10) || iso.slice(5, 10);
    } catch {
      return iso.slice(0, 10);
    }
  };

  const totalWords = pageQuery.data?.summary?.total_words || 0;
  const inScriptingCount = pageQuery.data?.summary?.in_scripting_count || 0;

  return (
    <div className="flex-1 h-full flex flex-col bg-surface rounded-2xl border border-line overflow-hidden min-h-0 transition-colors shadow-subtle">
      {/* Scope Filter Header */}
      <div className="table-scope-tabs-container px-4 py-2.5 bg-surface/80 backdrop-blur-sm border-b border-line/60 flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div className="inline-flex items-center gap-1 rounded-full bg-control p-1 border border-line/40 text-xs font-medium">
          <button
            onClick={() => setArchiveScope('active')}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              archiveScope === 'active'
                ? 'bg-surface text-ink font-semibold shadow-2xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>活跃推进中</span>
            <span className="text-3xs tabular-nums font-mono opacity-75">{activeCount}</span>
          </button>

          <button
            onClick={() => setArchiveScope('archived')}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              archiveScope === 'archived'
                ? 'bg-surface text-ink font-semibold shadow-2xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>归档</span>
            <span className="text-3xs tabular-nums font-mono opacity-75">{archivedCount}</span>
          </button>

          <button
            onClick={() => setArchiveScope('all')}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              archiveScope === 'all' ? 'bg-surface text-ink font-semibold shadow-2xs' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>全部选题</span>
            <span className="text-3xs tabular-nums font-mono opacity-75">{activeCount + archivedCount}</span>
          </button>

          <button
            onClick={() => setArchiveScope('trash')}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              archiveScope === 'trash'
                ? 'bg-surface text-danger font-semibold shadow-2xs'
                : 'text-ink-muted hover:text-danger'
            }`}
          >
            <span>回收站</span>
            {trashCount > 0 && <span className="text-3xs tabular-nums font-mono text-danger">{trashCount}</span>}
          </button>
        </div>

        <div className="relative flex items-center gap-1.5 flex-wrap">
          {archiveScope === 'trash' && trashCount > 0 && (
            <button
              type="button"
              onClick={() => void handleEmptyTrash()}
              disabled={isBulkUpdating}
              className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-danger hover:bg-danger-soft transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5 text-danger" />
              <span>清空回收站 ({trashCount})</span>
            </button>
          )}

          <div className="hidden items-center gap-1 md:flex">
            <button
              type="button"
              onClick={() => setDensity(previous => (previous === 'compact' ? 'comfortable' : 'compact'))}
              className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-ink-muted hover:text-ink hover:bg-control transition-all cursor-pointer"
            >
              <Rows3 className="h-3.5 w-3.5" /> {density === 'compact' ? '紧凑' : '舒适'}
            </button>
            <button
              ref={columnButtonRef}
              type="button"
              onClick={() => setIsColumnMenuOpen(previous => !previous)}
              className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-ink-muted hover:text-ink hover:bg-control transition-all cursor-pointer"
            >
              <Columns3 className="h-3.5 w-3.5" /> 显示列
            </button>
            <button
              type="button"
              onClick={saveCurrentView}
              className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-accent hover:bg-control transition-all cursor-pointer"
            >
              <Bookmark className="h-3.5 w-3.5" /> {viewSaved ? '已保存' : '保存视图'}
            </button>
          </div>

          <FloatingMenu
            isOpen={isColumnMenuOpen}
            anchorRef={columnButtonRef}
            onClose={() => setIsColumnMenuOpen(false)}
            align="right"
            width={200}
            minWidth={200}
            maxHeight={380}
            ariaLabel="自定义表格显示列"
            className="p-2"
          >
            <div className="px-2 pb-1 text-3xs font-bold text-ink-muted">标题列始终显示并冻结</div>
            <FloatingScrollbar className="space-y-0.5" wrapperClassName="max-h-[300px] flex-none">
              {ALL_COLUMN_KEYS.map(column => (
                <label
                  key={column}
                  className="flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-ink hover:bg-canvas"
                >
                  <input
                    type="checkbox"
                    checked={isColumnVisible(column)}
                    onChange={() =>
                      setVisibleColumns(previous =>
                        previous.includes(column) ? previous.filter(item => item !== column) : [...previous, column],
                      )
                    }
                    className="accent-[var(--accent)]"
                  />
                  <span>{COLUMN_LABELS[column]}</span>
                </label>
              ))}
            </FloatingScrollbar>
          </FloatingMenu>
        </div>
      </div>

      {/* 1. Bulk action bar for active / archived scopes */}
      {selectedIds.size > 0 && archiveScope !== 'trash' && (
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 font-medium text-ink">
            <CheckSquare className="h-4 w-4 text-accent shrink-0" />
            <span>已选择 {selectedIds.size} 个选题</span>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <CustomSelect
              value={bulkStatus}
              onChange={val => setBulkStatus(val as TopicStatus)}
              ariaLabel="批量修改阶段"
              size="sm"
              options={COLUMNS.map(column => ({ value: column.status, label: column.label }))}
            />
            <button
              type="button"
              onClick={() => void applyBulkStatus().catch(() => undefined)}
              disabled={isBulkUpdating}
              className="min-h-9 rounded-sm bg-accent px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isBulkUpdating ? '更新中…' : '批量修改阶段'}
            </button>
            <button
              type="button"
              onClick={handleBulkTrash}
              disabled={isBulkUpdating}
              className="min-h-9 inline-flex items-center gap-1.5 rounded-sm px-3 text-xs font-medium text-danger hover:bg-surface disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isBulkUpdating ? '处理中…' : '批量移入回收站'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="min-h-9 px-2 text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 2. Bulk action bar for TRASH scope */}
      {selectedIds.size > 0 && archiveScope === 'trash' && (
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 font-medium text-ink">
            <CheckSquare className="h-4 w-4 text-ink-muted shrink-0" />
            <span>已选择 {selectedIds.size} 个回收站选题</span>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              type="button"
              onClick={() => void handleBulkRestore()}
              disabled={isBulkUpdating}
              className="flex items-center gap-1 min-h-9 rounded-sm px-3 text-xs font-medium text-accent hover:bg-surface disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isBulkUpdating ? '恢复中…' : '批量恢复'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleBulkPermanentDelete()}
              disabled={isBulkUpdating}
              className="flex items-center gap-1 min-h-9 rounded-sm px-3 text-xs font-medium text-danger hover:bg-surface disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isBulkUpdating ? '删除中…' : '批量永久删除'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="min-h-9 px-2 text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Mobile Card List */}
      <FloatingScrollbar
        className="space-y-3 p-3 pb-[max(5rem,var(--mobile-bottom-nav-clearance))]"
        wrapperClassName="flex-1 min-h-0 lg:hidden"
        aria-label="选题卡片列表"
      >
        {sortedTopics.map(topic => {
          const totalScore =
            (topic.score_character || 0) +
            (topic.score_conflict || 0) +
            (topic.score_contrast || 0) +
            (topic.score_material || 0) +
            (topic.score_story || 0);
          const minutes = topic.draft_word_count ? (topic.draft_word_count / readingSpeed).toFixed(1) : '0';
          const isArchived = topic.status === 'published' || topic.status === 'icebox';

          return (
            <article key={topic.id} className="rounded-lg border border-line bg-surface p-4 cv-card shadow-subtle">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(topic.id)}
                    onChange={event => {
                      event.stopPropagation();
                      setSelectedIds(previous => {
                        const next = new Set(previous);
                        if (next.has(topic.id)) next.delete(topic.id);
                        else next.add(topic.id);
                        return next;
                      });
                    }}
                    className="mt-1 h-4 w-4 rounded border-line accent-[var(--accent)] shrink-0 cursor-pointer"
                    aria-label={`选择选题「${topic.title}」`}
                  />
                  {archiveScope === 'trash' ? (
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-ink">{topic.title}</span>
                      {(topic.summary || topic.hook) && (
                        <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-ink-muted">
                          {topic.summary || topic.hook}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenDetail(topic.id)}
                      aria-label={`打开选题：${topic.title}`}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <span className="block truncate text-base font-semibold text-ink">{topic.title}</span>
                      {(topic.summary || topic.hook) && (
                        <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-ink-muted">
                          {topic.summary || topic.hook}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => void togglePin(topic.id)}
                  disabled={archiveScope === 'trash' || isArchived}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                    topic.is_pinned ? 'border-accent/25 bg-accent-soft text-accent' : 'border-line text-ink-muted'
                  }`}
                  aria-label={isArchived ? '归档选题不可设为主推' : topic.is_pinned ? '取消置顶' : '置顶选题'}
                >
                  <Pin className={`h-4 w-4 ${topic.is_pinned ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <CustomSelect
                  value={topic.status}
                  onChange={val => void updateTopicStatus(topic.id, val as TopicStatus).catch(() => undefined)}
                  ariaLabel={`修改「${topic.title}」阶段`}
                  size="sm"
                  options={COLUMNS.map(column => ({ value: column.status, label: column.label }))}
                />
                <PriorityBadge priority={topic.priority} />
                <span className="ml-auto text-2xs text-ink-muted">{formatRelativeTime(topic.updated_at)}</span>
              </div>

              <div className="mt-3 rounded-sm border border-line bg-canvas/60 px-3 py-2 text-xs text-ink">
                <span className="font-medium text-accent">当前行动：</span>
                {topic.current_todo?.title || '未设置当前行动'}
              </div>

              {topic.tags?.length || topic.people?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {topic.tags?.slice(0, 3).map(tag => (
                    <span key={tag.id || tag.name} className="rounded-md bg-canvas px-2 py-1 text-3xs text-ink-muted">
                      #{tag.name}
                    </span>
                  ))}
                  {topic.people?.slice(0, 2).map(person => (
                    <span key={person.id} className="rounded-md bg-canvas px-2 py-1 text-3xs text-ink-muted">
                      {person.name}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-3 divide-x divide-line rounded-sm bg-canvas/65 py-2 text-center">
                <div>
                  <div className="text-3xs text-ink-muted">故事评分</div>
                  <div className="mt-0.5 font-mono text-xs font-medium text-ink">
                    {totalScore || '—'}
                    {totalScore ? '/10' : ''}
                  </div>
                </div>
                <div>
                  <div className="text-3xs text-ink-muted">文案字数</div>
                  <div className="mt-0.5 font-mono text-xs font-medium text-ink">
                    {(topic.draft_word_count || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-3xs text-ink-muted">预估时长</div>
                  <div className="mt-0.5 text-xs font-medium text-ink">
                    <span className="font-mono tabular-nums">{minutes}</span> 分钟
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-2 border-t border-line pt-3">
                {archiveScope === 'trash' ? (
                  <>
                    <button
                      onClick={() => void restoreTopic(topic.id)}
                      className="flex min-h-10 items-center gap-1.5 rounded-xl border border-success-soft px-3 text-xs font-semibold text-success"
                    >
                      <RotateCcw className="h-4 w-4" /> 恢复选题
                    </button>
                    <button
                      onClick={() => requestPermanentlyDeleteTopic(topic)}
                      className="flex min-h-10 items-center gap-1.5 rounded-xl border border-danger-line px-3 text-xs font-semibold text-danger"
                    >
                      <Trash2 className="h-4 w-4" /> 永久删除
                    </button>
                  </>
                ) : isArchived ? (
                  <button
                    onClick={() => void updateTopicStatus(topic.id, 'inbox').catch(() => undefined)}
                    className="flex min-h-10 items-center gap-1.5 rounded-sm px-3 text-xs font-medium text-accent hover:bg-canvas"
                  >
                    <RotateCcw className="h-4 w-4" /> 恢复至收集箱
                  </button>
                ) : (
                  <button
                    onClick={() => setArchiveTopicId(topic.id)}
                    className="flex min-h-10 items-center gap-1.5 rounded-sm px-3 text-xs font-medium text-ink-muted hover:bg-canvas"
                  >
                    <Archive className="h-4 w-4" /> 归档
                  </button>
                )}
                {archiveScope !== 'trash' && (
                  <button
                    onClick={() => onOpenDetail(topic.id)}
                    className="flex min-h-10 items-center gap-1.5 rounded-sm bg-accent px-3 text-xs font-medium text-white hover:opacity-90"
                  >
                    打开工作台 <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                {archiveScope !== 'trash' && (
                  <button
                    onClick={() => requestDeleteTopic(topic)}
                    aria-label="移入回收站"
                    className="flex h-10 w-10 items-center justify-center rounded-sm text-danger hover:bg-canvas cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {sortedTopics.length === 0 && (
          <div className="py-16 text-center text-sm text-ink-muted">
            {archiveScope === 'trash'
              ? '回收站为空'
              : archiveScope === 'archived'
                ? '归档库暂无已发布或搁置的选题'
                : '暂无匹配的选题数据'}
          </div>
        )}
      </FloatingScrollbar>

      {/* Table Scroll Container */}
      <div className="hidden flex-1 min-h-0 flex-col lg:flex">
        <FloatingScrollbar
          ref={tableScrollRef}
          id="topic-table-scroll"
          role="region"
          tabIndex={0}
          aria-label="选题表格，可使用左右方向键浏览更多列"
          onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              scrollTableHorizontally(event.key === 'ArrowLeft' ? -1 : 1);
            }
          }}
          className="topic-table-container w-full min-w-full overflow-x-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
          wrapperClassName="flex-1 min-h-0"
        >
          <table className="w-max min-w-full text-left border-collapse text-xs">
            {/* Table Header */}
            <thead className="table-header-row bg-surface/95 backdrop-blur-md sticky top-0 z-10 border-b border-line/60 text-ink-muted text-2xs font-semibold select-none tracking-wider">
              <tr>
                <th scope="col" className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="选择当前页全部选题"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="accent-[var(--accent)]"
                  />
                </th>
                <th scope="col" className="py-3 px-3 w-10 text-center">
                  <Pin className="mx-auto h-3.5 w-3.5" aria-label="置顶" />
                </th>

                <th
                  scope="col"
                  aria-sort={sortCol === 'title' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className="min-w-[240px] px-3 py-2"
                >
                  {renderSortButton('选题标题与核心看点', 'title')}
                </th>

                {isColumnVisible('status') && (
                  <th
                    scope="col"
                    aria-sort={sortCol === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className="py-2 px-3 w-28"
                  >
                    {renderSortButton('阶段状态', 'status')}
                  </th>
                )}

                {isColumnVisible('priority') && (
                  <th
                    scope="col"
                    aria-sort={sortCol === 'priority' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className="py-2 px-3 w-20 text-center"
                  >
                    {renderSortButton('优先级', 'priority', 'center')}
                  </th>
                )}

                {isColumnVisible('current_action') && (
                  <th scope="col" className="py-3 px-3 min-w-[180px]">
                    <span>当前行动</span>
                  </th>
                )}

                {isColumnVisible('tags') && (
                  <th scope="col" className="py-3 px-3 min-w-[130px]">
                    <span>分类标签</span>
                  </th>
                )}

                {isColumnVisible('people') && (
                  <th scope="col" className="py-3 px-3 min-w-[120px]">
                    <span>关联人物</span>
                  </th>
                )}

                {isColumnVisible('score') && (
                  <th
                    scope="col"
                    aria-sort={sortCol === 'score' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className="py-2 px-3 w-24 text-center"
                  >
                    {renderSortButton('故事评分', 'score', 'center')}
                  </th>
                )}

                {isColumnVisible('words') && (
                  <th
                    scope="col"
                    aria-sort={sortCol === 'words' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className="py-2 px-3 w-28 text-right"
                  >
                    {renderSortButton('字数 / 预估时长', 'words', 'right')}
                  </th>
                )}

                {isColumnVisible('updated_at') && (
                  <th
                    scope="col"
                    aria-sort={sortCol === 'updated_at' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className="py-2 px-3 w-24 text-right"
                  >
                    {renderSortButton('更新时间', 'updated_at', 'right')}
                  </th>
                )}

                <th scope="col" className="py-3 px-3 w-28 text-center">
                  操作
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-line/30">
              {sortedTopics.map(topic => {
                const totalScore =
                  (topic.score_character || 0) +
                  (topic.score_conflict || 0) +
                  (topic.score_contrast || 0) +
                  (topic.score_material || 0) +
                  (topic.score_story || 0);

                const minutes = topic.draft_word_count ? (topic.draft_word_count / readingSpeed).toFixed(1) : '0';

                const isArchived = topic.status === 'published' || topic.status === 'icebox';

                return (
                  <tr
                    key={topic.id}
                    onClick={() => archiveScope !== 'trash' && onOpenDetail(topic.id)}
                    className={`transition-colors duration-150 group cv-auto ${
                      archiveScope === 'trash' ? '' : 'cursor-pointer'
                    } ${selectedIds.has(topic.id) ? 'bg-accent-soft/60 hover:bg-accent-soft/80' : 'hover:bg-control'}`}
                  >
                    <td
                      onClick={event => event.stopPropagation()}
                      className={`${rowPadding} px-3 text-center border-l-2 transition-colors ${
                        selectedIds.has(topic.id) ? 'border-accent' : 'border-transparent group-hover:border-accent/35'
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`选择「${topic.title}」`}
                        checked={selectedIds.has(topic.id)}
                        onChange={() =>
                          setSelectedIds(previous => {
                            const next = new Set(previous);
                            if (next.has(topic.id)) next.delete(topic.id);
                            else next.add(topic.id);
                            return next;
                          })
                        }
                        className="accent-[var(--accent)] cursor-pointer"
                      />
                    </td>
                    {/* 1. Pin / Index */}
                    <td
                      onClick={e => {
                        e.stopPropagation();
                        if (archiveScope !== 'trash' && !isArchived) void togglePin(topic.id);
                      }}
                      className={`${rowPadding} px-3 text-center`}
                    >
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          if (archiveScope !== 'trash' && !isArchived) void togglePin(topic.id);
                        }}
                        disabled={archiveScope === 'trash' || isArchived}
                        aria-label={isArchived ? '归档选题不可设为主推' : topic.is_pinned ? '取消置顶' : '置顶选题'}
                        className={`p-1 rounded transition-colors ${isArchived ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'} ${
                          topic.is_pinned
                            ? 'text-accent hover:text-ink-muted'
                            : 'text-ink-faint hover:text-ink-muted opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <Pin className={`w-3.5 h-3.5 ${topic.is_pinned ? 'fill-current' : ''}`} />
                      </button>
                    </td>

                    {/* 2. Title & Hook */}
                    <td className={`${rowPadding} px-3`}>
                      <div className="space-y-0.5 max-w-sm">
                        {archiveScope === 'trash' ? (
                          <span className="block truncate font-semibold text-ink text-xs">{topic.title}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              onOpenDetail(topic.id);
                            }}
                            aria-label={`打开选题：${topic.title}`}
                            className="block max-w-full truncate text-left font-semibold text-ink text-xs transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                          >
                            {topic.title}
                          </button>
                        )}
                        {topic.summary ? (
                          <p className="text-2xs text-ink-muted line-clamp-1 group-hover:text-ink transition-colors">
                            {topic.summary}
                          </p>
                        ) : topic.hook ? (
                          <p className="text-2xs text-ink-muted italic line-clamp-1 group-hover:text-ink transition-colors">
                            Hook: {topic.hook}
                          </p>
                        ) : null}
                      </div>
                    </td>

                    {/* 3. Status (With Dropdown Streamlining) */}
                    {isColumnVisible('status') && (
                      <TableStatusCell topic={topic} rowPadding={rowPadding} updateTopicStatus={updateTopicStatus} />
                    )}

                    {/* 4. Priority */}
                    {isColumnVisible('priority') && (
                      <td className={`${rowPadding} px-3 text-center`}>
                        <div className="flex items-center justify-center">
                          <PriorityBadge priority={topic.priority} />
                        </div>
                      </td>
                    )}

                    {/* 5. Current Action */}
                    {isColumnVisible('current_action') && (
                      <td className={`${rowPadding} px-3`}>
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            onOpenCurrentAction(topic.id);
                          }}
                          className={`inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-sm px-2 py-1 text-left text-2xs font-medium transition-colors cursor-pointer ${topic.current_todo ? 'bg-accent-soft/60 text-accent-dark hover:bg-accent-soft' : 'text-ink-muted hover:bg-canvas'}`}
                          aria-label="管理当前行动"
                        >
                          <Zap
                            className={`h-3 w-3 shrink-0 ${topic.current_todo ? 'text-accent' : 'text-ink-muted'}`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{topic.current_todo?.title || '未设置当前行动'}</span>
                        </button>
                      </td>
                    )}

                    {/* 6. Tags */}
                    {isColumnVisible('tags') && (
                      <td className={`${rowPadding} px-3`}>
                        <div className="flex flex-wrap gap-1 max-w-[160px]">
                          {topic.tags && topic.tags.length > 0 ? (
                            topic.tags.slice(0, 2).map(tag => (
                              <span
                                key={tag.id || tag.name}
                                className="inline-flex items-center text-3xs font-medium bg-control text-ink-muted px-2 py-0.5 rounded-md select-none"
                              >
                                #{tag.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-ink-faint italic text-2xs">-</span>
                          )}
                          {topic.tags && topic.tags.length > 2 && (
                            <span className="text-3xs text-ink-muted font-mono">+{topic.tags.length - 2}</span>
                          )}
                        </div>
                      </td>
                    )}

                    {/* 7. People */}
                    {isColumnVisible('people') && (
                      <td className={`${rowPadding} px-3`}>
                        <div className="flex flex-wrap gap-1 max-w-[140px]">
                          {topic.people && topic.people.length > 0 ? (
                            topic.people.slice(0, 2).map(person => (
                              <span
                                key={person.id}
                                className="inline-flex items-center text-3xs text-ink-muted px-1 py-0.5 select-none"
                              >
                                {person.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-ink-faint italic text-2xs">-</span>
                          )}
                        </div>
                      </td>
                    )}

                    {/* 8. Story Rating Score */}
                    {isColumnVisible('score') && (
                      <td className={`${rowPadding} px-3 text-center`}>
                        {totalScore > 0 ? (
                          <div className="inline-flex items-center gap-1 font-mono font-medium text-xs text-ink select-none">
                            <span>{totalScore}</span>
                            <span className="text-3xs text-ink-muted font-normal">/10</span>
                          </div>
                        ) : (
                          <span className="text-ink-muted text-2xs">未评分</span>
                        )}
                      </td>
                    )}

                    {/* 9. Word Count & Estimated Duration */}
                    {isColumnVisible('words') && (
                      <td className={`${rowPadding} px-3 text-right`}>
                        {topic.draft_word_count ? (
                          <div>
                            <div className="font-bold text-ink">
                              <span className="font-mono tabular-nums">{topic.draft_word_count.toLocaleString()}</span>{' '}
                              字
                            </div>
                            <div className="text-3xs text-ink-muted">
                              ~<span className="font-mono tabular-nums">{minutes}</span> 分钟
                            </div>
                          </div>
                        ) : (
                          <span className="text-ink-faint text-2xs">
                            <span className="font-mono tabular-nums">0</span> 字
                          </span>
                        )}
                      </td>
                    )}

                    {/* 10. Updated Time */}
                    {isColumnVisible('updated_at') && (
                      <td className={`${rowPadding} px-3 text-right text-ink-muted text-2xs tabular-nums`}>
                        {formatRelativeTime(topic.updated_at)}
                      </td>
                    )}

                    {/* 11. Actions */}
                    <td onClick={e => e.stopPropagation()} className={`${rowPadding} px-3 text-center`}>
                      <div className="flex items-center justify-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        {/* Archive / Restore action */}
                        {archiveScope === 'trash' ? (
                          <>
                            <button
                              onClick={() => void restoreTopic(topic.id)}
                              className="p-1.5 text-success hover:text-success hover:bg-success-soft rounded-lg transition-colors cursor-pointer"
                              aria-label="恢复选题"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => requestPermanentlyDeleteTopic(topic)}
                              className="p-1.5 text-danger hover:text-danger hover:bg-danger-soft rounded-lg transition-colors cursor-pointer"
                              aria-label="永久删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : isArchived ? (
                          <button
                            onClick={() => void updateTopicStatus(topic.id, 'inbox').catch(() => undefined)}
                            className="p-1.5 text-accent hover:bg-canvas rounded-sm transition-colors cursor-pointer"
                            aria-label="从归档中恢复至收集箱"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setArchiveTopicId(topic.id)}
                            className="p-1.5 text-ink-muted hover:text-ink hover:bg-control rounded-lg transition-colors cursor-pointer"
                            aria-label="归档此选题"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {archiveScope !== 'trash' && (
                          <button
                            onClick={() => requestDeleteTopic(topic)}
                            className="p-1.5 text-ink-faint hover:text-danger hover:bg-danger-soft rounded-lg transition-colors cursor-pointer"
                            aria-label="移入回收站"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {sortedTopics.length === 0 && (
                <tr>
                  <td colSpan={4 + visibleColumns.length} className="py-16 text-center text-ink-muted text-sm">
                    {archiveScope === 'trash'
                      ? '回收站为空'
                      : archiveScope === 'archived'
                        ? '归档库暂无已发布或搁置的选题'
                        : '暂无匹配的选题数据'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </FloatingScrollbar>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/40 bg-canvas/45 px-3 py-2 text-xs text-ink-muted">
          <span>表格可横向滚动，也可聚焦表格后使用 ← / → 键</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="向左滚动选题表格"
              aria-controls="topic-table-scroll"
              onClick={() => scrollTableHorizontally(-1)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="向右滚动选题表格"
              aria-controls="topic-table-scroll"
              onClick={() => scrollTableHorizontally(1)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Table Summary Footer */}
      <div className="hidden p-3.5 bg-canvas/55 border-t border-line lg:flex items-center justify-between text-xs text-ink-muted font-medium shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span>
            当前页：
            <strong className="text-ink">
              <span className="font-mono tabular-nums">{sortedTopics.length}</span> 个选题
            </strong>
          </span>
          <span>•</span>
          <span>
            全库写稿中：
            <strong className="text-accent">
              <span className="font-mono tabular-nums">{inScriptingCount}</span> 篇
            </strong>
          </span>
          <span>•</span>
          <span>
            全库累计文案：
            <strong className="text-ink">
              <span className="font-mono tabular-nums">{totalWords.toLocaleString()}</span> 字
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || pageQuery.isFetching}
            onClick={() => setPage(value => Math.max(1, value - 1))}
            className="rounded-sm px-2.5 py-1.5 text-ink-muted hover:bg-surface disabled:opacity-40"
          >
            上一页
          </button>
          <span>
            <span className="font-mono tabular-nums">
              {page} / {Math.max(1, pageQuery.data?.total_pages || 1)}
            </span>{' '}
            · 共 <span className="font-mono tabular-nums">{pageQuery.data?.total || 0}</span> 条
          </span>
          <button
            type="button"
            disabled={page >= (pageQuery.data?.total_pages || 1) || pageQuery.isFetching}
            onClick={() => setPage(value => value + 1)}
            className="rounded-sm px-2.5 py-1.5 text-ink-muted hover:bg-surface disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-line bg-canvas/55 p-3 text-xs lg:hidden">
        <button
          type="button"
          disabled={page <= 1 || pageQuery.isFetching}
          onClick={() => setPage(value => Math.max(1, value - 1))}
          className="rounded-sm px-3 py-2 text-ink-muted hover:bg-surface disabled:opacity-40"
        >
          上一页
        </button>
        <span className="text-ink-muted font-mono tabular-nums">
          {page} / {Math.max(1, pageQuery.data?.total_pages || 1)}
        </span>
        <button
          type="button"
          disabled={page >= (pageQuery.data?.total_pages || 1) || pageQuery.isFetching}
          onClick={() => setPage(value => value + 1)}
          className="rounded-sm px-3 py-2 text-ink-muted hover:bg-surface disabled:opacity-40"
        >
          下一页
        </button>
      </div>

      <Modal isOpen={Boolean(archiveTopicId)} onClose={() => setArchiveTopicId(null)} title="归档选题" maxWidth="sm">
        <p className="text-xs leading-relaxed text-ink-muted">请选择归档状态；取消不会修改当前选题。</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              const topicId = archiveTopicId;
              setArchiveTopicId(null);
              if (topicId) void updateTopicStatus(topicId, 'published').catch(() => undefined);
            }}
            className="rounded-sm bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            已发布
          </button>
          <button
            type="button"
            onClick={() => {
              const topicId = archiveTopicId;
              setArchiveTopicId(null);
              if (topicId) void updateTopicStatus(topicId, 'icebox').catch(() => undefined);
            }}
            className="rounded-sm border border-line bg-canvas px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            搁置
          </button>
        </div>
        <button
          type="button"
          onClick={() => setArchiveTopicId(null)}
          className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-canvas"
        >
          取消
        </button>
      </Modal>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        tone={confirmDialog.tone}
      />
    </div>
  );
};
