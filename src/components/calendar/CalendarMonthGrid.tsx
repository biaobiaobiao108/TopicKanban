import React, { useLayoutEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { MonthDayCell } from './calendarUtils';
import { CalendarEventItem } from './CalendarTypes';
import { CalendarEventPill } from './CalendarEventPill';
import { Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { getActionDateDisplay, useBeijingToday } from '../../lib/actionDate';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

interface CalendarMonthGridProps {
  days: MonthDayCell[];
  eventsMap: Map<string, CalendarEventItem[]>;
  onDateClick: (date: string) => void;
  onOpenTopic: (topicId: string) => void;
  onOpenDeal: (dealId: string) => void;
  onOpenPublished: () => void;
}

const WEEK_HEADERS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MAX_MEASURED_EVENTS = 8;

function MonthCellDroppable({
  cell,
  events,
  onDateClick,
  onOpenTopic,
  onOpenDeal,
  onOpenPublished,
  onShowAllEvents,
}: {
  cell: MonthDayCell;
  events: CalendarEventItem[];
  onDateClick: (date: string) => void;
  onOpenTopic: (topicId: string) => void;
  onOpenDeal: (dealId: string) => void;
  onOpenPublished: () => void;
  onShowAllEvents: (date: string, events: CalendarEventItem[]) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cell.date,
    data: { date: cell.date },
  });

  const eventListRef = useRef<HTMLDivElement>(null);
  const [visibleEventCount, setVisibleEventCount] = useState(events.length);
  const hiddenCount = Math.max(0, events.length - visibleEventCount);

  useLayoutEffect(() => {
    const eventList = eventListRef.current;
    if (!eventList) return;

    const updateVisibleEvents = () => {
      const listRect = eventList.getBoundingClientRect();
      const items = Array.from(eventList.children);
      const availableHeight = eventList.clientHeight;
      const countThatFits = (height: number) => {
        const bottom = listRect.top + height;
        let count = 0;
        for (const item of items) {
          const itemRect = item.getBoundingClientRect();
          if (itemRect.height > 0 && itemRect.bottom <= bottom + 0.5) count += 1;
          else break;
        }
        return count;
      };

      const fittingCount = countThatFits(availableHeight);
      const nextVisibleCount = fittingCount === events.length
        ? events.length
        : Math.max(1, countThatFits(Math.max(0, availableHeight - 18)));

      setVisibleEventCount((current) => current === nextVisibleCount ? current : nextVisibleCount);
    };

    updateVisibleEvents();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateVisibleEvents);
    observer.observe(eventList);
    return () => observer.disconnect();
  }, [events.length]);

  return (
    <div
      ref={setNodeRef}
      onClick={() => onDateClick(cell.date)}
      data-testid="calendar-month-cell"
      data-date={cell.date}
      className={`relative group flex h-full min-h-0 select-none flex-col overflow-hidden border-b border-r border-[var(--line)]/35 p-1.5 transition-colors sm:p-2 ${
        cell.isCurrentMonth
          ? cell.isWeekend
            ? 'bg-[var(--canvas)]/45'
            : 'bg-[var(--surface)]'
          : 'bg-stone-500/[0.02] dark:bg-stone-500/[0.04] text-[var(--ink-muted)] opacity-60'
      } ${
        cell.isToday
          ? 'bg-[var(--accent-soft)]/20'
          : 'hover:bg-stone-500/[0.015]'
      } ${
        isOver
          ? 'bg-[var(--accent-soft)]/60 ring-1 ring-inset ring-[var(--accent)]/50'
          : ''
      }`}
    >
      {/* Date header in cell */}
      <div className="mb-1 flex shrink-0 items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDateClick(cell.date);
            }}
            aria-label={`在 ${cell.date} 排期定档`}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full font-mono text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] sm:h-8 sm:w-8 sm:text-sm ${
              cell.isToday
                ? 'bg-[var(--accent)] text-white shadow-2xs font-semibold'
                : cell.isCurrentMonth
                  ? cell.isWeekend
                    ? 'text-[var(--ink-muted)]'
                    : 'text-[var(--ink)]'
                : 'text-[var(--ink-muted)] opacity-50'
            }`}
          >
            {cell.dayNumber}
          </button>

        </div>

        {/* Hover Quick Schedule Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDateClick(cell.date);
          }}
          aria-label="在此日期排期定档"
          className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-1 rounded-md text-stone-400 hover:text-[var(--accent)] hover:bg-stone-100 dark:hover:bg-stone-800 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Events list in cell */}
      <div ref={eventListRef} className="hidden min-h-0 flex-1 flex-col gap-0.5 overflow-hidden md:flex">
        {events.slice(0, MAX_MEASURED_EVENTS).map((ev, index) => (
          <div
            key={ev.id}
            aria-hidden={index >= visibleEventCount}
            className="shrink-0"
            style={{ visibility: index < visibleEventCount ? 'visible' : 'hidden' }}
          >
            <CalendarEventPill
              event={ev}
              compact
              monthCell
              onOpenTopic={onOpenTopic}
              onOpenDeal={onOpenDeal}
              onOpenPublished={onOpenPublished}
            />
          </div>
        ))}
      </div>

      {events.length > 0 && (
        <button
          type="button"
          data-testid="calendar-month-count"
          aria-label={`${cell.date} 有 ${events.length} 项事项，查看全部`}
          onClick={(event) => {
            event.stopPropagation();
            onShowAllEvents(cell.date, events);
          }}
          className="mt-auto flex h-5 min-w-5 w-fit items-center justify-center gap-1 self-start rounded-full bg-[var(--surface)]/80 px-1.5 text-[10px] font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)] md:hidden"
        >
          <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
          <span className="font-mono tabular-nums">{events.length}</span>
        </button>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          data-testid="calendar-month-overflow"
          aria-label={`${cell.date} 还有 ${hiddenCount} 项事项，查看全部`}
          onClick={(event) => {
            event.stopPropagation();
            onShowAllEvents(cell.date, events);
          }}
          className="absolute bottom-2 right-2 hidden h-[18px] min-w-6 items-center justify-center rounded-full bg-[var(--surface)] px-1.5 text-[10px] font-medium tabular-nums text-[var(--ink-muted)] shadow-2xs transition-colors hover:text-[var(--ink)] md:flex"
        >
          +{hiddenCount}
        </button>
      )}
    </div>
  );
}

export const CalendarMonthGrid: React.FC<CalendarMonthGridProps> = ({
  days,
  eventsMap,
  onDateClick,
  onOpenTopic,
  onOpenDeal,
  onOpenPublished,
}) => {
  const today = useBeijingToday();
  const [activeDateModal, setActiveDateModal] = useState<{ date: string; events: CalendarEventItem[] } | null>(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xs">
      {/* 7-Column Header */}
      <div className="grid grid-cols-7 border-b border-stone-200/70 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/90 select-none">
        {WEEK_HEADERS.map((name, i) => (
          <div
            key={name}
            className={`py-2 text-center text-xs font-bold ${
              i >= 5 ? 'text-stone-500 dark:text-stone-400' : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Grid of days */}
      <FloatingScrollbar
        data-testid="calendar-month-grid"
        className="grid min-h-0 min-w-0 grid-cols-7 auto-rows-[104px] touch-pan-y overscroll-contain md:auto-rows-[148px]"
        wrapperClassName="flex-1 min-h-0"
      >
        {days.map((cell) => {
          const events = eventsMap.get(cell.date) || [];
          return (
            <MonthCellDroppable
              key={cell.date}
              cell={cell}
              events={events}
              onDateClick={onDateClick}
              onOpenTopic={onOpenTopic}
              onOpenDeal={onOpenDeal}
              onOpenPublished={onOpenPublished}
              onShowAllEvents={(date, allEvs) => setActiveDateModal({ date, events: allEvs })}
            />
          );
        })}
      </FloatingScrollbar>

      {/* Day Events Overview Modal (if clicking +X 更多) */}
      {activeDateModal && (
        <Modal
          isOpen
          onClose={() => setActiveDateModal(null)}
          title={`📅 ${getActionDateDisplay(activeDateModal.date, { today }).text || activeDateModal.date} 全部排期与事项`}
          maxWidth="md"
        >
          <FloatingScrollbar className="space-y-2.5 pr-1" wrapperClassName="max-h-[60vh] flex-none">
            {activeDateModal.events.map((ev) => (
              <CalendarEventPill
                key={ev.id}
                event={ev}
                compact={false}
                onOpenTopic={(id) => {
                  setActiveDateModal(null);
                  onOpenTopic(id);
                }}
                onOpenDeal={(id) => {
                  setActiveDateModal(null);
                  onOpenDeal(id);
                }}
                onOpenPublished={() => {
                  setActiveDateModal(null);
                  onOpenPublished();
                }}
              />
            ))}
          </FloatingScrollbar>
        </Modal>
      )}
    </div>
  );
};
