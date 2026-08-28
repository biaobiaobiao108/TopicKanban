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

function WeekDayColumn({
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
      className={`flex-1 flex flex-col min-w-[140px] border-r border-stone-200/70 dark:border-stone-800 last:border-r-0 transition-colors ${
        day.isToday ? 'bg-rose-50/[0.04] dark:bg-rose-950/[0.1]' : 'bg-white dark:bg-stone-900'
      } ${isOver ? 'bg-rose-100/60 dark:bg-rose-950/60 ring-2 ring-inset ring-rose-600' : ''}`}
    >
      {/* Header */}
      <div
        className={`p-3 border-b border-stone-200/70 dark:border-stone-800 text-center select-none ${
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
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[300px]">
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

        <button
          type="button"
          onClick={() => onDateClick(day.date)}
          className="w-full flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-stone-400 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/80 border border-dashed border-stone-200 dark:border-stone-800 transition-colors cursor-pointer"
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
    <div className="flex-1 flex min-w-0 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs overflow-x-auto">
      {days.map((day) => {
        const events = eventsMap.get(day.date) || [];
        return (
          <WeekDayColumn
            key={day.date}
            day={day}
            events={events}
            onDateClick={onDateClick}
            onOpenTopic={onOpenTopic}
            onOpenDeal={onOpenDeal}
            onOpenPublished={onOpenPublished}
          />
        );
      })}
    </div>
  );
};
