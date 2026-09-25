import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topic, TopicStatus, Priority } from '../../types';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { COLUMNS } from './columns';
import { fetchTopicPage } from '../../lib/storage';
import {
  Pin,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Trash2,
  Zap,
  ChevronDown,
  Archive,
  RotateCcw,
  Columns3,
  Rows3,
  Bookmark,
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
const ALL_COLUMN_KEYS: ColumnKey[] = ['status', 'priority', 'current_action', 'tags', 'people', 'score', 'words', 'updated_at'];
const COLUMN_LABELS: Record<ColumnKey, string> = {
  status: '阶段状态', priority: '优先级', current_action: '当前行动', tags: '分类标签',
  people: '关联人物', score: '故事评分', words: '字数 / 时长', updated_at: '更新时间',
};

function readTablePreferences(): TableViewPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(TABLE_VIEW_KEY) || '{}') as Partial<TableViewPreferences>;
    return {
      archiveScope: saved.archiveScope || 'active',
      sortCol: saved.sortCol || 'updated_at',
      sortDir: saved.sortDir || 'desc',
      density: saved.density || 'comfortable',
      visibleColumns: saved.visibleColumns?.filter((column): column is ColumnKey => ALL_COLUMN_KEYS.includes(column as ColumnKey)) || ALL_COLUMN_KEYS,
    };
  } catch {
    return { archiveScope: 'active', sortCol: 'updated_at', sortDir: 'desc', density: 'comfortable', visibleColumns: ALL_COLUMN_KEYS };
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
    <td
      onClick={(e) => e.stopPropagation()}
      className={`${rowPadding} px-3`}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer"
        title="修改阶段"
      >
        <StatusBadge status={topic.status} />
        <ChevronDown className="w-3 h-3 text-stone-400 dark:text-stone-500" />
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
        {COLUMNS.map((col) => (
          <button
            key={col.status}
            type="button"
            onClick={async () => {
              setIsOpen(false);
              await updateTopicStatus(topic.id, col.status).catch(() => undefined);
            }}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
              topic.status === col.status
                ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <span>{col.label}</span>
            {topic.status === col.status && <span className="text-[var(--accent)]">✓</span>}
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
    queryFn: () => fetchTopicPage({
      scope: archiveScope, page, page_size: 50, q: searchTerm,
      sort: sortCol, direction: sortDir,
    }),
  });

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
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };


  // 1. Scoped topics pre-sorted and paginated by the SQLite database
  const scopedTopics = useMemo(() => {
    return pageQuery.data?.items || [];
  }, [pageQuery.data]);

  // Directly use the backend sorted topics to avoid double sorting
  const sortedTopics = scopedTopics;
  const allVisibleSelected = sortedTopics.length > 0 && sortedTopics.every((topic) => selectedIds.has(topic.id));

  const toggleSelectAll = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) sortedTopics.forEach((topic) => next.delete(topic.id));
      else sortedTopics.forEach((topic) => next.add(topic.id));
      return next;
    });
  };

  const applyBulkStatus = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkUpdating(true);
    try {
      await Promise.all([...selectedIds].map((topicId) => updateTopicStatus(topicId, bulkStatus)));
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
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        showToast({ message: `已将选题「${topic.title}」移入回收站`, tone: 'info' });
      },
    });
  };

  const requestPermanentlyDeleteTopic = (topic: Topic) => {
    setConfirmDialog({
      isOpen: true,
      title: '永久删除选题',
      description: `确定要永久删除选题「${topic.title}」吗？\n\n全部关联数据（资料、时间线、文案草稿）将一并永久删除，且无法恢复。`,
      confirmText: '永久删除',
      tone: 'danger',
      onConfirm: async () => {
        await permanentlyDeleteTopic(topic.id);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
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
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
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
      description: `确定要永久删除选中的 ${count} 个选题吗？\n\n全部关联资料、时间线与草稿将一并删除，且无法撤销！`,
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
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
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
      description: `确定要清空回收站吗？\n\n将永久删除回收站内的全部 ${trashCount} 个选题，此操作无法撤销！`,
      confirmText: '清空回收站',
      tone: 'danger',
      onConfirm: async () => {
        setIsBulkUpdating(true);
        try {
          if (onEmptyTrash) {
            await onEmptyTrash();
          } else {
            const ids = trashedTopics.map((t) => t.id);
            for (const id of ids) {
              await permanentlyDeleteTopic(id);
            }
          }
          setSelectedIds(new Set());
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          showToast({ message: `已清空回收站`, tone: 'info' });
        } finally {
          setIsBulkUpdating(false);
        }
      },
    });
  };

  const renderSortIndicator = (col: SortCol) => {
    if (sortCol !== col) {
      return <ArrowUpDown className="w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[var(--accent)]" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[var(--accent)]" />
    );
  };

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
    <div className="flex-1 flex flex-col bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--line)] overflow-hidden min-h-0 transition-colors">
      {/* Scope Filter Header */}
      <div className="table-scope-tabs-container px-4 py-2.5 bg-[var(--canvas)]/55 border-b border-[var(--line)] flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-0.5 text-xs font-medium">
          <button
            onClick={() => setArchiveScope('active')}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer flex items-center gap-1.5 ${
              archiveScope === 'active'
                ? 'bg-[var(--surface)] text-[var(--ink)]'
                : 'text-[var(--ink-muted)] hover:bg-[var(--surface)]/70 hover:text-[var(--ink)]'
            }`}
          >
            <span>活跃推进中</span>
            <span className="text-[10px] tabular-nums text-[var(--ink-muted)]">
              {activeCount}
            </span>
          </button>

          <button
            onClick={() => setArchiveScope('archived')}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer flex items-center gap-1.5 ${
              archiveScope === 'archived'
                ? 'bg-[var(--surface)] text-[var(--ink)]'
                : 'text-[var(--ink-muted)] hover:bg-[var(--surface)]/70 hover:text-[var(--ink)]'
            }`}
          >
            <span>归档</span>
            <span className="text-[10px] tabular-nums text-[var(--ink-muted)]">
              {archivedCount}
            </span>
          </button>

          <button
            onClick={() => setArchiveScope('all')}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer flex items-center gap-1.5 ${
              archiveScope === 'all'
                ? 'bg-[var(--surface)] text-[var(--ink)]'
                : 'text-[var(--ink-muted)] hover:bg-[var(--surface)]/70 hover:text-[var(--ink)]'
            }`}
          >
            <span>全部选题</span>
            <span className="text-[10px] tabular-nums text-[var(--ink-muted)]">
              {activeCount + archivedCount}
            </span>
          </button>

          <button
            onClick={() => setArchiveScope('trash')}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer flex items-center gap-1.5 ${
              archiveScope === 'trash'
                ? 'bg-[var(--surface)] text-[var(--h1-color)]'
                : 'text-[var(--ink-muted)] hover:bg-[var(--surface)]/70 hover:text-[var(--h1-color)]'
            }`}
          >
            <span>回收站</span>
            {trashCount > 0 && (
              <span className="text-[10px] tabular-nums text-[var(--h1-color)]">
                {trashCount}
              </span>
            )}
          </button>
        </div>

        <div className="relative flex items-center gap-1.5 flex-wrap">
          {archiveScope === 'trash' && trashCount > 0 && (
            <button
              type="button"
              onClick={() => void handleEmptyTrash()}
              disabled={isBulkUpdating}
              className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[11px] font-medium text-[var(--h1-color)] transition-colors hover:bg-[var(--canvas)] cursor-pointer disabled:opacity-50"
              title="彻底永久删除回收站内的全部选题"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              <span>清空回收站 ({trashCount})</span>
            </button>
          )}

          <div className="hidden items-center gap-1.5 md:flex">
            <button
              type="button"
              onClick={() => setDensity((previous) => previous === 'compact' ? 'comfortable' : 'compact')}
              className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[11px] font-medium text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] cursor-pointer"
              title="切换表格行密度"
            >
              <Rows3 className="h-3.5 w-3.5" /> {density === 'compact' ? '紧凑' : '舒适'}
            </button>
            <button
              ref={columnButtonRef}
              type="button"
              onClick={() => setIsColumnMenuOpen((previous) => !previous)}
              className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[11px] font-medium text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] cursor-pointer"
            >
              <Columns3 className="h-3.5 w-3.5" /> 显示列
            </button>
            <button
              type="button"
              onClick={saveCurrentView}
              className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--surface)] cursor-pointer"
            >
              <Bookmark className="h-3.5 w-3.5" /> {viewSaved ? '已保存' : '保存当前视图'}
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
            <div className="px-2 pb-1 text-[10px] font-bold text-stone-400 dark:text-stone-500">
              标题列始终显示并冻结
            </div>
            <FloatingScrollbar className="space-y-0.5" wrapperClassName="max-h-[300px] flex-none">
              {ALL_COLUMN_KEYS.map((column) => (
                <label
                  key={column}
                  className="flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
                >
                  <input
                    type="checkbox"
                    checked={isColumnVisible(column)}
                    onChange={() =>
                      setVisibleColumns((previous) =>
                        previous.includes(column)
                          ? previous.filter((item) => item !== column)
                          : [...previous, column]
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
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--canvas)]/60 px-4 py-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 font-medium text-[var(--ink)]">
            <CheckSquare className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <span>已选择 {selectedIds.size} 个选题</span>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <CustomSelect
              value={bulkStatus}
              onChange={(val) => setBulkStatus(val as TopicStatus)}
              ariaLabel="批量修改阶段"
              size="sm"
              options={COLUMNS.map((column) => ({ value: column.status, label: column.label }))}
            />
            <button
              type="button"
              onClick={() => void applyBulkStatus().catch(() => undefined)}
              disabled={isBulkUpdating}
              className="min-h-9 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isBulkUpdating ? '更新中…' : '批量修改阶段'}
            </button>
            <button
              type="button"
              onClick={handleBulkTrash}
              disabled={isBulkUpdating}
              className="min-h-9 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[var(--h1-color)] hover:bg-[var(--surface)] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isBulkUpdating ? '处理中…' : '批量移入回收站'}</span>
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="min-h-9 px-2 text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer">取消</button>
          </div>
        </div>
      )}

      {/* 2. Bulk action bar for TRASH scope */}
      {selectedIds.size > 0 && archiveScope === 'trash' && (
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--canvas)]/60 px-4 py-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 font-medium text-[var(--ink)]">
            <CheckSquare className="h-4 w-4 text-[var(--ink-muted)] shrink-0" />
            <span>已选择 {selectedIds.size} 个回收站选题</span>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              type="button"
              onClick={() => void handleBulkRestore()}
              disabled={isBulkUpdating}
              className="flex items-center gap-1 min-h-9 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface)] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isBulkUpdating ? '恢复中…' : '批量恢复'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleBulkPermanentDelete()}
              disabled={isBulkUpdating}
              className="flex items-center gap-1 min-h-9 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[var(--h1-color)] hover:bg-[var(--surface)] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isBulkUpdating ? '删除中…' : '批量永久删除'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="min-h-9 px-2 text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Mobile Card List */}
      <FloatingScrollbar className="space-y-3 p-3 pb-[max(5rem,var(--mobile-bottom-nav-clearance))]" wrapperClassName="flex-1 min-h-0 md:hidden">
          {sortedTopics.map((topic) => {
            const totalScore =
              (topic.score_character || 0) +
              (topic.score_conflict || 0) +
              (topic.score_contrast || 0) +
              (topic.score_material || 0) +
              (topic.score_story || 0);
            const minutes = topic.draft_word_count
              ? (topic.draft_word_count / readingSpeed).toFixed(1)
              : '0';
            const isArchived = topic.status === 'published' || topic.status === 'icebox';

            return (
              <article key={topic.id} className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-4 cv-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(topic.id)}
                      onChange={(event) => {
                        event.stopPropagation();
                        setSelectedIds((previous) => {
                          const next = new Set(previous);
                          if (next.has(topic.id)) next.delete(topic.id);
                          else next.add(topic.id);
                          return next;
                        });
                      }}
                      className="mt-1 h-4 w-4 rounded border-stone-300 accent-[var(--accent)] shrink-0 cursor-pointer"
                      aria-label={`选择选题「${topic.title}」`}
                    />
                    <button
                      onClick={() => archiveScope !== 'trash' && onOpenDetail(topic.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-base font-semibold text-[var(--ink)]">{topic.title}</span>
                      {(topic.summary || topic.hook) && (
                        <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                          {topic.summary || topic.hook}
                        </span>
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() => void togglePin(topic.id)}
                    disabled={archiveScope === 'trash' || isArchived}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                      topic.is_pinned
                        ? 'border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--line)] text-[var(--ink-muted)]'
                    }`}
                    title={isArchived ? '归档选题不可设为主推' : topic.is_pinned ? '取消置顶' : '置顶选题'}
                  >
                    <Pin className={`h-4 w-4 ${topic.is_pinned ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <CustomSelect
                    value={topic.status}
                    onChange={(val) => void updateTopicStatus(topic.id, val as TopicStatus).catch(() => undefined)}
                    ariaLabel={`修改「${topic.title}」阶段`}
                    size="sm"
                    options={COLUMNS.map((column) => ({ value: column.status, label: column.label }))}
                  />
                  <PriorityBadge priority={topic.priority} />
                  <span className="ml-auto text-[11px] text-stone-600 dark:text-stone-400">{formatRelativeTime(topic.updated_at)}</span>
                </div>

                <div className="mt-3 rounded-r-[var(--radius-sm)] border-l-2 border-[var(--accent)] bg-[var(--canvas)]/60 px-3 py-2 text-xs text-[var(--ink)]">
                  <span className="font-medium text-[var(--accent)]">当前行动：</span>
                  {topic.current_todo?.title || '未设置当前行动'}
                </div>

                {(topic.tags?.length || topic.people?.length) ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {topic.tags?.slice(0, 3).map((tag) => (
                      <span key={tag.id || tag.name} className="rounded-md bg-[var(--canvas)] px-2 py-1 text-[10px] text-[var(--ink-muted)]">
                        #{tag.name}
                      </span>
                    ))}
                    {topic.people?.slice(0, 2).map((person) => (
                      <span key={person.id} className="rounded-md bg-[var(--canvas)] px-2 py-1 text-[10px] text-[var(--ink-muted)]">
                        {person.name}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-3 divide-x divide-[var(--line)] rounded-[var(--radius-sm)] bg-[var(--canvas)]/65 py-2 text-center">
                  <div>
                    <div className="text-[10px] text-stone-600 dark:text-stone-400">故事评分</div>
                    <div className="mt-0.5 font-mono text-xs font-medium text-[var(--ink)]">{totalScore || '—'}{totalScore ? '/10' : ''}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-stone-600 dark:text-stone-400">文案字数</div>
                    <div className="mt-0.5 font-mono text-xs font-medium text-[var(--ink)]">{(topic.draft_word_count || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-stone-600 dark:text-stone-400">预估时长</div>
                    <div className="mt-0.5 text-xs font-medium text-[var(--ink)]"><span className="font-mono tabular-nums">{minutes}</span> 分钟</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2 border-t border-stone-100 dark:border-stone-800 pt-3">
                  {archiveScope === 'trash' ? (
                    <>
                      <button
                        onClick={() => void restoreTopic(topic.id)}
                        className="flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                      >
                        <RotateCcw className="h-4 w-4" /> 恢复选题
                      </button>
                      <button
                        onClick={() => requestPermanentlyDeleteTopic(topic)}
                        className="flex min-h-10 items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-800 px-3 text-xs font-semibold text-red-600 dark:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" /> 永久删除
                      </button>
                    </>
                  ) : isArchived ? (
                    <button
                      onClick={() => void updateTopicStatus(topic.id, 'inbox').catch(() => undefined)}
                      className="flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[var(--accent)] hover:bg-[var(--canvas)]"
                    >
                      <RotateCcw className="h-4 w-4" /> 恢复至收集箱
                    </button>
                  ) : (
                    <button
                      onClick={() => setArchiveTopicId(topic.id)}
                      className="flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
                    >
                      <Archive className="h-4 w-4" /> 归档
                    </button>
                  )}
                  {archiveScope !== 'trash' && <button
                    onClick={() => onOpenDetail(topic.id)}
                    className="flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-medium text-white hover:opacity-90"
                  >
                    打开工作台 <ArrowRight className="h-4 w-4" />
                  </button>}
                  {archiveScope !== 'trash' && <button
                    onClick={() => requestDeleteTopic(topic)}
                    className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-[var(--h1-color)] hover:bg-[var(--canvas)] cursor-pointer"
                    title="移入回收站"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>}
                </div>
              </article>
            );
          })}

          {sortedTopics.length === 0 && (
            <div className="py-16 text-center text-sm text-stone-600 dark:text-stone-400">
              {archiveScope === 'trash' ? '回收站为空' : archiveScope === 'archived' ? '归档库暂无已发布或搁置的选题' : '暂无匹配的选题数据'}
            </div>
          )}
      </FloatingScrollbar>

      {/* Table Scroll Container */}
      <FloatingScrollbar
        className="topic-table-container w-full min-w-full overflow-x-auto overscroll-contain"
        wrapperClassName="hidden flex-1 min-h-0 md:block"
      >
        <table className="w-full text-left border-collapse text-xs">
          {/* Table Header */}
          <thead className="table-header-row bg-[var(--canvas)]/85 sticky top-0 z-10 border-b border-[var(--line)] text-[var(--ink-muted)] font-medium select-none">
            <tr>
              <th className="w-10 px-3 py-3 text-center">
                <input
                  type="checkbox"
                  aria-label="选择当前页全部选题"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="accent-[var(--accent)]"
                />
              </th>
              <th className="py-3 px-3 w-10 text-center"><Pin className="mx-auto h-3.5 w-3.5" aria-label="置顶" /></th>

              <th
                onClick={() => handleHeaderClick('title')}
                className="min-w-[240px] px-3 py-3 cursor-pointer group hover:bg-stone-100/80 dark:hover:bg-stone-800 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>选题标题与核心看点</span>
                  {renderSortIndicator('title')}
                </div>
              </th>

              {isColumnVisible('status') && <th
                onClick={() => handleHeaderClick('status')}
                className="py-3 px-3 w-28 cursor-pointer group hover:bg-stone-100/80 dark:hover:bg-stone-800 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>阶段状态</span>
                  {renderSortIndicator('status')}
                </div>
              </th>}

              {isColumnVisible('priority') && <th
                onClick={() => handleHeaderClick('priority')}
                className="py-3 px-3 w-20 text-center cursor-pointer group hover:bg-stone-100/80 dark:hover:bg-stone-800 transition-colors"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>优先级</span>
                  {renderSortIndicator('priority')}
                </div>
              </th>}

              {isColumnVisible('current_action') && <th className="py-3 px-3 min-w-[180px]">
                <span>当前行动</span>
              </th>}

              {isColumnVisible('tags') && <th className="py-3 px-3 min-w-[130px]">
                <span>分类标签</span>
              </th>}

              {isColumnVisible('people') && <th className="py-3 px-3 min-w-[120px]">
                <span>关联人物</span>
              </th>}

              {isColumnVisible('score') && <th
                onClick={() => handleHeaderClick('score')}
                className="py-3 px-3 w-24 text-center cursor-pointer group hover:bg-stone-100/80 dark:hover:bg-stone-800 transition-colors"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>故事评分</span>
                  {renderSortIndicator('score')}
                </div>
              </th>}

              {isColumnVisible('words') && <th
                onClick={() => handleHeaderClick('words')}
                className="py-3 px-3 w-28 text-right cursor-pointer group hover:bg-stone-100/80 dark:hover:bg-stone-800 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>字数 / 预估时长</span>
                  {renderSortIndicator('words')}
                </div>
              </th>}

              {isColumnVisible('updated_at') && <th
                onClick={() => handleHeaderClick('updated_at')}
                className="py-3 px-3 w-24 text-right cursor-pointer group hover:bg-stone-100/80 dark:hover:bg-stone-800 transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>更新时间</span>
                  {renderSortIndicator('updated_at')}
                </div>
              </th>}

              <th className="py-3 px-3 w-28 text-center">操作</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {sortedTopics.map((topic) => {
              const totalScore =
                (topic.score_character || 0) +
                (topic.score_conflict || 0) +
                (topic.score_contrast || 0) +
                (topic.score_material || 0) +
                (topic.score_story || 0);

              const minutes = topic.draft_word_count
                ? (topic.draft_word_count / readingSpeed).toFixed(1)
                : '0';

              const isArchived = topic.status === 'published' || topic.status === 'icebox';

              return (
                <tr
                  key={topic.id}
                  onClick={() => archiveScope !== 'trash' && onOpenDetail(topic.id)}
                  className={`transition-colors duration-150 group cv-auto ${
                    archiveScope === 'trash' ? '' : 'cursor-pointer'
                  } ${
                    selectedIds.has(topic.id)
                      ? 'bg-[var(--accent-soft)]/65 hover:bg-[var(--accent-soft)]'
                      : 'hover:bg-[var(--canvas)]/75'
                  }`}
                >
                  <td
                    onClick={(event) => event.stopPropagation()}
                    className={`${rowPadding} px-3 text-center border-l-2 transition-colors ${
                      selectedIds.has(topic.id)
                        ? 'border-[var(--accent)]'
                        : 'border-transparent group-hover:border-[var(--accent)]/35'
                    }`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`选择「${topic.title}」`}
                      checked={selectedIds.has(topic.id)}
                      onChange={() => setSelectedIds((previous) => {
                        const next = new Set(previous);
                        if (next.has(topic.id)) next.delete(topic.id);
                        else next.add(topic.id);
                        return next;
                      })}
                      className="accent-[var(--accent)] cursor-pointer"
                    />
                  </td>
                  {/* 1. Pin / Index */}
                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                      if (archiveScope !== 'trash' && !isArchived) void togglePin(topic.id);
                    }}
                    className={`${rowPadding} px-3 text-center`}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (archiveScope !== 'trash' && !isArchived) void togglePin(topic.id);
                      }}
                      disabled={archiveScope === 'trash' || isArchived}
                      title={isArchived ? '归档选题不可设为主推' : topic.is_pinned ? '取消置顶' : '置顶选题'}
                      className={`p-1 rounded transition-colors ${isArchived ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'} ${
                        topic.is_pinned
                          ? 'text-[var(--accent)] hover:text-[var(--ink-muted)]'
                          : 'text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Pin className={`w-3.5 h-3.5 ${topic.is_pinned ? 'fill-current' : ''}`} />
                    </button>
                  </td>

                  {/* 2. Title & Hook */}
                  <td className={`${rowPadding} px-3`}>
                    <div className="space-y-0.5 max-w-sm">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--ink)] text-xs line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                        <span>{topic.title}</span>
                      </div>
                      {topic.summary ? (
                        <p className="text-[11px] text-stone-600 dark:text-stone-300 line-clamp-1 group-hover:text-stone-700 dark:group-hover:text-stone-200 transition-colors">
                          {topic.summary}
                        </p>
                      ) : topic.hook ? (
                        <p className="text-[11px] text-stone-600 dark:text-stone-300 italic line-clamp-1 group-hover:text-stone-700 dark:group-hover:text-stone-200 transition-colors">
                          Hook: {topic.hook}
                        </p>
                      ) : null}
                    </div>
                  </td>

                  {/* 3. Status (With Dropdown Streamlining) */}
                  {isColumnVisible('status') && (
                    <TableStatusCell
                      topic={topic}
                      rowPadding={rowPadding}
                      updateTopicStatus={updateTopicStatus}
                    />
                  )}

                  {/* 4. Priority */}
                  {isColumnVisible('priority') && <td className={`${rowPadding} px-3 text-center`}>
                    <div className="flex items-center justify-center">
                      <PriorityBadge priority={topic.priority} />
                    </div>
                  </td>}

                  {/* 5. Current Action */}
                  {isColumnVisible('current_action') && <td className={`${rowPadding} px-3`}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenCurrentAction(topic.id);
                      }}
                      className={`inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-[var(--radius-sm)] px-2 py-1 text-left text-[11px] font-medium transition-colors cursor-pointer ${topic.current_todo ? 'bg-[var(--accent-soft)]/60 text-[var(--accent-dark)] hover:bg-[var(--accent-soft)]' : 'text-[var(--ink-muted)] hover:bg-[var(--canvas)]'}`}
                      title="管理当前行动"
                    >
                      <Zap className={`h-3 w-3 shrink-0 ${topic.current_todo ? 'text-[var(--accent)]' : 'text-[var(--ink-muted)]'}`} aria-hidden="true" />
                      <span className="truncate">{topic.current_todo?.title || '未设置当前行动'}</span>
                    </button>
                  </td>}

                  {/* 6. Tags */}
                  {isColumnVisible('tags') && <td className={`${rowPadding} px-3`}>
                    <div className="flex flex-wrap gap-1 max-w-[160px]">
                      {topic.tags && topic.tags.length > 0 ? (
                        topic.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag.id || tag.name}
                            className="inline-flex items-center text-[10px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-md select-none"
                          >
                            #{tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-stone-300 dark:text-stone-600 italic text-[11px]">-</span>
                      )}
                      {topic.tags && topic.tags.length > 2 && (
                        <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">+{topic.tags.length - 2}</span>
                      )}
                    </div>
                  </td>}

                  {/* 7. People */}
                  {isColumnVisible('people') && <td className={`${rowPadding} px-3`}>
                    <div className="flex flex-wrap gap-1 max-w-[140px]">
                      {topic.people && topic.people.length > 0 ? (
                        topic.people.slice(0, 2).map((person) => (
                          <span
                            key={person.id}
                            className="inline-flex items-center text-[10px] text-[var(--ink-muted)] px-1 py-0.5 select-none"
                          >
                            {person.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-stone-300 dark:text-stone-600 italic text-[11px]">-</span>
                      )}
                    </div>
                  </td>}

                  {/* 8. Story Rating Score */}
                  {isColumnVisible('score') && <td className={`${rowPadding} px-3 text-center`}>
                    {totalScore > 0 ? (
                      <div className="inline-flex items-center gap-1 font-mono font-medium text-xs text-[var(--ink)] select-none">
                        <span>{totalScore}</span>
                        <span className="text-[10px] text-[var(--ink-muted)] font-normal">/10</span>
                      </div>
                    ) : (
                      <span className="text-stone-600 dark:text-stone-400 text-[11px]">未评分</span>
                    )}
                  </td>}

                  {/* 9. Word Count & Estimated Duration */}
                  {isColumnVisible('words') && <td className={`${rowPadding} px-3 text-right`}>
                    {topic.draft_word_count ? (
                      <div>
                        <div className="font-bold text-stone-800 dark:text-stone-200"><span className="font-mono tabular-nums">{topic.draft_word_count.toLocaleString()}</span> 字</div>
                        <div className="text-[10px] text-stone-400 dark:text-stone-500">~<span className="font-mono tabular-nums">{minutes}</span> 分钟</div>
                      </div>
                    ) : (
                      <span className="text-stone-300 dark:text-stone-600 text-[11px]"><span className="font-mono tabular-nums">0</span> 字</span>
                    )}
                  </td>}

                  {/* 10. Updated Time */}
                  {isColumnVisible('updated_at') && <td className={`${rowPadding} px-3 text-right text-stone-400 dark:text-stone-500 text-[11px] tabular-nums`}>
                    {formatRelativeTime(topic.updated_at)}
                  </td>}

                  {/* 11. Actions */}
                  <td
                    onClick={(e) => e.stopPropagation()}
                    className={`${rowPadding} px-3 text-center`}
                  >
                    <div className="flex items-center justify-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      {/* Archive / Restore action */}
                      {archiveScope === 'trash' ? (
                        <>
                          <button
                            onClick={() => void restoreTopic(topic.id)}
                            className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                            title="恢复选题"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => requestPermanentlyDeleteTopic(topic)}
                            className="p-1.5 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                            title="永久删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : isArchived ? (
                        <button
                          onClick={() => void updateTopicStatus(topic.id, 'inbox').catch(() => undefined)}
                          className="p-1.5 text-[var(--accent)] hover:bg-[var(--canvas)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                          title="从归档中恢复至收集箱"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setArchiveTopicId(topic.id)}
                          className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                          title="归档此选题"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}


                      {archiveScope !== 'trash' && <button
                        onClick={() => requestDeleteTopic(topic)}
                        className="p-1.5 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="移入回收站"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>}
                    </div>
                  </td>
                </tr>
              );
            })}

            {sortedTopics.length === 0 && (
              <tr>
                <td colSpan={4 + visibleColumns.length} className="py-16 text-center text-stone-600 dark:text-stone-400 text-sm">
                  {archiveScope === 'trash' ? '回收站为空' : archiveScope === 'archived' ? '归档库暂无已发布或搁置的选题' : '暂无匹配的选题数据'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </FloatingScrollbar>

      {/* Table Summary Footer */}
      <div className="hidden p-3.5 bg-[var(--canvas)]/55 border-t border-[var(--line)] md:flex items-center justify-between text-xs text-[var(--ink-muted)] font-medium shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span>当前页：<strong className="text-[var(--ink)]"><span className="font-mono tabular-nums">{sortedTopics.length}</span> 个选题</strong></span>
          <span>•</span>
          <span>全库写稿中：<strong className="text-[var(--accent)]"><span className="font-mono tabular-nums">{inScriptingCount}</span> 篇</strong></span>
          <span>•</span>
          <span>全库累计文案：<strong className="text-[var(--ink)]"><span className="font-mono tabular-nums">{totalWords.toLocaleString()}</span> 字</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1 || pageQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-40">上一页</button>
          <span><span className="font-mono tabular-nums">{page} / {Math.max(1, pageQuery.data?.total_pages || 1)}</span> · 共 <span className="font-mono tabular-nums">{pageQuery.data?.total || 0}</span> 条</span>
          <button type="button" disabled={page >= (pageQuery.data?.total_pages || 1) || pageQuery.isFetching} onClick={() => setPage((value) => value + 1)} className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-40">下一页</button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-[var(--line)] bg-[var(--canvas)]/55 p-3 text-xs md:hidden">
        <button type="button" disabled={page <= 1 || pageQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-[var(--radius-sm)] px-3 py-2 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-40">上一页</button>
        <span className="text-stone-500 dark:text-stone-400 font-mono tabular-nums">{page} / {Math.max(1, pageQuery.data?.total_pages || 1)}</span>
        <button type="button" disabled={page >= (pageQuery.data?.total_pages || 1) || pageQuery.isFetching} onClick={() => setPage((value) => value + 1)} className="rounded-[var(--radius-sm)] px-3 py-2 text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-40">下一页</button>
      </div>

      <Modal
        isOpen={Boolean(archiveTopicId)}
        onClose={() => setArchiveTopicId(null)}
        title="归档选题"
        maxWidth="sm"
      >
        <p className="text-xs leading-relaxed text-stone-500 dark:text-stone-400">请选择归档状态；取消不会修改当前选题。</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              const topicId = archiveTopicId;
              setArchiveTopicId(null);
              if (topicId) void updateTopicStatus(topicId, 'published').catch(() => undefined);
            }}
            className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
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
            className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--canvas)] px-3 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface)]"
          >
            搁置
          </button>
        </div>
        <button
          type="button"
          onClick={() => setArchiveTopicId(null)}
          className="mt-2 w-full rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2 text-sm font-semibold text-stone-600 dark:text-stone-300 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800"
        >
          取消
        </button>
      </Modal>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        tone={confirmDialog.tone}
      />
    </div>
  );
};
