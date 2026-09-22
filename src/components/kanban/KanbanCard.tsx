import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Topic, TopicStatus } from '../../types';
import { PriorityBadge } from '../ui/Badge';
import { COLUMNS } from './columns';
import {
  Pin,
  ChevronDown,
  Calendar,
  Clock,
} from 'lucide-react';
import { getCurrentActionAgeDays, getCurrentActionWarning } from '../../lib/topicMetrics';
import { ActionDateText } from '../ui/ActionDate';
import { useActionDateDisplay, type ActionDateDisplay } from '../../lib/actionDate';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

interface KanbanCardProps {
  topic: Topic;
  onOpenDetail: (topicId: string) => void;
  onOpenCurrentAction?: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void | Promise<void>;
  onTogglePin: (topicId: string) => void;
  onUpdateStatus?: (topicId: string, status: TopicStatus) => void | Promise<void>;
  onKeyboardMove?: (topic: Topic, direction: -1 | 1) => void;
  sortableDisabled?: boolean;
  staleThresholdDays?: number;
  isOverlay?: boolean;
  mobileMotion?: boolean;
}

interface StatusMenuPosition {
  top: number;
  left: number;
  maxHeight: number;
}

const STATUS_MENU_WIDTH = 144;
const VIEWPORT_MARGIN = 8;
const STATUS_MENU_GAP = 6;
const CARD_META_VALUE_CLASS = 'tabular-nums';
const SCHEDULE_BADGE_CLASS = 'inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] font-sans leading-4 whitespace-nowrap border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink-muted)]';

