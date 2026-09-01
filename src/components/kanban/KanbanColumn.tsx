import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Topic, TopicStatus } from '../../types';
import { KanbanCard } from './KanbanCard';
import { Plus, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface KanbanColumnProps {
  status: TopicStatus;
  label: string;
  description: string;
  topics: Topic[];
  totalCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenDetail: (topicId: string) => void;
  onOpenCurrentAction?: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onTogglePin: (topicId: string) => void;
  onQuickAddTopic: (status: TopicStatus) => void;
  onUpdateStatus?: (topicId: string, status: TopicStatus) => void;
  onKeyboardMove?: (topic: Topic, direction: -1 | 1) => void;
  sortableDisabled?: boolean;
  staleThresholdDays?: number;
}

const DEFAULT_LIMIT = 8;

const columnHeaders: Record<TopicStatus, { dot: string }> = {
  inbox: { dot: 'bg-stone-400 dark:bg-stone-500' },
  approved: { dot: 'bg-emerald-500 dark:bg-emerald-400' },
  scripting: { dot: 'bg-indigo-500 dark:bg-indigo-400' },
  production: { dot: 'bg-purple-500 dark:bg-purple-400' },
  published: { dot: 'bg-teal-500 dark:bg-teal-400' },
  icebox: { dot: 'bg-stone-300 dark:bg-stone-600' },
};

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status,
  label,
  description,
  topics,
  totalCount = topics.length,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onOpenDetail,
  onOpenCurrentAction,
  onDeleteTopic,
  onTogglePin,
  onQuickAddTopic,
  onUpdateStatus,
  onKeyboardMove,
  sortableDisabled,
  staleThresholdDays = 5,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: 'column',
      status,
    },
  });

  const c = columnHeaders[status] || columnHeaders.inbox;

  // Apply display limit
  const visibleTopics = isExpanded ? topics : topics.slice(0, DEFAULT_LIMIT);
  const hiddenCount = topics.length - DEFAULT_LIMIT;

  return (
    <div
      ref={setNodeRef}
      data-column-status={status}
      className={`kanban-column-container w-full rounded-3xl p-3.5 flex flex-col min-h-[220px] border transition-all duration-200 ${
        isOver
          ? 'border-rose-400/80 ring-2 ring-rose-400/30 bg-rose-50/60 dark:bg-rose-950/40 shadow-card'
          : 'border-stone-200/70 dark:border-stone-800/70 bg-stone-100/60 dark:bg-stone-900/50 hover:bg-stone-100/80 dark:hover:bg-stone-900/70'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-1.5 py-1 mb-2.5">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
          <h2 className="text-sm font-bold text-stone-800 dark:text-stone-100 tracking-tight">{label}</h2>
          <span className="kanban-column-count text-xs bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-bold px-2 py-0.5 rounded-full font-mono tabular-nums">
            {totalCount}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onQuickAddTopic(status)}
          aria-label={`在${label}中快速建卡`}
          title={`在${label}中快速建卡`}
          className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Cards Area */}
      <div className="space-y-3 min-h-[140px] flex-1">
        <SortableContext items={visibleTopics.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {visibleTopics.map((topic) => (
            <KanbanCard
              key={topic.id}
              topic={topic}
              onOpenDetail={onOpenDetail}
              onOpenCurrentAction={onOpenCurrentAction}
              onDeleteTopic={onDeleteTopic}
              onTogglePin={onTogglePin}
              onUpdateStatus={onUpdateStatus}
              onKeyboardMove={onKeyboardMove}
              sortableDisabled={sortableDisabled}
              staleThresholdDays={staleThresholdDays}
            />
          ))}
        </SortableContext>

        {topics.length === 0 && (
          <div
            className={`h-28 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl text-xs p-3 text-center transition-all duration-150 ${
              isOver
                ? 'border-rose-400 dark:border-rose-600 bg-rose-50/60 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                : 'border-stone-200/80 dark:border-stone-800 text-stone-600 dark:text-stone-400'
            }`}
          >
            <span className="font-semibold">{isOver ? '松开以移入此阶段' : '暂无选题'}</span>
            <span className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5">
              {isOver ? `将卡片归入「${label}」` : '拖拽卡片至此可快速变更状态'}
            </span>
          </div>
        )}
      </div>

      {/* Expand / Collapse Button if exceeding limit */}
      {hiddenCount > 0 && (
        <div className="pt-2 mt-2 border-t border-stone-200/60 dark:border-stone-800">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white/80 dark:bg-stone-800 hover:bg-white dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 rounded-xl text-xs font-semibold transition-all shadow-2xs cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>收起多余卡片 (显示前 {DEFAULT_LIMIT} 个)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>展开更多 (+{hiddenCount} 个选题)</span>
              </>
            )}
          </button>
        </div>
      )}
      {hasMore && onLoadMore && (
        <div className="pt-2 mt-2 border-t border-stone-200/60 dark:border-stone-800">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white/80 dark:bg-stone-800 hover:bg-white dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 rounded-xl text-xs font-semibold transition-all shadow-2xs cursor-pointer disabled:cursor-wait disabled:opacity-60"
          >
            {isLoadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{isLoadingMore ? '正在加载…' : `加载更多（还有 ${Math.max(0, totalCount - topics.length)} 个）`}</span>
          </button>
        </div>
      )}
    </div>
  );
};
