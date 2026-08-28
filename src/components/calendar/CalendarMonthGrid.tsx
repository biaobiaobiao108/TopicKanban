import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { MonthDayCell } from './calendarUtils';
import { CalendarEventItem } from './CalendarTypes';
import { CalendarEventPill } from './CalendarEventPill';
import { Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';

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
          ? 'ring-2 ring-inset ring-rose-500/80 dark:ring-rose-500 bg-rose-50/[0.04] dark:bg-rose-950/[0.12]'
          : ''
      } ${
        isOver
          ? 'bg-rose-100/60 dark:bg-rose-950/60 ring-2 ring-inset ring-rose-600'
          : ''
      }`}
    >
      {/* Date header in cell */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded-md ${
              cell.isToday
                ? 'bg-rose-600 text-white shadow-2xs font-extrabold'
                : cell.isCurrentMonth
                  ? cell.isWeekend
                    ? 'text-rose-700/80 dark:text-rose-400'
                    : 'text-stone-800 dark:text-stone-200'
                  : 'text-stone-400 dark:text-stone-600'
            }`}
          >
            {cell.dayNumber}
          </span>

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
              className="inline-flex shrink-0 items-center rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold leading-none text-rose-700 transition-colors hover:bg-rose-500/20 hover:text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60 dark:hover:text-rose-200 cursor-pointer"
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
          className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-1 rounded-md text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all cursor-pointer"
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
  const [activeDateModal, setActiveDateModal] = useState<{ date: string; events: CalendarEventItem[] } | null>(null);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs overflow-hidden">
      {/* 7-Column Header */}
      <div className="grid grid-cols-7 border-b border-stone-200/70 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/90 select-none">
        {WEEK_HEADERS.map((name, i) => (
          <div
            key={name}
            className={`py-2 text-center text-xs font-bold ${
              i >= 5 ? 'text-rose-700/80 dark:text-rose-400' : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Grid of days */}
      <div
        data-testid="calendar-month-grid"
        className="flex-1 grid grid-cols-7 auto-rows-[max-content] overflow-y-auto min-w-0"
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
      </div>

      {/* Day Events Overview Modal (if clicking +X 更多) */}
      {activeDateModal && (
        <Modal
          isOpen
          onClose={() => setActiveDateModal(null)}
          title={`📅 ${activeDateModal.date} 全部排期与事项`}
          maxWidth="md"
        >
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
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
          </div>
        </Modal>
      )}
    </div>
  );
};
