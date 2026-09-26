import React, { useEffect, useState } from 'react';
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
  revealTopicId?: string | null;
  onOpenDetail: (topicId: string) => void;
  onOpenCurrentAction?: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void | Promise<void>;
  onTogglePin: (topicId: string) => void;
  onQuickAddTopic: (status: TopicStatus) => void;
  onKeyboardMove?: (topic: Topic, direction: -1 | 1) => void;
  sortableDisabled?: boolean;
  staleThresholdDays?: number;
  mobileMode?: boolean;
}

const DEFAULT_LIMIT = 8;

const columnHeaders: Record<TopicStatus, { dot: string }> = {
  inbox: { dot: 'bg-[var(--ink-muted)] opacity-60' },
  scripting: { dot: 'bg-[#9b6a2f] dark:bg-[#c49258]' },
  production: { dot: 'bg-[#6b4f73] dark:bg-[#a882b3]' },
  published: { dot: 'bg-[var(--accent)]' },
  icebox: { dot: 'bg-[var(--ink-muted)] opacity-40' },
};

const KanbanColumnComponent: React.FC<KanbanColumnProps> = ({
  status,
  label,
  description,
  topics,
  totalCount = topics.length,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  revealTopicId = null,
  onOpenDetail,
  onOpenCurrentAction,
  onDeleteTopic,
  onTogglePin,
  onQuickAddTopic,
  onKeyboardMove,
  sortableDisabled,
  staleThresholdDays = 5,
  mobileMode = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!revealTopicId) return;
    const topicIndex = topics.findIndex((topic) => topic.id === revealTopicId);
    if (topicIndex < DEFAULT_LIMIT) return;

    setIsExpanded(true);
    const frame = window.requestAnimationFrame(() => {
      const topicCard = Array.from(document.querySelectorAll<HTMLElement>('[data-topic-id]'))
        .find((card) => card.dataset.topicId === revealTopicId);
      topicCard?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [revealTopicId, topics]);

  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: 'column',
      status,
    },
  });

  const c = columnHeaders[status] || columnHeaders.inbox;

  // Apply display limit
  const visibleTopics = mobileMode || isExpanded ? topics : topics.slice(0, DEFAULT_LIMIT);
  const hiddenCount = topics.length - DEFAULT_LIMIT;

  return (
    <div
      ref={setNodeRef}
      data-column-status={status}
      className={`kanban-column-container w-full min-w-0 rounded-[var(--radius-md)] p-3 flex flex-col min-h-[220px] border transition-colors duration-150 ${
        isOver
          ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/30 bg-[var(--accent-soft)] shadow-subtle'
          : 'border-[var(--line)] bg-[var(--canvas)]/60 hover:bg-[var(--canvas)]'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-1.5 py-1 mb-2.5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
          <h2 className="text-[13.5px] font-semibold text-[var(--ink)] tracking-tight">{label}</h2>
          <span className="kanban-column-count text-xs text-[var(--ink-muted)] tabular-nums ml-0.5">
            {totalCount}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onQuickAddTopic(status)}
          aria-label={`在${label}中快速建卡`}
          title={`在${label}中快速建卡`}
          className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Cards Area */}
      <div className="mobile-scroll-reveal min-w-0 space-y-2.5 min-h-[140px] flex-1">
        <SortableContext items={visibleTopics.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {visibleTopics.map((topic) => (
            <KanbanCard
              key={topic.id}
              topic={topic}
              onOpenDetail={onOpenDetail}
              onOpenCurrentAction={onOpenCurrentAction}
              onDeleteTopic={onDeleteTopic}
              onTogglePin={onTogglePin}
              onKeyboardMove={onKeyboardMove}
              sortableDisabled={sortableDisabled}
              staleThresholdDays={staleThresholdDays}
              mobileMotion={mobileMode}
            />
          ))}
        </SortableContext>

        {topics.length === 0 && (
          <div
            className={`h-24 flex flex-col items-center justify-center border border-dashed rounded-[var(--radius-sm)] text-xs p-3 text-center transition-colors duration-150 ${
              isOver
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line)] bg-[var(--surface)]/50 text-[var(--ink-muted)]'
            }`}
          >
            <span className="font-medium">{isOver ? '松开以移入此阶段' : '暂无选题'}</span>
            <span className="text-[11px] opacity-75 mt-0.5">
              {isOver ? `将卡片归入「${label}」` : '拖拽卡片至此可变更状态'}
            </span>
          </div>
        )}
      </div>

      {/* Expand / Collapse Button if exceeding limit */}
      {!mobileMode && hiddenCount > 0 && (
        <div className="pt-2 mt-2 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-1.5 px-2 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] bg-[var(--surface)] hover:bg-[var(--canvas)] border border-[var(--line)] rounded-[var(--radius-sm)] flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>收起额外卡片</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>展开剩余 {hiddenCount} 个卡片</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Load More Button for paginated columns */}
      {hasMore && (
        <div className="pt-2 mt-2 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full py-1.5 px-2 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] bg-[var(--surface)] hover:bg-[var(--canvas)] border border-[var(--line)] rounded-[var(--radius-sm)] flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>正在加载...</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>加载下一页 ({totalCount - topics.length} 待加载)</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export const KanbanColumn = React.memo(KanbanColumnComponent);