function getStatusMenuPosition(
  trigger: HTMLElement,
  menuHeight = 0
): StatusMenuPosition {
  const triggerRect = trigger.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const menuWidth = Math.min(STATUS_MENU_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, triggerRect.right - menuWidth),
    viewportWidth - menuWidth - VIEWPORT_MARGIN
  );
  const spaceBelow = viewportHeight - triggerRect.bottom - STATUS_MENU_GAP - VIEWPORT_MARGIN;
  const spaceAbove = triggerRect.top - STATUS_MENU_GAP - VIEWPORT_MARGIN;
  const shouldOpenAbove = menuHeight > 0 && menuHeight > spaceBelow && spaceAbove > spaceBelow;
  const top = shouldOpenAbove
    ? Math.max(VIEWPORT_MARGIN, triggerRect.top - STATUS_MENU_GAP - Math.min(menuHeight, spaceAbove))
    : triggerRect.bottom + STATUS_MENU_GAP;

  return {
    top,
    left,
    maxHeight: Math.max(120, shouldOpenAbove ? spaceAbove : spaceBelow),
  };
}

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
  onUpdateStatus,
  onKeyboardMove,
  sortableDisabled = false,
  staleThresholdDays = 5,
  isOverlay = false,
  mobileMotion = false,
}) => {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [statusMenuPosition, setStatusMenuPosition] = useState<StatusMenuPosition | null>(null);

  const requestStatusUpdate = (status: TopicStatus) => {
    setIsStatusMenuOpen(false);
    void Promise.resolve().then(() => onUpdateStatus?.(topic.id, status)).catch(() => undefined);
  };
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    if (!isStatusMenuOpen || !statusTriggerRef.current) return;

    const updatePosition = () => {
      if (!statusTriggerRef.current) return;
      setStatusMenuPosition(getStatusMenuPosition(statusTriggerRef.current, statusMenuRef.current?.offsetHeight || 0));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isStatusMenuOpen]);

  useEffect(() => {
    if (!isStatusMenuOpen) return;

    const closeOnOutsideInteraction = (event: PointerEvent) => {
      const target = event.target as Node;
      if (statusTriggerRef.current?.contains(target) || statusMenuRef.current?.contains(target)) return;
      setIsStatusMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsStatusMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isStatusMenuOpen]);

  // Floating Overlay State (inside DragOverlay)
  if (isOverlay) {
    return (
      <div
        className="relative bg-[var(--surface)] rounded-[var(--radius-md)] border-2 border-[var(--accent)] p-3.5 shadow-modal ring-2 ring-[var(--accent)]/15 scale-[1.02] rotate-[1deg] opacity-98 cursor-grabbing flex flex-col gap-2.5 select-none pointer-events-none w-full transition-transform duration-75"
      >
        {/* Top row: Priority & Pin */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {topic.is_pinned === 1 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#9b6a2f] dark:text-[#c49258]">
                <Pin className="w-3 h-3 fill-current" />
                置顶
              </span>
            )}
            <PriorityBadge priority={topic.priority} />
          </div>
        </div>

        {/* Main Title */}
        <h3 className="text-[14.5px] font-medium text-[var(--ink)] leading-snug tracking-tight line-clamp-2">
          {topic.title}
        </h3>

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
          <span className={actionWarning ? 'font-medium text-[#9b6a2f] dark:text-[#c49258]' : 'text-[var(--ink-muted)]'}>
            {actionWarning || `行动持续 ${getCurrentActionAgeDays(topic)} 天`}
          </span>
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
      {/* Top row: Priority, Pin & Quick Stage */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {topic.is_pinned === 1 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#9b6a2f] dark:text-[#c49258]">
              <Pin className="w-3 h-3 fill-current" />
              置顶
            </span>
          )}
          <PriorityBadge priority={topic.priority} />
        </div>

        <div className="flex items-center gap-1.5">
          {/* Direct Status Selector Dropdown */}
          {onUpdateStatus && (
            <div className="relative">
              <button
                type="button"
                ref={statusTriggerRef}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isStatusMenuOpen) {
                    setIsStatusMenuOpen(false);
                    return;
                  }
                  setStatusMenuPosition(getStatusMenuPosition(e.currentTarget));
                  setIsStatusMenuOpen(true);
                }}
                aria-expanded={isStatusMenuOpen}
                aria-label="快速流转阶段"
                className={`inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] bg-[var(--surface)] hover:bg-[var(--canvas)] border border-[var(--line)] px-1.5 py-0.5 rounded-[var(--radius-sm)] transition-all cursor-pointer ${
                  isStatusMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                }`}
                title="快速流转阶段"
              >
                <span>流转</span>
                <ChevronDown className="w-3 h-3 text-[var(--ink-muted)]" aria-hidden="true" />
              </button>

              {isStatusMenuOpen && statusMenuPosition && createPortal(
                <FloatingScrollbar
                  wrapperRef={statusMenuRef}
                  onClick={(e) => e.stopPropagation()}
                  wrapperStyle={{
                    position: 'fixed',
                    top: statusMenuPosition.top,
                    left: statusMenuPosition.left,
                    maxHeight: statusMenuPosition.maxHeight,
                  }}
                  className="p-1.5 space-y-0.5"
                  wrapperClassName="fixed z-[100] w-36 max-w-[calc(100vw-1rem)] flex-none bg-[var(--surface)] rounded-[var(--radius-md)] shadow-modal border border-[var(--line)] animate-in fade-in zoom-in-95 duration-150 ease-editorial-out"
                >
                  <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-[var(--ink-muted)] uppercase">
                    活跃生产阶段
                  </div>
                  {COLUMNS.filter((c) => c.status !== 'published' && c.status !== 'icebox').map((c) => (
                    <button
                      key={c.status}
                      type="button"
                      onClick={() => requestStatusUpdate(c.status)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        topic.status === c.status
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)] font-medium'
                          : 'text-[var(--ink-muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] font-normal'
                      }`}
                    >
                      <span>{c.label}</span>
                      {topic.status === c.status && <span className="text-[var(--accent)] text-xs">✓</span>}
                    </button>
                  ))}

                  <div className="my-1 border-t border-[var(--line)]" />
                  <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-[var(--ink-muted)] uppercase">
                    归档状态
                  </div>

                  <button
                    type="button"
                    onClick={() => requestStatusUpdate('published')}
                    className={`w-full text-left px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      topic.status === 'published'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-dark)] font-medium'
                        : 'text-[var(--ink-muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] font-normal'
                    }`}
                  >
                    <span>已发布</span>
                    {topic.status === 'published' && <span className="text-[var(--accent)] text-xs">✓</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => requestStatusUpdate('icebox')}
                    className={`w-full text-left px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      topic.status === 'icebox'
                        ? 'bg-[var(--canvas)] text-[var(--ink)] font-medium'
                        : 'text-[var(--ink-muted)] hover:bg-[var(--canvas)] hover:text-[var(--ink)] font-normal'
                    }`}
                  >
                    <span>搁置</span>
                    {topic.status === 'icebox' && <span className="text-[var(--ink-muted)] text-xs">✓</span>}
                  </button>
                </FloatingScrollbar>,
                document.body
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Title */}
      <h3 className="text-[14.5px] font-medium text-[var(--ink)] leading-snug tracking-tight group-hover:text-[var(--accent)] transition-colors line-clamp-2 text-pretty">
        {topic.title}
      </h3>

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
        <span className={actionWarning ? 'font-medium text-[#9b6a2f] dark:text-[#c49258]' : 'text-[var(--ink-muted)]'}>
          {actionWarning || `行动持续 ${getCurrentActionAgeDays(topic)} 天`}
        </span>
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
