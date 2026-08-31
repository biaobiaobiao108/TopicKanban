import React, { useState } from 'react';
import { WeekDayCell } from './calendarUtils';
import { CalendarEventItem } from './CalendarTypes';
import { CalendarEventPill } from './CalendarEventPill';
import { Plus, Calendar as CalendarIcon } from 'lucide-react';
import { getActionDateDisplay, useBeijingToday } from '../../lib/actionDate';

interface CalendarAgendaViewProps {
  days: WeekDayCell[];
  eventsMap: Map<string, CalendarEventItem[]>;
  onDateClick: (date: string) => void;
  onOpenTopic: (topicId: string) => void;
  onOpenDeal: (dealId: string) => void;
  onOpenPublished: () => void;
}

export const CalendarAgendaView: React.FC<CalendarAgendaViewProps> = ({
  days,
  eventsMap,
  onDateClick,
  onOpenTopic,
  onOpenDeal,
  onOpenPublished,
}) => {
  const today = useBeijingToday();
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = days.find((d) => d.isToday);
    return today ? today.date : (days[0]?.date || '');
  });

  const selectedDayEvents = eventsMap.get(selectedDate) || [];
  const selectedDateLabel = getActionDateDisplay(selectedDate, { today }).text || selectedDate;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs overflow-hidden">
      {/* Top Week Slider Strip */}
      <div className="p-3 border-b border-stone-200/70 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/90 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max justify-between sm:justify-start">
          {days.map((day) => {
            const hasEvents = (eventsMap.get(day.date) || []).length > 0;
            const isSelected = day.date === selectedDate;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className={`flex flex-col items-center py-2 px-3 rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-2xs font-bold'
                    : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700/80 border border-stone-200/60 dark:border-stone-700/60'
                }`}
              >
                <span className="text-[11px] opacity-80">{day.dayName}</span>
                <span className="text-base font-bold font-mono mt-0.5">{day.dayNumber}</span>
                <span className="flex gap-0.5 mt-1 h-1.5">
                  {hasEvents && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white' : 'bg-rose-500'
                      }`}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Agenda Content */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {selectedDateLabel} 排期与待办
            </h2>
            <span className="text-xs font-mono font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 px-2 py-0.5 rounded-full">
              {selectedDayEvents.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onDateClick(selectedDate)}
            className="flex items-center gap-1 bg-stone-900 dark:bg-rose-600 hover:bg-stone-800 dark:hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>定档新事项</span>
          </button>
        </div>

        {selectedDayEvents.length > 0 ? (
          <div className="space-y-3">
            {selectedDayEvents.map((ev) => (
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
          <div className="py-12 text-center border-2 border-dashed border-stone-200/80 dark:border-stone-800 rounded-2xl p-6">
            <p className="text-xs text-stone-500 dark:text-stone-400">今日暂无排片与交付计划</p>
            <button
              type="button"
              onClick={() => onDateClick(selectedDate)}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>在此日期排期定档</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
