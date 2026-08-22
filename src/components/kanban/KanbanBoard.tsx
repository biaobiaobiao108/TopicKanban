import React, { useState, useRef, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Topic, TopicStatus, Priority, Tag, Person } from '../../types';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { KanbanFilters, SortField } from './KanbanFilters';
import { ACTIVE_COLUMNS } from './columns';
import { AlertTriangle } from 'lucide-react';
import { getNextActionAgeDays, isActiveTopic, isNextActionDeferred } from '../../lib/topicMetrics';

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
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [selectedTagId, setSelectedTagId] = useState<string | 'all'>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortField>('sort_order');
  const [mobileActiveStage, setMobileActiveStage] = useState<TopicStatus | 'all'>('all');
  const [dragSortNotice, setDragSortNotice] = useState(false);
  const dragNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (dragNoticeTimerRef.current) clearTimeout(dragNoticeTimerRef.current);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter topics
  let filtered = topics.filter((topic) => {
    // Search
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
    // Priority
    if (priorityFilter !== 'all' && topic.priority !== priorityFilter) return false;
    // Tag
    if (selectedTagId !== 'all') {
      const hasTag = topic.tags?.some((t) => t.id === selectedTagId);
      if (!hasTag) return false;
    }
    // Person
    if (selectedPersonId !== 'all') {
      const hasPerson = topic.people?.some((p) => p.id === selectedPersonId);
      if (!hasPerson) return false;
    }
    return true;
  });

  // Sort topics
  filtered.sort((a, b) => {
    // Pinned topics always on top in default order
    if (a.is_pinned !== b.is_pinned && sortBy === 'sort_order') {
      return (b.is_pinned || 0) - (a.is_pinned || 0);
    }

    if (sortBy === 'updated_at') {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
    if (sortBy === 'created_at') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === 'priority') {
      const pMap = { high: 3, medium: 2, low: 1, none: 0 };
      return pMap[b.priority] - pMap[a.priority];
    }
    if (sortBy === 'score') {
      const scoreA = (a.score_character || 0) + (a.score_conflict || 0) + (a.score_contrast || 0) + (a.score_material || 0) + (a.score_story || 0);
      const scoreB = (b.score_character || 0) + (b.score_conflict || 0) + (b.score_contrast || 0) + (b.score_material || 0) + (b.score_story || 0);
      return scoreB - scoreA;
    }
    return a.sort_order - b.sort_order;
  });

  // For Kanban Board view, we ONLY display active production topics (exclude published & icebox)
  const activeBoardTopics = filtered.filter(
    (t) => t.status !== 'published' && t.status !== 'icebox'
  );
  const approvedCount = topics.filter((topic) => topic.status === 'approved').length;
  const scriptingCount = topics.filter((topic) => topic.status === 'scripting').length;
  const stagnantTopics = topics
    .filter((topic) => isActiveTopic(topic) && !isNextActionDeferred(topic) && getNextActionAgeDays(topic) >= staleActionDays)
    .sort((a, b) => getNextActionAgeDays(b) - getNextActionAgeDays(a));
  const wipWarnings = [
    approvedCount > 5 ? `已立项 ${approvedCount} 个，超过建议上限 5 个` : null,
    scriptingCount > 2 ? `写稿中 ${scriptingCount} 个，超过建议上限 2 个` : null,
  ].filter((warning): warning is string => Boolean(warning));

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const found = topics.find((t) => t.id === active.id);
    if (found) {
      setActiveTopic(found);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTopic(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceTopic = topics.find((t) => t.id === activeId);
    if (!sourceTopic) return;

    if (sortBy !== 'sort_order') {
      setSortBy('sort_order');
      setDragSortNotice(true);
      if (dragNoticeTimerRef.current) {
        clearTimeout(dragNoticeTimerRef.current);
      }
      dragNoticeTimerRef.current = setTimeout(() => {
        setDragSortNotice(false);
      }, 3500);
    }

    const isOverColumn = ACTIVE_COLUMNS.some((col) => col.status === overId);

    if (isOverColumn) {
      const newStatus = overId as TopicStatus;
      if (sourceTopic.status !== newStatus) {
        const destTopics = topics
          .filter((t) => t.status === newStatus && t.id !== activeId)
          .sort((a, b) => a.sort_order - b.sort_order);
        const newSortOrder = destTopics.length + 1;
        await onUpdateTopicStatus(activeId, newStatus, newSortOrder);
      }
      return;
    }

    const targetTopic = topics.find((t) => t.id === overId);
    if (!targetTopic) return;

    const sourceStatus = sourceTopic.status;
    const targetStatus = targetTopic.status;

    if (sourceStatus === targetStatus) {
      const columnTopics = topics
        .filter((t) => t.status === sourceStatus)
        .sort((a, b) => a.sort_order - b.sort_order);

      const oldIndex = columnTopics.findIndex((t) => t.id === activeId);
      const newIndex = columnTopics.findIndex((t) => t.id === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = [...columnTopics];
        const [movedItem] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, movedItem);

        const updates = reordered.map((topic, index) => ({
          id: topic.id,
          status: sourceStatus,
          sort_order: index + 1,
        }));

        await onReorderTopics(updates);
      }
    } else {
      const destTopics = topics
        .filter((t) => t.status === targetStatus && t.id !== activeId)
        .sort((a, b) => a.sort_order - b.sort_order);

      const targetIndex = destTopics.findIndex((t) => t.id === overId);
      const insertIndex = targetIndex === -1 ? destTopics.length : targetIndex;

      destTopics.splice(insertIndex, 0, {
        ...sourceTopic,
        status: targetStatus,
      });

      const updates = destTopics.map((topic, index) => ({
        id: topic.id,
        status: targetStatus,
        sort_order: index + 1,
      }));

      await onReorderTopics(updates);
    }
  };

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
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <span>已切换到「看板自定义排序」，拖拽后的位置将按卡片顺序保存</span>
            <button
              onClick={() => setDragSortNotice(false)}
              className="ml-auto shrink-0 font-semibold hover:text-amber-950 cursor-pointer"
              aria-label="关闭提示"
            >
              知道了
            </button>
          </div>
        )}

        {(wipWarnings.length > 0 || stagnantTopics.length > 0) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-amber-900">在制品提醒：先收尾，再开新坑</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-800">
                  {wipWarnings.map((warning) => <span key={warning}>{warning}</span>)}
                  {stagnantTopics.length > 0 && <span>{stagnantTopics.length} 个选题已停滞 7 天以上</span>}
                </div>
                {stagnantTopics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {stagnantTopics.slice(0, 3).map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => onOpenDetail(topic.id)}
                        className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:border-amber-400 hover:text-amber-900"
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
            <div className="md:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 -mx-4 px-4 border-b border-stone-200/60">
              <button
                onClick={() => setMobileActiveStage('all')}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
                  mobileActiveStage === 'all'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                全部活跃 ({activeBoardTopics.length})
              </button>
              {ACTIVE_COLUMNS.map((col) => {
                const count = activeBoardTopics.filter((t) => t.status === col.status).length;
                const isActive = mobileActiveStage === col.status;
                return (
                  <button
                    key={col.status}
                    onClick={() => setMobileActiveStage(col.status)}
                    className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    <span>{col.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-rose-700 text-white' : 'bg-stone-200 text-stone-700'
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
              onDragEnd={handleDragEnd}
            >
              {/* If Mobile Active Stage is chosen, only show that column on mobile */}
              {mobileActiveStage !== 'all' ? (
                <div className="md:hidden">
                  {ACTIVE_COLUMNS.filter((c) => c.status === mobileActiveStage).map((col) => {
                    const colTopics = activeBoardTopics.filter((t) => t.status === col.status);
                    return (
                      <KanbanColumn
                        key={col.status}
                        status={col.status}
                        label={col.label}
                        description={col.description}
                        topics={colTopics}
                        onOpenDetail={onOpenDetail}
                        onDeleteTopic={onDeleteTopic}
                        onTogglePin={onTogglePin}
                        onQuickAddTopic={onQuickAddTopic}
                        onUpdateStatus={onUpdateTopicStatus}
                        sortableDisabled={isDragDisabled}
                        staleThresholdDays={staleActionDays}
                      />
                    );
                  })}
                </div>
              ) : null}

              {/* Desktop / Full Grid View (4 Clean Columns: 收集箱, 已立项, 写稿中, 待制作) */}
              <div className={mobileActiveStage !== 'all' ? 'hidden md:grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'}>
                {ACTIVE_COLUMNS.map((col) => {
                  const colTopics = activeBoardTopics.filter((t) => t.status === col.status);
                  return (
                    <KanbanColumn
                      key={col.status}
                      status={col.status}
                      label={col.label}
                      description={col.description}
                      topics={colTopics}
                      onOpenDetail={onOpenDetail}
                      onDeleteTopic={onDeleteTopic}
                      onTogglePin={onTogglePin}
                      onQuickAddTopic={onQuickAddTopic}
                      onUpdateStatus={onUpdateTopicStatus}
                      sortableDisabled={isDragDisabled}
                      staleThresholdDays={staleActionDays}
                    />
                  );
                })}
              </div>

              <DragOverlay>
                {activeTopic ? (
                  <div className="rotate-2 scale-105 shadow-modal opacity-95 pointer-events-none w-80">
                    <KanbanCard
                      topic={activeTopic}
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
