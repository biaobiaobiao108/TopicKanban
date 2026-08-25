import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  closestCorners,
  defaultDropAnimationSideEffects,
  DropAnimation,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Topic, TopicStatus, Priority, Tag, Person, PaginatedTopics } from '../../types';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { KanbanFilters, SortField } from './KanbanFilters';
import { ACTIVE_COLUMNS } from './columns';
import { AlertTriangle } from 'lucide-react';
import { getNextActionAgeDays, isActiveTopic, isNextActionDeferred } from '../../lib/topicMetrics';
import { fetchTopicPage } from '../../lib/storage';

const activeStatuses: TopicStatus[] = ['inbox', 'approved', 'scripting', 'production'];

type BoardColumns = Record<TopicStatus, string[]>;
type TopicMap = Record<string, Topic>;
type BoardSnapshot = { columns: BoardColumns; topics: TopicMap };

function createColumns(topics: Topic[]): BoardColumns {
  const seen = new Set<string>();
  return activeStatuses.reduce((result, status) => {
    result[status] = topics
      .filter((topic) => {
        if (topic.status !== status) return false;
        if (seen.has(topic.id)) return false;
        seen.add(topic.id);
        return true;
      })
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((topic) => topic.id);
    return result;
  }, {} as BoardColumns);
}

function createTopicMap(topics: Topic[]): TopicMap {
  return Object.fromEntries(topics.map((topic) => [topic.id, topic]));
}

function findContainer(columns: BoardColumns, id: string): TopicStatus | undefined {
  return activeStatuses.find((status) => status === id || (columns[status] && columns[status].includes(id)));
}

function cloneBoard(columns: BoardColumns, topics: TopicMap): BoardSnapshot {
  return {
    columns: Object.fromEntries(activeStatuses.map((status) => [status, [...(columns[status] || [])]])) as BoardColumns,
    topics: { ...topics },
  };
}

function moveBetweenColumns(
  columns: BoardColumns,
  activeId: string,
  overId: string,
  target: TopicStatus
): BoardColumns {
  const next = cloneBoard(columns, {}).columns;
  const source = findContainer(columns, activeId);
  if (!source) return columns;

  next[source] = (next[source] || []).filter((id) => id !== activeId);
  if (!next[target]) next[target] = [];
  const overIndex = overId === target ? next[target].length : next[target].indexOf(overId);
  next[target].splice(overIndex < 0 ? next[target].length : overIndex, 0, activeId);
  return next;
}

interface KanbanBoardProps {
  topics: Topic[];
  onOpenDetail: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onTogglePin: (topicId: string) => void;
  onUpdateTopicStatus: (topicId: string, status: TopicStatus, sortOrder?: number) => Promise<void>;
  onReorderTopics: (updates: Array<{ id: string; status: TopicStatus; sort_order: number }>) => Promise<void>;
  onQuickAddTopic: (status: TopicStatus) => void;
  availableTags: Tag[];
  availablePeople: Person[];
  searchTerm: string;
  staleActionDays?: number;
}

