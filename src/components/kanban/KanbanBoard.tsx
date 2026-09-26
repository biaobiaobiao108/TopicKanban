import React, { useState, useRef, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  CollisionDetection,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  closestCorners,
  pointerWithin,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Topic, TopicStatus, Priority, Tag, Person, PaginatedTopics } from '../../types';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { KanbanFilters, SortField } from './KanbanFilters';
import { ACTIVE_COLUMNS } from './columns';
import { CheckCircle2, KanbanSquare, Snowflake } from 'lucide-react';
import { PageHeader } from '../layout/PageHeader';
import { matchesTopicSearch } from '../../lib/topicSearch';
import { fetchTopicPage } from '../../lib/storage';

const activeStatuses: TopicStatus[] = ['inbox', 'scripting', 'production'];
const terminalStatuses: Array<'icebox' | 'published'> = ['icebox', 'published'];
const terminalDropIds: Record<'icebox' | 'published', string> = {
  icebox: 'topic-flow-icebox',
  published: 'topic-flow-published',
};
const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)';

function isPointerInsideCornerFan(
  args: Parameters<CollisionDetection>[0],
  id: string,
  corner: 'left' | 'right',
): boolean {
  const point = args.pointerCoordinates;
  const rect = args.droppableRects.get(id);
  if (!point || !rect) return false;

  const horizontalDistance = corner === 'left' ? point.x - rect.left : rect.right - point.x;
  const verticalDistance = rect.bottom - point.y;
  const radius = Math.min(rect.width, rect.height);
  return horizontalDistance >= 0
    && verticalDistance >= 0
    && horizontalDistance ** 2 + verticalDistance ** 2 <= radius ** 2;
}

const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const terminalDrop = pointerCollisions.find((collision) => {
    const status = terminalStatuses.find((candidate) => terminalDropIds[candidate] === String(collision.id));
    if (!status) return false;
    return isPointerInsideCornerFan(args, String(collision.id), status === 'icebox' ? 'left' : 'right');
  });
  if (terminalDrop) return [terminalDrop];

  if (!args.pointerCoordinates) return closestCorners(args);
  const terminalIds = new Set(Object.values(terminalDropIds));
  return closestCorners({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => !terminalIds.has(String(container.id))),
    droppableRects: new Map([...args.droppableRects].filter(([id]) => !terminalIds.has(String(id)))),
  });
};

const TopicFlowDropTarget: React.FC<{ status: 'icebox' | 'published' }> = ({ status }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: terminalDropIds[status],
    data: { type: 'terminal-status', status },
  });
  const Icon = status === 'icebox' ? Snowflake : CheckCircle2;
  const label = status === 'icebox' ? '搁置' : '已发布';
  const isLeft = status === 'icebox';

  return (
    <div
      ref={setNodeRef}
      data-testid={`kanban-flow-target-${status}`}
      data-over={isOver ? 'true' : 'false'}
      role="group"
      aria-label={`拖到这里将选题流转到${label}`}
      className={`pointer-events-auto fixed bottom-0 z-[60] h-36 w-36 select-none text-[var(--ink-muted)] transition-colors ${isLeft ? 'left-0 md:left-64' : 'right-0'}`}
      style={{
        clipPath: `circle(144px at ${isLeft ? '0%' : '100%'} 100%)`,
      }}
    >
      <div
        className={`absolute inset-0 transition-colors ${isOver ? 'bg-[var(--line)]' : 'bg-[var(--line)]/75'}`}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-[1px] transition-colors ${isOver ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)]' : 'bg-[var(--surface)]/95'}`}
        style={{ clipPath: `circle(142px at ${isLeft ? '0%' : '100%'} 100%)` }}
        aria-hidden="true"
      />
      <div className={`absolute bottom-5 z-10 flex max-w-[104px] flex-col gap-1 text-xs font-semibold leading-tight ${isLeft ? 'left-5 items-start text-left' : 'right-5 items-end text-right'}`}>
        <Icon className={`h-4 w-4 ${isOver ? 'text-[var(--accent)]' : ''}`} aria-hidden="true" />
        <span>{isOver ? `松开以${label}` : label}</span>
      </div>
    </div>
  );
};

