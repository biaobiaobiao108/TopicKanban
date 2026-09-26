import React, { useState } from 'react';
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

  const MAX_VISIBLE_EVENTS = 3;
  const visibleEvents = events.slice(0, MAX_VISIBLE_EVENTS);
  const hiddenCount = events.length - MAX_VISIBLE_EVENTS;

  return (
    <div
      ref={setNodeRef}
      onClick={() => onDateClick(cell.date)}
      data-testid="calendar-month-cell"
      data-date={cell.date}
      className={`flex min-h-[110px] flex-col p-1.5 sm:min-h-[125px] sm:p-2 border-b border-r border-stone-200/70 dark:border-stone-800 transition-colors relative group select-none ${
        cell.isCurrentMonth
          ? 'bg-white dark:bg-stone-900'
          : 'bg-stone-50/50 dark:bg-stone-950/40 text-stone-400 dark:text-stone-600'
      } ${
        cell.isToday
          ? 'bg-[var(--accent-soft)]/25'
          : ''
      } ${
        isOver
          ? 'bg-[var(--accent-soft)] ring-1 ring-inset ring-[var(--accent)]/75'
          : ''
      }`}
    >
      {/* Date header in cell */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDateClick(cell.date);
            }}
            aria-label={`在 ${cell.date} 排期定档`}
            className={`text-xs font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer transition-colors ${
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

          {hiddenCount > 0 && (
            <button
              type="button"
              data-testid="calendar-month-overflow"
              aria-label={`${cell.date} 还有 ${hiddenCount} 项事项，查看全部`}
              title={`还有 ${hiddenCount} 项事项`}
              onClick={(e) => {
                e.stopPropagation();
                onShowAllEvents(cell.date, events);
              }}
              className="inline-flex shrink-0 items-center rounded-[var(--radius-sm)] border border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--canvas)] px-1 py-0.5 text-[10px] font-mono text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer transition-colors"
            >
              +{hiddenCount}
            </button>
          )}
        </div>

        {/* Hover Quick Schedule Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDateClick(cell.date);
          }}
          title="在此日期排期定档"
          className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-1 rounded-md text-stone-400 hover:text-[var(--accent)] hover:bg-stone-100 dark:hover:bg-stone-800 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Events list in cell */}
      <div className="space-y-1 overflow-visible">
        {visibleEvents.map((ev) => (
          <CalendarEventPill
            key={ev.id}
            event={ev}
            compact
            onOpenTopic={onOpenTopic}
            onOpenDeal={onOpenDeal}
            onOpenPublished={onOpenPublished}
          />
        ))}

      </div>
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
        className="grid min-h-0 min-w-0 grid-cols-7 auto-rows-[max-content] touch-pan-y overscroll-contain"
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
