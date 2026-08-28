import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { WeekDayCell } from './calendarUtils';
import { CalendarEventItem } from './CalendarTypes';
import { CalendarEventPill } from './CalendarEventPill';
import { Plus } from 'lucide-react';

interface CalendarWeekGridProps {
  days: WeekDayCell[];
  eventsMap: Map<string, CalendarEventItem[]>;
  onDateClick: (date: string) => void;
  onOpenTopic: (topicId: string) => void;
  onOpenDeal: (dealId: string) => void;
  onOpenPublished: () => void;
}

function WeekDayRow({
  day,
  events,
  onDateClick,
  onOpenTopic,
  onOpenDeal,
  onOpenPublished,
}: {
  day: WeekDayCell;
  events: CalendarEventItem[];
  onDateClick: (date: string) => void;
  onOpenTopic: (topicId: string) => void;
  onOpenDeal: (dealId: string) => void;
  onOpenPublished: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: day.date,
    data: { date: day.date },
  });

  return (
    <div
      ref={setNodeRef}
      data-testid="calendar-week-day"
      data-date={day.date}
      className={`grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[8.5rem_minmax(0,1fr)] border-b border-stone-200/70 last:border-b-0 dark:border-stone-800 transition-colors ${
        day.isToday ? 'bg-rose-50/[0.04] dark:bg-rose-950/[0.1]' : 'bg-white dark:bg-stone-900'
      } ${isOver ? 'bg-rose-100/60 dark:bg-rose-950/60 ring-2 ring-inset ring-rose-600' : ''}`}
    >
      {/* Header */}
      <div
        className={`flex min-h-[8.5rem] flex-col items-center justify-center border-r border-stone-200/70 px-2 py-4 text-center select-none dark:border-stone-800 sm:px-4 ${
          day.isToday
            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold'
            : 'bg-stone-50 dark:bg-stone-900/90 text-stone-700 dark:text-stone-300'
        }`}
      >
        <div className="text-xs font-semibold text-stone-500 dark:text-stone-400">{day.dayName}</div>
        <div
          className={`inline-block mt-0.5 text-base font-bold font-mono px-2 py-0.5 rounded-lg ${
            day.isToday ? 'bg-rose-600 text-white shadow-2xs' : ''
          }`}
        >
          {day.dayNumber}
        </div>
      </div>

      {/* Events List */}
      <div className="min-w-0 min-h-[8.5rem] p-3 sm:p-4">
        {events.length > 0 ? (
          <div className="grid min-w-0 grid-cols-1 gap-2.5 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
            {events.map((ev) => (
              <CalendarEventPill
                key={ev.id}
                event={ev}
                compact={false}
                onOpenTopic={onOpenTopic}
                onOpenDeal={onOpenDeal}
                onOpenPublished={onOpenPublished}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[5.5rem] items-center justify-center rounded-xl border border-dashed border-stone-200/80 px-3 text-center text-xs text-stone-400 dark:border-stone-800 dark:text-stone-500">
            今日暂无排期与待办
          </div>
        )}

        <button
          type="button"
          onClick={() => onDateClick(day.date)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-200 py-2 text-xs font-semibold text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:border-stone-800 dark:text-stone-500 dark:hover:bg-stone-800/80 dark:hover:text-stone-200 sm:w-auto sm:px-4 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>排期定档</span>
        </button>
      </div>
    </div>
  );
}

export const CalendarWeekGrid: React.FC<CalendarWeekGridProps> = ({
  days,
  eventsMap,
  onDateClick,
  onOpenTopic,
  onOpenDeal,
  onOpenPublished,
}) => {
  return (
    <div
      data-testid="calendar-week-grid"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-2xl border border-stone-200/70 bg-white shadow-2xs [scrollbar-gutter:stable] dark:border-stone-800 dark:bg-stone-900"
    >
      {days.map((day) => {
        const events = eventsMap.get(day.date) || [];
        return <WeekDayRow key={day.date} day={day} events={events} onDateClick={onDateClick} onOpenTopic={onOpenTopic} onOpenDeal={onOpenDeal} onOpenPublished={onOpenPublished} />;
      })}
    </div>
  );
};