const TopicFlowDropZone: React.FC = () => (
  <div data-testid="kanban-flow-drop-zone" role="group" aria-label="阶段流转区域：左下角搁置，右下角已发布">
    <TopicFlowDropTarget status="icebox" />
    <TopicFlowDropTarget status="published" />
  </div>
);

function subscribeToMobileViewport(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', callback);
  } else {
    mediaQuery.addListener(callback);
  }
  return () => {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', callback);
    } else {
      mediaQuery.removeListener(callback);
    }
  };
}

function getIsMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
}

type BoardColumns = Record<TopicStatus, string[]>;
type TopicMap = Record<string, Topic>;
type LoadedTopicsByStatus = Record<TopicStatus, Topic[]>;
type BoardSnapshot = {
  columns: BoardColumns;
  topics: TopicMap;
  loadedTopicsByStatus: LoadedTopicsByStatus;
};

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

function topicSyncSignature(topic: Topic): string {
  return [
    topic.id,
    topic.status,
    topic.sort_order,
    topic.is_pinned,
    topic.updated_at,
    topic.title,
    topic.priority,
    topic.current_todo?.id || '',
    topic.current_todo?.title || '',
  ].join('|');
}

function findContainer(columns: BoardColumns, id: string): TopicStatus | undefined {
  return activeStatuses.find((status) => status === id || (columns[status] && columns[status].includes(id)));
}

function cloneColumns(columns: BoardColumns): BoardColumns {
  return Object.fromEntries(activeStatuses.map((status) => [status, [...(columns[status] || [])]])) as BoardColumns;
}

function cloneLoadedTopicsByStatus(loadedTopicsByStatus: LoadedTopicsByStatus): LoadedTopicsByStatus {
  return Object.fromEntries(
    activeStatuses.map((status) => [status, [...(loadedTopicsByStatus[status] || [])]])
  ) as LoadedTopicsByStatus;
}

function cloneBoard(
  columns: BoardColumns,
  topics: TopicMap,
  loadedTopicsByStatus: LoadedTopicsByStatus,
): BoardSnapshot {
  return {
    columns: cloneColumns(columns),
    topics: { ...topics },
    loadedTopicsByStatus: cloneLoadedTopicsByStatus(loadedTopicsByStatus),
  };
}

class NonTouchPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }) => {
        return event.isPrimary && event.button === 0 && event.pointerType !== 'touch';
      },
    },
  ];
}

function moveBetweenColumns(
  columns: BoardColumns,
  activeId: string,
  overId: string,
  target: TopicStatus
): BoardColumns {
  const next = cloneColumns(columns);
  const source = findContainer(columns, activeId);
  if (!source) return columns;

  next[source] = (next[source] || []).filter((id) => id !== activeId);
  if (!next[target]) next[target] = [];
  const overIndex = overId === target ? next[target].length : next[target].indexOf(overId);
  next[target].splice(overIndex < 0 ? next[target].length : overIndex, 0, activeId);
  return next;
}

function reorderLoadedTopics(
  loadedTopicsByStatus: LoadedTopicsByStatus,
  columns: BoardColumns,
  topics: TopicMap,
): LoadedTopicsByStatus {
  return activeStatuses.reduce((result, status) => {
    const loadedById = new Map((loadedTopicsByStatus[status] || []).map((topic) => [topic.id, topic]));
    result[status] = (columns[status] || [])
      .map((id) => topics[id] || loadedById.get(id))
      .filter((topic): topic is Topic => Boolean(topic));
    return result;
  }, {} as LoadedTopicsByStatus);
}

