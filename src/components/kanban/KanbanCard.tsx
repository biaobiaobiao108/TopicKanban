import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Topic } from '../../types';
import { PriorityBadge } from '../ui/Badge';
import {
  Pin,
  Calendar,
  Clock,
} from 'lucide-react';
import { getCurrentActionAgeDays, getCurrentActionWarning } from '../../lib/topicMetrics';
import { ActionDateText } from '../ui/ActionDate';
import { useActionDateDisplay, type ActionDateDisplay } from '../../lib/actionDate';

interface KanbanCardProps {
  topic: Topic;
  onOpenDetail: (topicId: string) => void;
  onOpenCurrentAction?: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void | Promise<void>;
  onTogglePin: (topicId: string) => void;
  onKeyboardMove?: (topic: Topic, direction: -1 | 1) => void;
  sortableDisabled?: boolean;
  staleThresholdDays?: number;
  isOverlay?: boolean;
  mobileMotion?: boolean;
}

const CARD_META_VALUE_CLASS = 'tabular-nums';
const SCHEDULE_BADGE_CLASS = 'inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] font-sans leading-4 whitespace-nowrap border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink-muted)]';

const TopicScheduleBadges: React.FC<{
  scheduleDate: ActionDateDisplay;
  deadlineDate: ActionDateDisplay;
}> = ({ scheduleDate, deadlineDate }) => {
  if (scheduleDate.state === 'empty' && deadlineDate.state === 'empty') return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {scheduleDate.state !== 'empty' && (
        <span data-testid="topic-schedule-badge" className={SCHEDULE_BADGE_CLASS}>
          <Calendar className="w-3 h-3 text-[var(--accent)]" />
          <span>排期 <ActionDateText display={scheduleDate} /></span>
        </span>
      )}
      {deadlineDate.state !== 'empty' && (
        <span data-testid="topic-deadline-badge" className={SCHEDULE_BADGE_CLASS}>
          <Clock className="w-3 h-3 text-[#9b6a2f] dark:text-[#c49258]" />
          <span>截稿 <ActionDateText display={deadlineDate} /></span>
        </span>
      )}
    </div>
  );
};

