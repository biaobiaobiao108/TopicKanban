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

interface KanbanCardProps {
  topic: Topic;
  onOpenDetail: (topicId: string) => void;
  onOpenCurrentAction?: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onTogglePin: (topicId: string) => void;
  onUpdateStatus?: (topicId: string, status: TopicStatus) => void;
  onKeyboardMove?: (topic: Topic, direction: -1 | 1) => void;
  sortableDisabled?: boolean;
  staleThresholdDays?: number;
  isOverlay?: boolean;
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
const SCHEDULE_BADGE_CLASS = 'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-sans font-medium leading-4 whitespace-nowrap';

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
        <span data-testid="topic-schedule-badge" className={`${SCHEDULE_BADGE_CLASS} bg-rose-500/10 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300`}>
          <Calendar className="w-3 h-3" />
          <span>排期 <ActionDateText display={scheduleDate} /></span>
        </span>
      )}
      {deadlineDate.state !== 'empty' && (
        <span data-testid="topic-deadline-badge" className={`${SCHEDULE_BADGE_CLASS} bg-amber-500/10 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300`}>
          <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
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
}) => {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [statusMenuPosition, setStatusMenuPosition] = useState<StatusMenuPosition | null>(null);
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
        className="relative bg-white dark:bg-stone-900 rounded-2xl border-2 border-rose-400 dark:border-rose-600 p-3.5 shadow-modal ring-4 ring-rose-500/20 scale-[1.02] rotate-[1.5deg] opacity-98 cursor-grabbing flex flex-col gap-2.5 select-none pointer-events-none w-full transition-transform duration-75"
      >
        {/* Top row: Priority & Pin */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {topic.is_pinned === 1 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full">
                <Pin className="w-3 h-3 fill-amber-600 dark:fill-amber-400" />
                置顶
              </span>
            )}
            <PriorityBadge priority={topic.priority} />
          </div>
        </div>

        {/* Main Title */}
        <h3 className="text-[15px] font-bold text-stone-900 dark:text-stone-100 leading-snug tracking-tight line-clamp-2">
          {topic.title}
        </h3>

        {/* Current Action Highlight Bar */}
        {topic.current_todo ? (
          <div className="bg-rose-500/[0.08] dark:bg-rose-500/[0.14] rounded-xl p-2.5 flex items-start gap-2 text-xs text-rose-950 dark:text-rose-200">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-rose-700 dark:text-rose-400 mr-1">当前行动:</span>
              <span className="font-medium">{topic.current_todo.title}</span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className={actionWarning ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-400'}>
            {actionWarning || `行动持续 ${getCurrentActionAgeDays(topic)} 天`}
          </span>
          <div data-testid="topic-card-meta" className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
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
      className={`group relative bg-white dark:bg-stone-900 rounded-2xl border p-3.5 shadow-2xs flex flex-col gap-2.5 select-none touch-manipulation cv-card focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
        isDragging
          ? 'transition-none will-change-transform opacity-35 scale-[0.98] border-dashed border-rose-400 dark:border-rose-600 bg-rose-50/30 dark:bg-rose-950/20 shadow-none pointer-events-none'
          : sortableDisabled
            ? 'transition-all duration-200 ease-editorial-out border-stone-200/70 dark:border-stone-800 cursor-default'
            : 'transition-all duration-200 ease-editorial-out border-stone-200/70 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 hover:shadow-card-hover hover:-translate-y-1 cursor-grab active:cursor-grabbing'
      } ${
        topic.is_pinned && !isDragging ? 'ring-1 ring-amber-400/40 bg-amber-50/[0.08] dark:bg-amber-950/10' : ''
      }`}
    >
      {/* Top row: Priority, Pin & Quick Stage */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {topic.is_pinned === 1 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full">
              <Pin className="w-3 h-3 fill-amber-600 dark:fill-amber-400" />
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
                className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                title="快速流转阶段"
              >
                <span>流转</span>
                <ChevronDown className="w-3 h-3 text-stone-400 dark:text-stone-500" aria-hidden="true" />
              </button>

              {isStatusMenuOpen && statusMenuPosition && createPortal(
                <div
                  ref={statusMenuRef}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    top: statusMenuPosition.top,
                    left: statusMenuPosition.left,
                    maxHeight: statusMenuPosition.maxHeight,
                  }}
                  className="fixed z-[100] w-36 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain bg-white/95 dark:bg-stone-900/95 backdrop-blur-md rounded-2xl shadow-modal border border-stone-200/80 dark:border-stone-800 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150 ease-editorial-out"
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                    活跃生产阶段
                  </div>
                  {COLUMNS.filter((c) => c.status !== 'published' && c.status !== 'icebox').map((c) => (
                    <button
                      key={c.status}
                      type="button"
                      onClick={() => {
                        setIsStatusMenuOpen(false);
                        onUpdateStatus(topic.id, c.status);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        topic.status === c.status
                          ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                          : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                    >
                      <span>{c.label}</span>
                      {topic.status === c.status && <span className="text-rose-600 dark:text-rose-400 text-xs">✓</span>}
                    </button>
                  ))}

                  <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                    归档状态
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsStatusMenuOpen(false);
                      onUpdateStatus(topic.id, 'published');
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      topic.status === 'published'
                        ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-800 dark:hover:text-emerald-300'
                    }`}
                  >
                    <span>已发布</span>
                    {topic.status === 'published' && <span className="text-emerald-600 dark:text-emerald-400 text-xs">✓</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsStatusMenuOpen(false);
                      onUpdateStatus(topic.id, 'icebox');
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      topic.status === 'icebox'
                        ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <span>搁置</span>
                    {topic.status === 'icebox' && <span className="text-stone-600 dark:text-stone-400 text-xs">✓</span>}
                  </button>
                </div>,
                document.body
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Title */}
      <h3 className="text-[15px] font-bold text-stone-900 dark:text-stone-100 leading-snug tracking-tight group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors line-clamp-2 text-pretty">
        {topic.title}
      </h3>

      {/* Current Action Highlight Bar */}
        {topic.current_todo ? (
          <button type="button" onClick={(event) => { event.stopPropagation(); onOpenCurrentAction?.(topic.id); }} className="w-full text-left bg-rose-500/[0.06] dark:bg-rose-500/[0.12] rounded-xl p-2.5 flex items-start gap-2 text-xs text-rose-950 dark:text-rose-200 transition-colors cursor-pointer hover:bg-rose-500/[0.12]">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 mt-1.5 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-rose-700 dark:text-rose-400 mr-1">当前行动:</span>
              <span className="font-medium">{topic.current_todo.title}</span>
            </div>
          </button>
        ) : (
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpenCurrentAction?.(topic.id); }} className="w-full rounded-xl p-2 text-[11px] text-stone-600 dark:text-stone-400 text-center bg-stone-500/[0.03] dark:bg-stone-800/30 cursor-pointer hover:bg-stone-500/[0.08]">
          未设置当前行动
        </button>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={actionWarning ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-400'}>
          {actionWarning || `行动持续 ${getCurrentActionAgeDays(topic)} 天`}
        </span>
        <div data-testid="topic-card-meta" className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
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
      <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800/80 text-[11px] text-stone-600 dark:text-stone-400">
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
            className="p-1 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg cursor-pointer transition-colors"
          >
            <Pin aria-hidden="true" className={`w-3.5 h-3.5 ${topic.is_pinned ? 'fill-amber-500 text-amber-500' : 'text-stone-300 dark:text-stone-600 hover:text-stone-500'}`} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const KanbanCard = React.memo(KanbanCardComponent);