// Smooth drop animation configuration matching testkanban
const dropAnimationConfig: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.35',
      },
    },
  }),
  duration: 180,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  topics,
  onOpenDetail,
  onDeleteTopic,
  onTogglePin,
  onUpdateTopicStatus,
  onReorderTopics,
  onQuickAddTopic,
  availableTags,
  availablePeople,
  searchTerm,
  staleActionDays = 5,
}) => {
  const queryClient = useQueryClient();
  const [topicsMap, setTopicsMap] = useState<TopicMap>(() => createTopicMap(topics));
  const [columns, setColumns] = useState<BoardColumns>(() => createColumns(topics));
  const [columnPages, setColumnPages] = useState<Record<TopicStatus, number>>(() => (
    Object.fromEntries(activeStatuses.map((status) => [status, 1])) as Record<TopicStatus, number>
  ));
  const [loadedTopicsByStatus, setLoadedTopicsByStatus] = useState<Record<TopicStatus, Topic[]>>(() => (
    Object.fromEntries(activeStatuses.map((status) => [status, []])) as unknown as Record<TopicStatus, Topic[]>
  ));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null);
  const snapshotRef = useRef<BoardSnapshot | null>(null);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [selectedTagId, setSelectedTagId] = useState<string | 'all'>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortField>('sort_order');
  const [mobileActiveStage, setMobileActiveStage] = useState<TopicStatus | 'all'>('all');
  const [dragSortNotice, setDragSortNotice] = useState(false);
  const dragNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const columnQueries = useQueries({
    queries: activeStatuses.map((status) => ({
      queryKey: ['kanban-column-page', status, searchTerm, priorityFilter, selectedTagId, selectedPersonId, sortBy, columnPages[status]],
      queryFn: () => fetchTopicPage({
        scope: 'active',
        status,
        page: columnPages[status],
        page_size: 30,
        q: searchTerm,
        priority: priorityFilter === 'all' ? undefined : priorityFilter,
        tag_id: selectedTagId === 'all' ? undefined : selectedTagId,
        person_id: selectedPersonId === 'all' ? undefined : selectedPersonId,
        sort: sortBy,
        direction: sortBy === 'sort_order' ? 'asc' : 'desc',
      }),
      placeholderData: keepPreviousData,
    })),
  });

  useEffect(() => {
    setColumnPages(Object.fromEntries(activeStatuses.map((status) => [status, 1])) as Record<TopicStatus, number>);
    setLoadedTopicsByStatus(Object.fromEntries(activeStatuses.map((status) => [status, []])) as unknown as Record<TopicStatus, Topic[]>);
  }, [searchTerm, priorityFilter, selectedTagId, selectedPersonId, sortBy]);

  useEffect(() => {
    setLoadedTopicsByStatus((current) => {
      let changed = false;
      const next = { ...current };
      activeStatuses.forEach((status, index) => {
        const query = columnQueries[index];
        const items = query?.isPlaceholderData ? undefined : query?.data?.items;
        if (!items) return;

        const currentPage = columnPages[status] || 1;
        if (currentPage === 1) {
          const currentList = current[status] || [];
          const currentSig = currentList.map((t) => `${t.id}-${t.status}-${t.sort_order}`).join(',');
          const newSig = items.map((t) => `${t.id}-${t.status}-${t.sort_order}`).join(',');
          if (currentSig !== newSig) {
            next[status] = items;
            changed = true;
          }
        } else {
          const knownIds = new Set((current[status] || []).map((topic) => topic.id));
          const additions = items.filter((topic) => !knownIds.has(topic.id));
          if (additions.length > 0) {
            next[status] = [...(current[status] || []), ...additions];
            changed = true;
          }
        }
      });

      if (changed) {
        // Enforce strict global uniqueness across all active columns
        const seen = new Set<string>();
        activeStatuses.forEach((status) => {
          next[status] = (next[status] || []).filter((topic) => {
            if (topic.status !== status) return false;
            if (seen.has(topic.id)) return false;
            seen.add(topic.id);
            return true;
          });
        });
      }

      return changed ? next : current;
    });
  }, [columnQueries, columnPages]);

  const pagedTopics = useMemo(
    () => activeStatuses.flatMap((status) => loadedTopicsByStatus[status] || []),
    [loadedTopicsByStatus]
  );
  const hasLoadedBoardData = activeStatuses.some((status) => loadedTopicsByStatus[status].length > 0)
    || columnQueries.some((query) => Boolean(query.data));
  const boardTopics = hasLoadedBoardData ? pagedTopics : topics;
  const columnTotalCounts = useMemo(() => Object.fromEntries(activeStatuses.map((status, index) => [
    status,
    columnQueries[index]?.data?.total ?? topics.filter((topic) => topic.status === status).length,
  ])) as Record<TopicStatus, number>, [columnQueries, topics]);

  useEffect(() => () => {
    if (dragNoticeTimerRef.current) clearTimeout(dragNoticeTimerRef.current);
  }, []);

  // Sync external topics into local state when not dragging
  useEffect(() => {
    if (!activeId) {
      setTopicsMap(createTopicMap(boardTopics));
      setColumns(createColumns(boardTopics));
    }
  }, [boardTopics, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Visible topics grouped by columns, with filtering and sorting applied
  const visibleColumnIds = useMemo(() => {
    return activeStatuses.reduce((result, status) => {
      const ids = (columns[status] || []).filter((id) => {
        const topic = topicsMap[id];
        if (!topic) return false;
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const matchTitle = topic.title.toLowerCase().includes(q);
          const matchSummary = topic.summary?.toLowerCase().includes(q);
          const matchHook = topic.hook?.toLowerCase().includes(q);
          const matchAction = topic.next_action?.toLowerCase().includes(q);
          const matchPerson = topic.people?.some((p) => p.name.toLowerCase().includes(q));
          const matchTag = topic.tags?.some((t) => t.name.toLowerCase().includes(q));
          if (!matchTitle && !matchSummary && !matchHook && !matchAction && !matchPerson && !matchTag) return false;
        }
        if (priorityFilter !== 'all' && topic.priority !== priorityFilter) return false;
        if (selectedTagId !== 'all' && !topic.tags?.some((t) => t.id === selectedTagId)) return false;
        if (selectedPersonId !== 'all' && !topic.people?.some((p) => p.id === selectedPersonId)) return false;
        return true;
      });

      if (!activeId && sortBy !== 'sort_order') {
        ids.sort((a, b) => {
          const tA = topicsMap[a];
          const tB = topicsMap[b];
          if (!tA || !tB) return 0;
          if (sortBy === 'updated_at') return new Date(tB.updated_at).getTime() - new Date(tA.updated_at).getTime();
          if (sortBy === 'created_at') return new Date(tB.created_at).getTime() - new Date(tA.created_at).getTime();
          if (sortBy === 'priority') {
            const pMap = { high: 3, medium: 2, low: 1, none: 0 };
            return pMap[tB.priority] - pMap[tA.priority];
          }
          if (sortBy === 'score') {
            const sA = (tA.score_character || 0) + (tA.score_conflict || 0) + (tA.score_contrast || 0) + (tA.score_material || 0) + (tA.score_story || 0);
            const sB = (tB.score_character || 0) + (tB.score_conflict || 0) + (tB.score_contrast || 0) + (tB.score_material || 0) + (tB.score_story || 0);
            return sB - sA;
          }
          return 0;
        });
      }

      result[status] = ids;
      return result;
    }, {} as BoardColumns);
  }, [columns, topicsMap, searchTerm, priorityFilter, selectedTagId, selectedPersonId, sortBy, activeId]);

  const activeTopic = activeId ? topicsMap[activeId] : null;

  const restoreSnapshot = () => {
    if (!snapshotRef.current) return;
    setColumns(snapshotRef.current.columns);
    setTopicsMap(snapshotRef.current.topics);
    snapshotRef.current = null;
    setActiveId(null);
    setActiveCardWidth(null);
  };

  const optimisticUpdateQueryCache = useCallback((updates: Array<{ id: string; status: TopicStatus; sort_order: number }>) => {
    const updateMap = new Map(updates.map((u) => [u.id, u]));
    const nowIso = new Date().toISOString();

    activeStatuses.forEach((queryStatus) => {
      queryClient.setQueriesData<PaginatedTopics>(
        { queryKey: ['kanban-column-page', queryStatus] },
        (oldData?: PaginatedTopics) => {
          if (!oldData || !Array.isArray(oldData.items)) return oldData;

          // Items targeted to this column
          const additions: Topic[] = [];
          updates.forEach((u) => {
            if (u.status === queryStatus) {
              const existing = topicsMap[u.id] || oldData.items.find((t: Topic) => t.id === u.id);
              if (existing) {
                additions.push({
                  ...existing,
                  status: queryStatus,
                  sort_order: u.sort_order,
                  updated_at: nowIso,
                });
              }
            }
          });

          // Remove items that moved away to a different status
          const keptItems = oldData.items.filter((t: Topic) => {
            const u = updateMap.get(t.id);
            if (u && u.status !== queryStatus) return false;
            return true;
          });

          // Combine and deduplicate
          const mergedMap = new Map<string, Topic>();
          keptItems.forEach((t: Topic) => mergedMap.set(t.id, t));
          additions.forEach((t: Topic) => mergedMap.set(t.id, t));

          const newItems = Array.from(mergedMap.values()).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          const delta = (newItems.length - keptItems.length) - (oldData.items.length - keptItems.length);

          return {
            ...oldData,
            items: newItems,
            total: Math.max(0, oldData.total + delta),
          };
        }
      );
    });
  }, [queryClient, topicsMap]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    snapshotRef.current = cloneBoard(columns, topicsMap);
    setActiveId(String(active.id));

    // Measure current card's layout width for pixel-perfect DragOverlay
    const cardEl = document.querySelector(`[data-topic-id="${active.id}"]`);
    if (cardEl) {
      setActiveCardWidth(cardEl.getBoundingClientRect().width);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;

    const source = findContainer(columns, activeKey);
    const target = findContainer(columns, overKey);
    if (!source || !target || source === target) return;

    setColumns((current) => moveBetweenColumns(current, activeKey, overKey, target));
    setTopicsMap((current) => {
      const item = current[activeKey];
      if (!item) return current;
      return { ...current, [activeKey]: { ...item, status: target } };
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardWidth(null);

    const snapshot = snapshotRef.current;
    if (!snapshot) {
      setActiveId(null);
      return;
    }
    if (!over) {
      restoreSnapshot();
      return;
    }

    const activeKey = String(active.id);
    const overKey = String(over.id);
    const source = findContainer(columns, activeKey);
    const target = findContainer(columns, overKey);
    if (!source || !target) {
      restoreSnapshot();
      return;
    }

    let nextColumns = columns;
    if (source === target && activeKey !== overKey) {
      const oldIndex = columns[source].indexOf(activeKey);
      const newIndex = columns[target].indexOf(overKey);
      if (oldIndex !== -1 && newIndex !== -1) {
        nextColumns = { ...columns, [source]: arrayMove(columns[source], oldIndex, newIndex) };
      }
    }

    const nextTopicsMap = {
      ...topicsMap,
      [activeKey]: { ...topicsMap[activeKey], status: target },
    };

    setActiveId(null);
    snapshotRef.current = null;
    setColumns(nextColumns);
    setTopicsMap(nextTopicsMap);
    setLoadedTopicsByStatus((current) => {
      const next = { ...current };
      activeStatuses.forEach((status) => {
        const remaining = (current[status] || []).filter((t) => t.id !== activeKey);
        if (status === target) {
          const item = topicsMap[activeKey] ? { ...topicsMap[activeKey], status: target } : undefined;
          next[status] = item ? [...remaining, item] : remaining;
        } else {
          next[status] = remaining;
        }
      });
      return next;
    });

    if (sortBy !== 'sort_order') {
      setSortBy('sort_order');
      setDragSortNotice(true);
      if (dragNoticeTimerRef.current) clearTimeout(dragNoticeTimerRef.current);
      dragNoticeTimerRef.current = setTimeout(() => setDragSortNotice(false), 3500);
    }

    const updates: Array<{ id: string; status: TopicStatus; sort_order: number }> = [];
    nextColumns[target].forEach((id, idx) => {
      updates.push({ id, status: target, sort_order: idx + 1 });
    });
    if (source !== target) {
      nextColumns[source].forEach((id, idx) => {
        updates.push({ id, status: source, sort_order: idx + 1 });
      });
    }

    optimisticUpdateQueryCache(updates);

    try {
      await onReorderTopics(updates);
      await queryClient.invalidateQueries({ queryKey: ['kanban-column-page'] });
    } catch {
      restoreSnapshot();
    }
  };

  const handleDragCancel = () => {
    restoreSnapshot();
  };

  const handleKeyboardMove = async (topic: Topic, direction: -1 | 1) => {
    const currentIndex = activeStatuses.indexOf(topic.status);
    if (currentIndex === -1) return;
    const targetStatus = activeStatuses[currentIndex + direction];
    if (!targetStatus) return;

    const snapshot = cloneBoard(columns, topicsMap);
    const nextColumns = moveBetweenColumns(columns, topic.id, targetStatus, targetStatus);
    const nextTopicsMap = {
      ...topicsMap,
      [topic.id]: { ...topic, status: targetStatus },
    };

    setColumns(nextColumns);
    setTopicsMap(nextTopicsMap);
    setLoadedTopicsByStatus((current) => {
      const next = { ...current };
      activeStatuses.forEach((status) => {
        const remaining = (current[status] || []).filter((t) => t.id !== topic.id);
        if (status === targetStatus) {
          next[status] = [...remaining, { ...topic, status: targetStatus }];
        } else {
          next[status] = remaining;
        }
      });
      return next;
    });

    const updates: Array<{ id: string; status: TopicStatus; sort_order: number }> = [];
    nextColumns[targetStatus].forEach((id, idx) => {
      updates.push({ id, status: targetStatus, sort_order: idx + 1 });
    });
    nextColumns[topic.status].forEach((id, idx) => {
      updates.push({ id, status: topic.status, sort_order: idx + 1 });
    });

    optimisticUpdateQueryCache(updates);

    try {
      await onReorderTopics(updates);
      await queryClient.invalidateQueries({ queryKey: ['kanban-column-page'] });
    } catch {
      setColumns(snapshot.columns);
      setTopicsMap(snapshot.topics);
    }
  };

  // WIP and stale action stats
  const approvedCount = (columns.approved || []).length;
  const scriptingCount = (columns.scripting || []).length;
  const stagnantTopics = boardTopics
    .filter((topic) => isActiveTopic(topic) && !isNextActionDeferred(topic) && getNextActionAgeDays(topic) >= staleActionDays)
    .sort((a, b) => getNextActionAgeDays(b) - getNextActionAgeDays(a));
  const wipWarnings = [
    approvedCount > 5 ? `已立项 ${approvedCount} 个，超过建议上限 5 个` : null,
    scriptingCount > 2 ? `写稿中 ${scriptingCount} 个，超过建议上限 2 个` : null,
  ].filter((warning): warning is string => Boolean(warning));

  const hasActiveFilters =
    priorityFilter !== 'all' ||
    selectedTagId !== 'all' ||
    selectedPersonId !== 'all' ||
    sortBy !== 'sort_order';
  const isDragDisabled = Boolean(searchTerm) || priorityFilter !== 'all' || selectedTagId !== 'all' || selectedPersonId !== 'all';

  const handleResetFilters = () => {
    setPriorityFilter('all');
    setSelectedTagId('all');
    setSelectedPersonId('all');
    setSortBy('sort_order');
  };

  const totalActiveCount = activeStatuses.reduce((acc, status) => acc + (columnTotalCounts[status] || 0), 0);

  const loadMoreColumn = (status: TopicStatus) => {
    setColumnPages((current) => ({ ...current, [status]: current[status] + 1 }));
  };

  const handleColumnDelete = (topicId: string) => {
    setLoadedTopicsByStatus((current) => {
      const next = { ...current };
      activeStatuses.forEach((s) => {
        next[s] = (current[s] || []).filter((t) => t.id !== topicId);
      });
      return next;
    });
    queryClient.setQueriesData<PaginatedTopics>(
      { queryKey: ['kanban-column-page'] },
      (old) => old ? {
        ...old,
        items: old.items.filter((t) => t.id !== topicId),
        total: Math.max(0, old.total - (old.items.some((t) => t.id === topicId) ? 1 : 0)),
      } : old
    );
    void Promise.resolve(onDeleteTopic(topicId)).then(() => queryClient.invalidateQueries({ queryKey: ['kanban-column-page'] }));
  };

  const handleColumnStatusUpdate = (topicId: string, status: TopicStatus) => {
    setLoadedTopicsByStatus((current) => {
      const next = { ...current };
      const item = topicsMap[topicId] ? { ...topicsMap[topicId], status } : undefined;
      activeStatuses.forEach((s) => {
        const remaining = (current[s] || []).filter((t) => t.id !== topicId);
        if (s === status && item) {
          next[s] = [...remaining, item];
        } else {
          next[s] = remaining;
        }
      });
      return next;
    });
    optimisticUpdateQueryCache([{ id: topicId, status, sort_order: 1 }]);
    void onUpdateTopicStatus(topicId, status).then(() => queryClient.invalidateQueries({ queryKey: ['kanban-column-page'] }));
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
      {/* Filters Bar & View Switcher */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Filter Dropdowns */}
          <div className="flex-1 min-w-0">
            <KanbanFilters
              priorityFilter={priorityFilter}
              onPriorityFilterChange={setPriorityFilter}
              selectedTagId={selectedTagId}
              onTagFilterChange={setSelectedTagId}
              selectedPersonId={selectedPersonId}
              onPersonFilterChange={setSelectedPersonId}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              availableTags={availableTags}
              availablePeople={availablePeople}
              onResetFilters={handleResetFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </div>
        </div>

        {dragSortNotice && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-xs">
            <span>已切换到「看板自定义排序」，拖拽后的位置将按卡片顺序保存</span>
            <button
              onClick={() => setDragSortNotice(false)}
              className="ml-auto shrink-0 font-semibold hover:text-amber-950 dark:hover:text-amber-100 cursor-pointer"
              aria-label="关闭提示"
            >
              知道了
            </button>
          </div>
        )}

        {(wipWarnings.length > 0 || stagnantTopics.length > 0) && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200">在制品提醒：先收尾，再开新坑</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-800 dark:text-amber-200">
                  {wipWarnings.map((warning) => <span key={warning}>{warning}</span>)}
                  {stagnantTopics.length > 0 && <span>{stagnantTopics.length} 个选题已停滞 {staleActionDays} 天以上</span>}
                </div>
                {stagnantTopics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {stagnantTopics.slice(0, 3).map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => onOpenDetail(topic.id)}
                        className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-stone-800 px-2 py-1 text-[11px] font-semibold text-stone-700 dark:text-stone-200 hover:border-amber-400 dark:hover:border-amber-600 hover:text-amber-900 dark:hover:text-amber-200 cursor-pointer"
                      >
                        {topic.title} · {getNextActionAgeDays(topic)} 天
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Stage Selector Pill Bar (iPhone Safari optimized) */}
      <div className="md:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 -mx-4 px-4 border-b border-stone-200/60 dark:border-stone-800 transition-colors">
        <button
          onClick={() => setMobileActiveStage('all')}
          className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
            mobileActiveStage === 'all'
              ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-2xs font-bold'
              : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700'
          }`}
        >
          全部活跃 ({totalActiveCount})
        </button>
        {ACTIVE_COLUMNS.map((col) => {
          const count = columnTotalCounts[col.status] || 0;
          const isActive = mobileActiveStage === col.status;
          return (
            <button
              key={col.status}
              onClick={() => setMobileActiveStage(col.status)}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer ${
                isActive
                  ? 'bg-rose-600 text-white shadow-2xs font-bold'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700'
              }`}
            >
              <span>{col.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isActive ? 'bg-rose-700 dark:bg-rose-800 text-white font-bold' : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* DND Context & Board Grid (4 Active Columns) */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* If Mobile Active Stage is chosen, only show that column on mobile */}
        {mobileActiveStage !== 'all' ? (
          <div className="md:hidden">
            {ACTIVE_COLUMNS.filter((c) => c.status === mobileActiveStage).map((col) => {
              const ids = visibleColumnIds[col.status] || [];
              const colTopics = ids.map((id) => topicsMap[id]).filter(Boolean);
              return (
                <KanbanColumn
                  key={col.status}
                  status={col.status}
                  label={col.label}
                  description={col.description}
                  topics={colTopics}
                  onOpenDetail={onOpenDetail}
                  totalCount={columnTotalCounts[col.status] || 0}
                  hasMore={(columnTotalCounts[col.status] || 0) > (loadedTopicsByStatus[col.status]?.length || colTopics.length)}
                  isLoadingMore={columnQueries[activeStatuses.indexOf(col.status)]?.isFetching && columnPages[col.status] > 1}
                  onLoadMore={() => loadMoreColumn(col.status)}
                  onDeleteTopic={handleColumnDelete}
                  onTogglePin={onTogglePin}
                  onQuickAddTopic={onQuickAddTopic}
                  onUpdateStatus={handleColumnStatusUpdate}
                  onKeyboardMove={handleKeyboardMove}
                  sortableDisabled={isDragDisabled}
                  staleThresholdDays={staleActionDays}
                />
              );
            })}
          </div>
        ) : null}

        {/* Desktop / Full Grid View (4 Clean Columns: 收集箱, 已立项, 写稿中, 待制作) with Mobile Scroll Snap */}
        <div className={mobileActiveStage !== 'all' ? 'hidden md:grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4' : 'flex md:grid flex-nowrap overflow-x-auto snap-x snap-mandatory no-scrollbar md:overflow-visible grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pb-4 md:pb-0'}>
          {ACTIVE_COLUMNS.map((col) => {
            const ids = visibleColumnIds[col.status] || [];
            const colTopics = ids.map((id) => topicsMap[id]).filter(Boolean);
            return (
              <div key={col.status} className={mobileActiveStage === 'all' ? 'min-w-[85vw] sm:min-w-0 snap-center shrink-0 sm:shrink flex-1' : 'flex-1'}>
                <KanbanColumn
                  status={col.status}
                  label={col.label}
                  description={col.description}
                  topics={colTopics}
                  onOpenDetail={onOpenDetail}
                  totalCount={columnTotalCounts[col.status] || 0}
                  hasMore={(columnTotalCounts[col.status] || 0) > (loadedTopicsByStatus[col.status]?.length || colTopics.length)}
                  isLoadingMore={columnQueries[activeStatuses.indexOf(col.status)]?.isFetching && columnPages[col.status] > 1}
                  onLoadMore={() => loadMoreColumn(col.status)}
                  onDeleteTopic={handleColumnDelete}
                  onTogglePin={onTogglePin}
                  onQuickAddTopic={onQuickAddTopic}
                  onUpdateStatus={handleColumnStatusUpdate}
                  onKeyboardMove={handleKeyboardMove}
                  sortableDisabled={isDragDisabled}
                  staleThresholdDays={staleActionDays}
                />
              </div>
            );
          })}
        </div>

        <DragOverlay dropAnimation={dropAnimationConfig}>
          {activeTopic ? (
            <div
              style={{ width: activeCardWidth ? `${activeCardWidth}px` : undefined }}
              className="pointer-events-none"
            >
              <KanbanCard
                topic={activeTopic}
                isOverlay
                onOpenDetail={() => {}}
                onDeleteTopic={() => {}}
                onTogglePin={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