const KanbanCardComponent: React.FC<KanbanCardProps> = ({
  topic,
  onOpenDetail,
  onOpenCurrentAction,
  onDeleteTopic,
  onTogglePin,
  onKeyboardMove,
  sortableDisabled = false,
  staleThresholdDays = 5,
  isOverlay = false,
  mobileMotion = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: topic.id,
    disabled: sortableDisabled || isOverlay,
    data: {
      type: 'topic',
      topic,
    },
  });
  const { ['aria-disabled']: _ariaDisabled, ...sortableAttributes } = attributes;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
    zIndex: isDragging ? 50 : 1,
  };

  const actionWarning = getCurrentActionWarning(topic, new Date(), staleThresholdDays);
  const activeTopicDates = topic.status !== 'published' && topic.status !== 'icebox';
  const scheduleDate = useActionDateDisplay(topic.target_publish_date, activeTopicDates);
  const deadlineDate = useActionDateDisplay(topic.deadline, activeTopicDates);

  // Floating Overlay State (inside DragOverlay)
  if (isOverlay) {
    return (
      <div
        className="relative bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--accent)]/70 p-3.5 shadow-modal ring-1 ring-[var(--accent)]/20 scale-[1.02] rotate-[1deg] opacity-98 cursor-grabbing flex flex-col gap-2.5 select-none pointer-events-none w-full transition-transform duration-75"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--ink)] leading-snug tracking-tight line-clamp-2">
            {topic.title}
          </h3>
          {topic.is_pinned === 1 && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-[#9b6a2f] text-[#9b6a2f]" aria-label="置顶" />}
        </div>

        {/* Current Action Highlight Bar */}
        {topic.current_todo ? (
          <div className="bg-[var(--canvas)] border border-[var(--line)] rounded-[var(--radius-sm)] p-2.5 flex items-start gap-2 text-xs text-[var(--ink)]">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-[var(--accent)] mr-1">当前行动:</span>
              <span className="font-normal">{topic.current_todo.title}</span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`min-w-0 truncate ${actionWarning ? 'font-medium text-[#9b6a2f] dark:text-[#c49258]' : 'text-[var(--ink-muted)]'}`}>
            {actionWarning || `行动持续 ${getCurrentActionAgeDays(topic)} 天`}
            </span>
            <PriorityBadge priority={topic.priority} showDot={false} />
          </div>
          <div data-testid="topic-card-meta" className="flex items-center gap-1.5 text-[var(--ink-muted)]">
            {(topic.sources_count || 0) > 0 && (
              <span><span className={CARD_META_VALUE_CLASS}>{topic.sources_count}</span>资料</span>
            )}
            {(topic.draft_word_count || 0) > 0 && (
              <span><span className={CARD_META_VALUE_CLASS}>{topic.draft_word_count}</span>字</span>
            )}
          </div>
        </div>

        <TopicScheduleBadges scheduleDate={scheduleDate} deadlineDate={deadlineDate} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      data-topic-id={topic.id}
      style={style}
      {...sortableAttributes}
      {...listeners}
      tabIndex={sortableDisabled ? -1 : 0}
      role="group"
      aria-label={`${topic.title}，${topic.status}`}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' && onKeyboardMove) {
          event.preventDefault();
          onKeyboardMove(topic, -1);
        } else if (event.key === 'ArrowRight' && onKeyboardMove) {
          event.preventDefault();
          onKeyboardMove(topic, 1);
        } else if (event.key === 'Enter' && !isDragging) {
          event.preventDefault();
          onOpenDetail(topic.id);
        }
      }}
      onClick={() => {
        if (!isDragging) {
          onOpenDetail(topic.id);
        }
      }}
      className={`group relative min-w-0 bg-[var(--surface)] rounded-[var(--radius-md)] border p-3.5 shadow-2xs flex flex-col gap-2.5 select-none touch-manipulation cv-card focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${mobileMotion ? 'mobile-motion-card' : ''} ${
        isDragging
          ? 'transition-none will-change-transform opacity-30 scale-[0.98] border-dashed border-[var(--line)] bg-[var(--canvas)] shadow-none pointer-events-none'
          : sortableDisabled
            ? 'transition-all duration-150 border-[var(--line)] cursor-default'
            : 'transition-all duration-150 border-[var(--line)] hover:border-[var(--accent)]/35 hover:shadow-subtle cursor-grab active:cursor-grabbing'
      } ${
        topic.is_pinned && !isDragging ? 'bg-[var(--canvas)]/40' : ''
      }`}
    >
      {/* Main Title and Quick Stage */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--ink)] leading-snug tracking-tight group-hover:text-[var(--accent)] transition-colors line-clamp-2 text-pretty">
          {topic.title}
        </h3>
      </div>

      {/* Current Action Highlight Bar */}
      {topic.current_todo ? (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpenCurrentAction?.(topic.id); }}
          className="w-full text-left bg-[var(--canvas)] hover:bg-[var(--accent-soft)] border border-[var(--line)] rounded-[var(--radius-sm)] p-2.5 flex items-start gap-2 text-xs text-[var(--ink)] transition-colors cursor-pointer"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-[var(--accent)] mr-1">当前行动:</span>
            <span className="font-normal">{topic.current_todo.title}</span>
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpenCurrentAction?.(topic.id); }}
          className="w-full rounded-[var(--radius-sm)] p-2 text-[11px] text-[var(--ink-muted)] text-center bg-[var(--canvas)]/60 hover:bg-[var(--canvas)] border border-[var(--line)] cursor-pointer transition-colors"
        >
          未设置当前行动
        </button>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`min-w-0 truncate ${actionWarning ? 'font-medium text-[#9b6a2f] dark:text-[#c49258]' : 'text-[var(--ink-muted)]'}`}>
          {actionWarning || `行动持续 ${getCurrentActionAgeDays(topic)} 天`}
          </span>
          <PriorityBadge priority={topic.priority} showDot={false} />
        </div>
        <div data-testid="topic-card-meta" className="flex items-center gap-1.5 text-[var(--ink-muted)]">
          {(topic.sources_count || 0) > 0 && (
            <span><span className={CARD_META_VALUE_CLASS}>{topic.sources_count}</span>资料</span>
          )}
          {(topic.draft_word_count || 0) > 0 && (
            <span><span className={CARD_META_VALUE_CLASS}>{topic.draft_word_count}</span>字</span>
          )}
        </div>
      </div>

      {/* Schedule / Deadline Badges */}
      <TopicScheduleBadges scheduleDate={scheduleDate} deadlineDate={deadlineDate} />

      {/* Secondary context */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--line)] text-[11px] text-[var(--ink-muted)]">
        <div className="min-w-0 truncate pr-2">
          {topic.people?.slice(0, 2).map((person) => person.name).join(' / ') || '未关联人物'}
          {topic.tags?.length ? ` · ${topic.tags.slice(0, 2).map((tag) => `#${tag.name}`).join(' ')}` : ''}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(topic.id);
            }}
            type="button"
            aria-label={topic.is_pinned ? '取消置顶' : '置顶'}
            title={topic.is_pinned ? '取消置顶' : '置顶'}
            className="p-1 text-[var(--ink-muted)] hover:text-[#9b6a2f] rounded-[var(--radius-sm)] cursor-pointer transition-colors"
          >
            <Pin aria-hidden="true" className={`w-3.5 h-3.5 ${topic.is_pinned ? 'fill-[#9b6a2f] text-[#9b6a2f]' : 'opacity-30 group-hover:opacity-100 hover:opacity-100'}`} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const KanbanCard = React.memo(KanbanCardComponent);