interface KanbanBoardProps {
  topics: Topic[];
  onOpenDetail: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void | Promise<void>;
  onTogglePin: (topicId: string) => void;
  onUpdateTopicStatus: (topicId: string, status: TopicStatus, sortOrder?: number) => Promise<void>;
  onReorderTopics: (updates: Array<{ id: string; status: TopicStatus; sort_order: number }>) => Promise<void>;
  onQuickAddTopic: (status: TopicStatus) => void;
  availableTags: Tag[];
  availablePeople: Person[];
  searchTerm: string;
  staleActionDays?: number;
  onOpenCurrentAction?: (topicId: string) => void;
}

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
  onOpenCurrentAction,
}) => {
  const queryClient = useQueryClient();
  const isMobileViewport = useSyncExternalStore(subscribeToMobileViewport, getIsMobileViewport, () => false);
  const [topicsMap, setTopicsMap] = useState<TopicMap>(() => createTopicMap(topics));
  const [columns, setColumns] = useState<BoardColumns>(() => createColumns(topics));
  const [columnPages, setColumnPages] = useState<Record<TopicStatus, number>>(() => (
    Object.fromEntries(activeStatuses.map((status) => [status, 1])) as Record<TopicStatus, number>
  ));
  const [loadedTopicsByStatus, setLoadedTopicsByStatus] = useState<LoadedTopicsByStatus>(() => (
    Object.fromEntries(activeStatuses.map((status) => [status, []])) as unknown as Record<TopicStatus, Topic[]>
  ));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null);
  const [isReorderPending, setIsReorderPending] = useState(false);
  const [loadingMorePage, setLoadingMorePage] = useState<Partial<Record<TopicStatus, number>>>({});
  const [revealedTopic, setRevealedTopic] = useState<{ id: string; status: TopicStatus } | null>(null);
  const snapshotRef = useRef<BoardSnapshot | null>(null);
  // Dnd-kit can dispatch the final event before React commits the last
  // onDragOver state update. Keep a synchronous drag-only board so the end
  // handler never falls back to the previous render's column structure.
  const dragBoardRef = useRef<BoardSnapshot | null>(null);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [selectedTagId, setSelectedTagId] = useState<string | 'all'>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortField>('sort_order');
  const [mobileActiveStage, setMobileActiveStage] = useState<TopicStatus>('inbox');
  const mobileStageAutoSelectedRef = useRef(false);
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
      subscribed: true,
      placeholderData: keepPreviousData,
    })),
  });

  const columnQuerySignature = columnQueries.map((query) => (
    `${query.dataUpdatedAt}:${query.isPlaceholderData ? 'placeholder' : 'ready'}`
  )).join('|');
  const columnLoadStateSignature = columnQueries.map((query) => (
    `${query.isFetching ? 'fetching' : 'idle'}:${query.isPlaceholderData ? 'placeholder' : 'ready'}:${query.isError ? 'error' : 'ok'}`
  )).join('|');

  useEffect(() => {
    setColumnPages(Object.fromEntries(activeStatuses.map((status) => [status, 1])) as Record<TopicStatus, number>);
    setLoadingMorePage({});
    mobileStageAutoSelectedRef.current = false;
    setMobileActiveStage('inbox');
  }, [searchTerm, priorityFilter, selectedTagId, selectedPersonId, sortBy]);

  useEffect(() => {
    setLoadingMorePage((current) => {
      let changed = false;
      const next = { ...current };
      activeStatuses.forEach((status, index) => {
        const requestedPage = next[status];
        if (requestedPage === undefined) return;
        const query = columnQueries[index];
        if (columnPages[status] !== requestedPage || query?.isError || (query && !query.isFetching && !query.isPlaceholderData)) {
          delete next[status];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [columnLoadStateSignature, columnPages]);

  useEffect(() => {
    // A reorder updates the visible board before the server responds. Ignore
    // query snapshots from an older request until the mutation has settled so
    // an in-flight page response cannot temporarily erase the moved card.
    if (activeId || isReorderPending) return;

    const parentTopicsById = new Map(topics.map((topic) => [topic.id, topic]));
    setLoadedTopicsByStatus((current) => {
      let changed = false;
      const next = { ...current };
      activeStatuses.forEach((status, index) => {
        const query = columnQueries[index];
        const items = query?.isPlaceholderData ? undefined : query?.data?.items;
        if (!items) return;

        const mergedItems = items.map((item) => {
          const parentTopic = parentTopicsById.get(item.id);
          return parentTopic ? { ...item, ...parentTopic } : item;
        });

        const currentPage = columnPages[status] || 1;
        if (currentPage === 1) {
          const currentList = current[status] || [];
          const revealTopicFromCurrent = revealedTopic?.status === status
            ? currentList.find((topic) => topic.id === revealedTopic.id)
            : undefined;
          const revealTopicFromParent = revealedTopic?.status === status
            ? parentTopicsById.get(revealedTopic.id)
            : undefined;
          const revealTopicSource = revealTopicFromCurrent || revealTopicFromParent;
          const retainedRevealTopic = revealTopicSource
            ? { ...revealTopicSource, ...revealTopicFromParent, status }
            : undefined;
          const revealMatchesFilters = retainedRevealTopic
            && matchesTopicSearch(retainedRevealTopic, searchTerm)
            && (priorityFilter === 'all' || retainedRevealTopic.priority === priorityFilter)
            && (selectedTagId === 'all' || retainedRevealTopic.tags?.some((tag) => tag.id === selectedTagId))
            && (selectedPersonId === 'all' || retainedRevealTopic.people?.some((person) => person.id === selectedPersonId));
          const pageOneItems = retainedRevealTopic && revealMatchesFilters && !mergedItems.some((topic) => topic.id === retainedRevealTopic.id)
            ? [...mergedItems, retainedRevealTopic].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            : mergedItems;
          const currentSig = currentList.map(topicSyncSignature).join(',');
          const newSig = pageOneItems.map(topicSyncSignature).join(',');
          if (currentSig !== newSig) {
            next[status] = pageOneItems;
            changed = true;
          }
        } else {
          const knownIds = new Set((current[status] || []).map((topic) => topic.id));
          const additions = mergedItems.filter((topic) => !knownIds.has(topic.id));
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
  }, [activeId, columnPages, columnQuerySignature, isReorderPending, priorityFilter, revealedTopic, searchTerm, selectedPersonId, selectedTagId, topics]);

  const pagedTopics = useMemo(
    () => activeStatuses.flatMap((status) => loadedTopicsByStatus[status] || []),
    [loadedTopicsByStatus]
  );
  const hasLoadedBoardData = activeStatuses.some((status) => loadedTopicsByStatus[status].length > 0)
    || columnQueries.some((query) => Boolean(query.data));
  const parentTopicsById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const boardTopics = useMemo(
    () => hasLoadedBoardData ? pagedTopics.map((topic) => parentTopicsById.get(topic.id) ? { ...topic, ...parentTopicsById.get(topic.id) } : topic) : topics,
    [hasLoadedBoardData, parentTopicsById, pagedTopics, topics]
  );
  const columnTotalCounts = useMemo(() => Object.fromEntries(activeStatuses.map((status, index) => [
    status,
    columnQueries[index]?.data?.total ?? topics.filter((topic) => topic.status === status).length,
  ])) as Record<TopicStatus, number>, [columnQueries, topics]);

  useEffect(() => {
    if (mobileStageAutoSelectedRef.current || columnQueries.some((query) => query.isPending || query.isPlaceholderData)) return;
    // Prefer the loaded items over totals: the latter can be stale while a
    // filtered query is settling, and selecting an empty stage makes the
    // mobile board look blank even though another stage has content.
    const firstPopulatedStage = ACTIVE_COLUMNS.find((column) => (loadedTopicsByStatus[column.status] || []).length > 0)?.status;
    if (!firstPopulatedStage) return;
    setMobileActiveStage(firstPopulatedStage);
    mobileStageAutoSelectedRef.current = true;
  }, [columnQuerySignature, columnTotalCounts, loadedTopicsByStatus]);

  useEffect(() => () => {
    if (dragNoticeTimerRef.current) clearTimeout(dragNoticeTimerRef.current);
  }, []);

  // Sync external topics into local state when not dragging
  useEffect(() => {
    if (!activeId && !isReorderPending) {
      setTopicsMap(createTopicMap(boardTopics));
      setColumns(createColumns(boardTopics));
    }
  }, [boardTopics, activeId, isReorderPending]);

  const sensors = useSensors(
    useSensor(NonTouchPointerSensor, {
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
        if (!matchesTopicSearch(topic, searchTerm)) return false;
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

  const visibleColumnTopics = useMemo(() => Object.fromEntries(
    activeStatuses.map((status) => [
      status,
      (visibleColumnIds[status] || []).map((id) => topicsMap[id]).filter(Boolean),
    ]),
  ) as Record<TopicStatus, Topic[]>, [topicsMap, visibleColumnIds]);

  const activeTopic = activeId ? topicsMap[activeId] : null;

  const restoreSnapshot = () => {
    const snapshot = snapshotRef.current;
    if (!snapshot) {
      dragBoardRef.current = null;
      setIsReorderPending(false);
      setRevealedTopic(null);
      return;
    }
    setColumns(snapshot.columns);
    setTopicsMap(snapshot.topics);
    setLoadedTopicsByStatus(snapshot.loadedTopicsByStatus);
    snapshotRef.current = null;
    dragBoardRef.current = null;
    setActiveId(null);
    setActiveCardWidth(null);
    setIsReorderPending(false);
    setRevealedTopic(null);
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

  const captureKanbanQueryCache = () => queryClient.getQueriesData<PaginatedTopics>({
    queryKey: ['kanban-column-page'],
  });

  const restoreKanbanQueryCache = (snapshot: Array<[readonly unknown[], PaginatedTopics | undefined]>) => {
    snapshot.forEach(([queryKey, data]) => {
      queryClient.setQueryData<PaginatedTopics>(queryKey, data);
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const snapshot = cloneBoard(columns, topicsMap, loadedTopicsByStatus);
    snapshotRef.current = snapshot;
    dragBoardRef.current = cloneBoard(snapshot.columns, snapshot.topics, snapshot.loadedTopicsByStatus);
    setActiveId(String(active.id));
    setRevealedTopic(null);

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

    const dragBoard = dragBoardRef.current;
    if (!dragBoard) return;
    const source = findContainer(dragBoard.columns, activeKey);
    const target = findContainer(dragBoard.columns, overKey);
    if (!source || !target || source === target) return;

    const nextColumns = moveBetweenColumns(dragBoard.columns, activeKey, overKey, target);
    const item = dragBoard.topics[activeKey];
    if (!item) return;
    const nextTopicsMap = { ...dragBoard.topics, [activeKey]: { ...item, status: target } };
    dragBoardRef.current = {
      ...dragBoard,
      columns: nextColumns,
      topics: nextTopicsMap,
    };
    setColumns(nextColumns);
    setTopicsMap(nextTopicsMap);
  };

  const handleTerminalStatusDrop = async (topicId: string, status: 'icebox' | 'published') => {
    const snapshot = snapshotRef.current;
    if (!snapshot) {
      setActiveId(null);
      setActiveCardWidth(null);
      return;
    }

    const topic = snapshot.topics[topicId];
    if (!topic) {
      restoreSnapshot();
      return;
    }

    const nextColumns = cloneColumns(snapshot.columns);
    activeStatuses.forEach((activeStatus) => {
      nextColumns[activeStatus] = nextColumns[activeStatus].filter((id) => id !== topicId);
    });
    const nextTopicsMap = { ...snapshot.topics, [topicId]: { ...topic, status } };
    const nextLoadedTopicsByStatus = cloneLoadedTopicsByStatus(snapshot.loadedTopicsByStatus);
    activeStatuses.forEach((activeStatus) => {
      nextLoadedTopicsByStatus[activeStatus] = nextLoadedTopicsByStatus[activeStatus].filter((item) => item.id !== topicId);
    });
    const queryCacheSnapshot = captureKanbanQueryCache();

    setActiveId(null);
    setActiveCardWidth(null);
    setIsReorderPending(true);
    setColumns(nextColumns);
    setTopicsMap(nextTopicsMap);
    setLoadedTopicsByStatus(nextLoadedTopicsByStatus);
    setRevealedTopic(null);
    snapshotRef.current = null;
    dragBoardRef.current = null;

    try {
      await queryClient.cancelQueries({ queryKey: ['kanban-column-page'] });
      optimisticUpdateQueryCache([{ id: topicId, status, sort_order: 1 }]);
      await onUpdateTopicStatus(topicId, status);
    } catch {
      restoreKanbanQueryCache(queryCacheSnapshot);
      setColumns(snapshot.columns);
      setTopicsMap(snapshot.topics);
      setLoadedTopicsByStatus(snapshot.loadedTopicsByStatus);
    } finally {
      setIsReorderPending(false);
    }
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
    const overData = over.data.current as { type?: string; status?: TopicStatus } | undefined;
    if (overData?.type === 'terminal-status' && (overData.status === 'icebox' || overData.status === 'published')) {
      await handleTerminalStatusDrop(activeKey, overData.status);
      return;
    }

    const dragBoard = dragBoardRef.current;
    const dragColumns = dragBoard?.columns || columns;
    const dragTopicsMap = dragBoard?.topics || topicsMap;
    const dragLoadedTopicsByStatus = dragBoard?.loadedTopicsByStatus || loadedTopicsByStatus;
    const source = findContainer(snapshot.columns, activeKey);
    const target = findContainer(dragColumns, overKey);
    if (!source || !target) {
      restoreSnapshot();
      return;
    }

    let nextColumns = dragColumns;
    if (source === target && activeKey !== overKey) {
      const oldIndex = dragColumns[source].indexOf(activeKey);
      const newIndex = dragColumns[target].indexOf(overKey);
      if (oldIndex !== -1 && newIndex !== -1) {
        nextColumns = { ...dragColumns, [source]: arrayMove(dragColumns[source], oldIndex, newIndex) };
      }
    } else if (source !== target && !dragColumns[target].includes(activeKey)) {
      // If the pointer is released before the final onDragOver commit, move
      // the card from the authoritative snapshot into the release target.
      nextColumns = moveBetweenColumns(dragColumns, activeKey, overKey, target);
    }

    const activeTopic = dragTopicsMap[activeKey];
    if (!activeTopic) {
      restoreSnapshot();
      return;
    }

    const nextTopicsMap = {
      ...dragTopicsMap,
      [activeKey]: { ...activeTopic, status: target },
    };
    const updates: Array<{ id: string; status: TopicStatus; sort_order: number }> = [];
    nextColumns[target].forEach((id, idx) => {
      updates.push({ id, status: target, sort_order: idx + 1 });
    });
    if (source !== target) {
      nextColumns[source].forEach((id, idx) => {
        updates.push({ id, status: source, sort_order: idx + 1 });
      });
    }

    const orderedTopicsMap = { ...nextTopicsMap };
    updates.forEach(({ id, status, sort_order }) => {
      const topic = orderedTopicsMap[id];
      if (topic) orderedTopicsMap[id] = { ...topic, status, sort_order };
    });
    const nextLoadedTopicsByStatus = reorderLoadedTopics(dragLoadedTopicsByStatus, nextColumns, orderedTopicsMap);

    setIsReorderPending(true);
    setActiveId(null);
    setColumns(nextColumns);
    setTopicsMap(orderedTopicsMap);
    setLoadedTopicsByStatus(nextLoadedTopicsByStatus);
    setRevealedTopic(source !== target ? { id: activeKey, status: target } : null);
    dragBoardRef.current = {
      columns: nextColumns,
      topics: orderedTopicsMap,
      loadedTopicsByStatus: nextLoadedTopicsByStatus,
    };

    if (sortBy !== 'sort_order') {
      setSortBy('sort_order');
      setDragSortNotice(true);
      if (dragNoticeTimerRef.current) clearTimeout(dragNoticeTimerRef.current);
      dragNoticeTimerRef.current = setTimeout(() => setDragSortNotice(false), 3500);
    }

    const queryCacheSnapshot = captureKanbanQueryCache();
    try {
      // Stop an older page response from overwriting the optimistic board
      // while the reorder request is in flight.
      await queryClient.cancelQueries({ queryKey: ['kanban-column-page'] });
      optimisticUpdateQueryCache(updates);
      await onReorderTopics(updates);
      snapshotRef.current = null;
      dragBoardRef.current = null;
      setIsReorderPending(false);
    } catch {
      restoreKanbanQueryCache(queryCacheSnapshot);
      restoreSnapshot();
    }
  };

  const handleDragCancel = () => {
    restoreSnapshot();
  };

  const handleKeyboardMove = useCallback(async (topic: Topic, direction: -1 | 1) => {
    const currentIndex = activeStatuses.indexOf(topic.status);
    if (currentIndex === -1) return;
    const targetStatus = activeStatuses[currentIndex + direction];
    if (!targetStatus) return;

    const snapshot = cloneBoard(columns, topicsMap, loadedTopicsByStatus);
    const nextColumns = moveBetweenColumns(columns, topic.id, targetStatus, targetStatus);
    const nextTopicsMap = {
      ...topicsMap,
      [topic.id]: { ...topic, status: targetStatus },
    };

    const updates: Array<{ id: string; status: TopicStatus; sort_order: number }> = [];
    nextColumns[targetStatus].forEach((id, idx) => {
      updates.push({ id, status: targetStatus, sort_order: idx + 1 });
    });
    nextColumns[topic.status].forEach((id, idx) => {
      updates.push({ id, status: topic.status, sort_order: idx + 1 });
    });

    const orderedTopicsMap = { ...nextTopicsMap };
    updates.forEach(({ id, status, sort_order }) => {
      const currentTopic = orderedTopicsMap[id];
      if (currentTopic) orderedTopicsMap[id] = { ...currentTopic, status, sort_order };
    });
    const nextLoadedTopicsByStatus = reorderLoadedTopics(loadedTopicsByStatus, nextColumns, orderedTopicsMap);

    setColumns(nextColumns);
    setTopicsMap(orderedTopicsMap);
    setLoadedTopicsByStatus(nextLoadedTopicsByStatus);
    setRevealedTopic({ id: topic.id, status: targetStatus });
    dragBoardRef.current = null;
    setIsReorderPending(true);

    const queryCacheSnapshot = captureKanbanQueryCache();
    try {
      await queryClient.cancelQueries({ queryKey: ['kanban-column-page'] });
      optimisticUpdateQueryCache(updates);
      await onReorderTopics(updates);
      setIsReorderPending(false);
    } catch {
      restoreKanbanQueryCache(queryCacheSnapshot);
      setColumns(snapshot.columns);
      setTopicsMap(snapshot.topics);
      setLoadedTopicsByStatus(snapshot.loadedTopicsByStatus);
      setRevealedTopic(null);
      setIsReorderPending(false);
    }
  }, [columns, loadedTopicsByStatus, onReorderTopics, optimisticUpdateQueryCache, queryClient, topicsMap]);

  const hasActiveFilters =
    priorityFilter !== 'all' ||
    selectedTagId !== 'all' ||
    selectedPersonId !== 'all' ||
    sortBy !== 'sort_order';
  const isColumnDataSettling = columnQueries.some((query) => query.isPending || query.isPlaceholderData);
  const isDragDisabled = isMobileViewport || isColumnDataSettling || isReorderPending || Boolean(searchTerm) || priorityFilter !== 'all' || selectedTagId !== 'all' || selectedPersonId !== 'all';

  const handleResetFilters = useCallback(() => {
    setPriorityFilter('all');
    setSelectedTagId('all');
    setSelectedPersonId('all');
    setSortBy('sort_order');
  }, []);

  const loadMoreColumn = useCallback((status: TopicStatus) => {
    if (loadingMorePage[status] !== undefined) return;
    const nextPage = columnPages[status] + 1;
    setLoadingMorePage((current) => ({ ...current, [status]: nextPage }));
    setColumnPages((current) => ({ ...current, [status]: nextPage }));
  }, [columnPages, loadingMorePage]);
  const loadMoreHandlers = useMemo(() => Object.fromEntries(
    activeStatuses.map((status) => [status, () => loadMoreColumn(status)]),
  ) as Record<TopicStatus, () => void>, [loadMoreColumn]);

  const handleColumnDelete = useCallback(async (topicId: string) => {
    const snapshot = cloneBoard(columns, topicsMap, loadedTopicsByStatus);
    const previousColumnQueries = queryClient.getQueriesData<PaginatedTopics>({ queryKey: ['kanban-column-page'] });
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
    try {
      await onDeleteTopic(topicId);
    } catch (error) {
      setColumns(snapshot.columns);
      setTopicsMap(snapshot.topics);
      setLoadedTopicsByStatus(snapshot.loadedTopicsByStatus);
      previousColumnQueries.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
      throw error;
    }
  }, [columns, loadedTopicsByStatus, onDeleteTopic, queryClient, topicsMap]);

  return (
    <div data-testid="kanban-page" className="mx-auto flex min-h-0 h-full w-full max-w-7xl min-w-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-5 mobile-bottom-nav-content sm:gap-7 sm:px-8 sm:py-7">
      <PageHeader title="选题全景看板" icon={KanbanSquare} />

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

      </div>

      {/* Mobile Stage Selector Pill Bar (iPhone Safari optimized) */}
      <div data-testid="kanban-mobile-stage-tabs" className="md:hidden flex min-h-9 shrink-0 items-center gap-1.5 overflow-x-auto no-scrollbar -mx-2 rounded-[var(--radius-sm)] bg-[var(--canvas)] p-1 transition-colors">
        {ACTIVE_COLUMNS.map((col) => {
          const count = columnTotalCounts[col.status] || 0;
          const isActive = mobileActiveStage === col.status;
          return (
            <button
              key={col.status}
              onClick={() => setMobileActiveStage(col.status)}
              className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-[var(--radius-sm)] flex items-center gap-1.5 transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-2xs'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)]'
              }`}
            >
              <span>{col.label}</span>
              <span className={`text-[10px] px-1 py-0.2 rounded-[var(--radius-sm)] tabular-nums ${
                isActive ? 'bg-[var(--accent-dark)] text-white' : 'text-[var(--ink-muted)] opacity-75'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* DND Context & Board Grid (3 Active Columns) */}
      <DndContext
        key={isMobileViewport ? 'mobile' : 'desktop'}
        collisionDetection={kanbanCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        sensors={isMobileViewport ? [] : sensors}
      >
        {isMobileViewport ? (
          <div key={mobileActiveStage} data-testid="kanban-mobile-stage" className="mobile-stage-enter min-w-0">
            {ACTIVE_COLUMNS.filter((c) => c.status === mobileActiveStage).map((col) => {
              const colTopics = visibleColumnTopics[col.status] || [];
              return (
                <KanbanColumn
                  key={col.status}
                  status={col.status}
                  label={col.label}
                  description={col.description}
                  topics={colTopics}
                  onOpenDetail={onOpenDetail}
                  onOpenCurrentAction={onOpenCurrentAction}
                  revealTopicId={revealedTopic?.status === col.status ? revealedTopic.id : null}
                  totalCount={columnTotalCounts[col.status] || 0}
                  hasMore={(columnTotalCounts[col.status] || 0) > (loadedTopicsByStatus[col.status]?.length || colTopics.length)}
                  isLoadingMore={loadingMorePage[col.status] === columnPages[col.status]}
                  onLoadMore={loadMoreHandlers[col.status]}
                  onDeleteTopic={handleColumnDelete}
                  onTogglePin={onTogglePin}
                  onQuickAddTopic={onQuickAddTopic}
                  onKeyboardMove={handleKeyboardMove}
                  sortableDisabled
                  staleThresholdDays={staleActionDays}
                  mobileMode
                />
              );
            })}
          </div>
        ) : (
          /* Desktop three-column board; drag and drop remains available here. */
          <div data-testid="kanban-desktop-board" className="min-w-0 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ACTIVE_COLUMNS.map((col) => {
              const colTopics = visibleColumnTopics[col.status] || [];
              return (
                <div key={col.status} className="min-w-0">
                  <KanbanColumn
                    status={col.status}
                    label={col.label}
                    description={col.description}
                    topics={colTopics}
                    onOpenDetail={onOpenDetail}
                    onOpenCurrentAction={onOpenCurrentAction}
                    revealTopicId={revealedTopic?.status === col.status ? revealedTopic.id : null}
                    totalCount={columnTotalCounts[col.status] || 0}
                    hasMore={(columnTotalCounts[col.status] || 0) > (loadedTopicsByStatus[col.status]?.length || colTopics.length)}
                    isLoadingMore={loadingMorePage[col.status] === columnPages[col.status]}
                    onLoadMore={loadMoreHandlers[col.status]}
                    onDeleteTopic={handleColumnDelete}
                    onTogglePin={onTogglePin}
                    onQuickAddTopic={onQuickAddTopic}
                    onKeyboardMove={handleKeyboardMove}
                    sortableDisabled={isDragDisabled}
                    staleThresholdDays={staleActionDays}
                  />
                </div>
              );
            })}
          </div>
        )}

        {typeof document !== 'undefined' && createPortal(
          <DragOverlay dropAnimation={null} zIndex={80}>
            {activeTopic ? (
              <div
                style={{ width: activeCardWidth ? `${activeCardWidth}px` : undefined }}
                data-testid="kanban-drag-overlay"
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
          </DragOverlay>,
          document.body,
        )}
        {activeId && typeof document !== 'undefined' && createPortal(
          <TopicFlowDropZone />,
          document.body,
        )}
      </DndContext>
    </div>
  );
};
