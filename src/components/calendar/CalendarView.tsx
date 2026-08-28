import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { Topic, CommercialDeal, PublishedVideo, Tag, Priority, TopicStatus } from '../../types';
import { fetchCommercialDealPage, fetchPublishedVideos, fetchTags } from '../../lib/storage';
import { PageHeader } from '../layout/PageHeader';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Inbox,
  Eye,
  CheckSquare,
  AlertCircle,
  Handshake,
  Film,
  Zap,
  Filter,
} from 'lucide-react';
import {
  CalendarLayerFilters,
  CalendarViewMode,
  DEFAULT_CALENDAR_LAYERS,
} from './CalendarTypes';
import {
  getBeijingDateString,
  getMonthGridDays,
  getWeekDays,
  extractCalendarEvents,
  calculateMonthStats,
} from './calendarUtils';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { CalendarWeekGrid } from './CalendarWeekGrid';
import { CalendarAgendaView } from './CalendarAgendaView';
import { UnscheduledTopicPool } from './UnscheduledTopicPool';
import { CalendarDateActionModal } from './CalendarDateActionModal';
import { StatusBadge, PriorityBadge } from '../ui/Badge';

interface CalendarViewProps {
  topics: Topic[];
  deals?: CommercialDeal[];
  publishedList?: PublishedVideo[];
  availableTags: Tag[];
  onOpenDetail: (topicId: string) => void;
  onOpenDeal?: (dealId: string) => void;
  onOpenPublished?: () => void;
  onUpdateTopic: (topicId: string, updates: Partial<Topic>) => Promise<void>;
  onCreateTopic: (data: {
    title: string;
    summary?: string;
    target_publish_date?: string;
    deadline?: string;
    priority?: Priority;
    status?: TopicStatus;
    tags?: Tag[];
  }) => Promise<void>;
}

function parseCalendarDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function parseCalendarView(value: string | null): CalendarViewMode {
  return value === 'week' || value === 'agenda' ? value : 'month';
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  topics,
  deals = [],
  publishedList = [],
  availableTags,
  onOpenDetail,
  onOpenDeal,
  onOpenPublished,
  onUpdateTopic,
  onCreateTopic,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState<Date>(() => parseCalendarDate(searchParams.get('date')) || new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => parseCalendarView(searchParams.get('view')));
  const [filters, setFilters] = useState<CalendarLayerFilters>(DEFAULT_CALENDAR_LAYERS);
  const [isPoolOpen, setIsPoolOpen] = useState<boolean>(() => (
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 640px)').matches
  ));
  const [draggedTopic, setDraggedTopic] = useState<Topic | null>(null);

  // Modal State
  const [actionModal, setActionModal] = useState<{
    date: string;
    topic?: Topic | null;
  } | null>(null);

  // Keep the visible calendar state in the URL so detail-page navigation can return to the same week.
  useEffect(() => {
    const nextViewMode = parseCalendarView(searchParams.get('view'));
    const nextDate = parseCalendarDate(searchParams.get('date'));
    setViewMode((previous) => (previous === nextViewMode ? previous : nextViewMode));
    if (nextDate) {
      setCurrentDate((previous) => (
        getBeijingDateString(previous) === getBeijingDateString(nextDate) ? previous : nextDate
      ));
    }
  }, [searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', viewMode);
    nextParams.set('date', getBeijingDateString(currentDate));
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [currentDate, searchParams, setSearchParams, viewMode]);

  // Setup Dnd Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();

  // Navigation handlers
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() - 1);
    } else {
      next.setDate(next.getDate() - 7);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Fetch published videos via query for live auto-sync
  const publishedQuery = useQuery({
    queryKey: ['published'],
    queryFn: fetchPublishedVideos,
    initialData: publishedList.length > 0 ? publishedList : undefined,
  });

  // Fetch commercial deals via query for live auto-sync across all months/weeks
  const dealsQuery = useQuery({
    queryKey: ['commercial-deals-calendar'],
    queryFn: () => fetchCommercialDealPage({ scope: 'all', page: 1, page_size: 100 }).then((res) => res.items),
    initialData: deals.length > 0 ? deals : undefined,
  });

  // Fetch tags via query for live auto-sync
  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags,
    initialData: availableTags.length > 0 ? availableTags : undefined,
  });

  const effectivePublishedList = publishedQuery.data || publishedList || [];
  const effectiveDeals = dealsQuery.data || deals || [];
  const effectiveTags = tagsQuery.data || availableTags || [];

  // Days grid
  const monthDays = useMemo(() => getMonthGridDays(year, monthIndex), [year, monthIndex]);
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  // Extract all calendar events by date
  const eventsMap = useMemo(() => {
    return extractCalendarEvents(topics, effectiveDeals, effectivePublishedList, filters);
  }, [topics, effectiveDeals, effectivePublishedList, filters]);

  // Month Statistics
  const monthStats = useMemo(() => {
    return calculateMonthStats(eventsMap, year, monthIndex, topics);
  }, [eventsMap, year, monthIndex, topics]);

  // Unscheduled active topics
  const unscheduledTopics = useMemo(() => {
    return topics.filter(
      (t) => !t.deleted_at &&
        t.status !== 'published' &&
        t.status !== 'icebox' &&
        !t.target_publish_date
    );
  }, [topics]);

  // Drag & Drop handlers
  const handleDragStart = (e: DragStartEvent) => {
    const topic = e.active.data.current?.topic as Topic | undefined;
    if (topic) {
      setDraggedTopic(topic);
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setDraggedTopic(null);
    if (!over) return;

    const targetDate = (over.data.current?.date || over.id) as string;
    const topic = active.data.current?.topic as Topic | undefined;

    if (topic && targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      if (topic.target_publish_date !== targetDate) {
        await onUpdateTopic(topic.id, { target_publish_date: targetDate });
      }
    }
  };

  const handleToggleLayer = (key: keyof CalendarLayerFilters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const formattedMonthTitle = `${year}年 ${monthIndex + 1}月`;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#fafaf9] dark:bg-[#0c0a09] overflow-hidden">
        {/* Top Header */}
        <div className="px-4 sm:px-8 pt-4 pb-3 space-y-3 shrink-0 border-b border-stone-200/70 dark:border-stone-800 bg-white/70 dark:bg-stone-900/70 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <PageHeader
                title="选题日历"
                icon={CalendarDays}
                badge={
                  <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    发片排期
                  </span>
                }
              />

              {/* Month navigation controls */}
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-xl p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={handlePrev}
                  title="上一周期"
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="text-xs sm:text-sm font-bold font-mono px-2 text-stone-900 dark:text-stone-100 min-w-[75px] text-center">
                  {formattedMonthTitle}
                </span>

                <button
                  type="button"
                  onClick={handleNext}
                  title="下一周期"
                  className="p-1 rounded-lg hover:bg-white dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleToday}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
              >
                回到今天
              </button>
            </div>

            {/* Right: View Switcher + Unscheduled Pool Toggle */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* View Switcher */}
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-xl p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === 'month'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold shadow-2xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                  }`}
                >
                  月视图
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === 'week'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold shadow-2xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                  }`}
                >
                  周视图
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('agenda')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === 'agenda'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold shadow-2xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                  }`}
                >
                  日程流
                </button>
              </div>

              {/* Toggle Unscheduled Drawer */}
              <button
                type="button"
                onClick={() => setIsPoolOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  isPoolOpen
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-2xs'
                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-50'
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>待排期池</span>
                <span className="font-mono font-bold bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
                  {unscheduledTopics.length}
                </span>
              </button>
            </div>
          </div>

          {/* Subheader: Month Stats & Layer Filter Toggles */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-2 border-t border-stone-100 dark:border-stone-800/80">
            {/* Stats Chips */}
            <div className="flex items-center gap-2 sm:gap-3 text-xs text-stone-600 dark:text-stone-400 overflow-x-auto">
              <span className="font-semibold text-stone-900 dark:text-stone-100">本月生产：</span>
              <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-md font-medium">
                计划发片 <strong className="font-mono">{monthStats.plannedPublishCount}</strong>
              </span>
              <span className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md font-medium">
                商单履约 <strong className="font-mono">{monthStats.commercialDealCount}</strong>
              </span>
              <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md font-medium">
                已发视频 <strong className="font-mono">{monthStats.publishedVideoCount}</strong>
              </span>
            </div>

            {/* Layer Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 shrink-0">图层：</span>

              <button
                type="button"
                onClick={() => handleToggleLayer('showPlannedPublish')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                  filters.showPlannedPublish
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-400 line-through'
                }`}
              >
                <span>🎬 计划发片</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleLayer('showDeadlines')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                  filters.showDeadlines
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-400 line-through'
                }`}
              >
                <span>⏰ 制作截止</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleLayer('showDeals')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                  filters.showDeals
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-400 line-through'
                }`}
              >
                <span>🤝 商单 DDL</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleLayer('showPublished')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                  filters.showPublished
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-400 line-through'
                }`}
              >
                <span>📺 历史已发</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleLayer('showDeferred')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                  filters.showDeferred
                    ? 'bg-stone-700 text-white shadow-2xs'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-400 line-through'
                }`}
              >
                <span>⚡ 推迟唤醒</span>
              </button>
            </div>
          </div>
        </div>

        {/* Calendar Body Area + Side Pool */}
        <div className="relative flex-1 flex min-h-0 overflow-hidden p-3 sm:p-6 gap-4">
          {/* Main Grid View */}
          {viewMode === 'month' && (
            <CalendarMonthGrid
              days={monthDays}
              eventsMap={eventsMap}
              onDateClick={(date) => setActionModal({ date })}
              onOpenTopic={onOpenDetail}
              onOpenDeal={(id) => onOpenDeal?.(id)}
              onOpenPublished={() => onOpenPublished?.()}
            />
          )}

          {viewMode === 'week' && (
            <CalendarWeekGrid
              days={weekDays}
              eventsMap={eventsMap}
              onDateClick={(date) => setActionModal({ date })}
              onOpenTopic={onOpenDetail}
              onOpenDeal={(id) => onOpenDeal?.(id)}
              onOpenPublished={() => onOpenPublished?.()}
            />
          )}

          {viewMode === 'agenda' && (
            <CalendarAgendaView
              days={weekDays}
              eventsMap={eventsMap}
              onDateClick={(date) => setActionModal({ date })}
              onOpenTopic={onOpenDetail}
              onOpenDeal={(id) => onOpenDeal?.(id)}
              onOpenPublished={() => onOpenPublished?.()}
            />
          )}

          {/* Unscheduled Topic Pool Drawer */}
          <UnscheduledTopicPool
            topics={topics}
            isOpen={isPoolOpen}
            onClose={() => setIsPoolOpen(false)}
            onOpenDetail={onOpenDetail}
            onScheduleTopic={(topic) => setActionModal({ date: getBeijingDateString(new Date()), topic })}
          />
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {draggedTopic ? (
            <div className="p-3 rounded-xl border border-rose-400 bg-white dark:bg-stone-900 shadow-2xl w-64 ring-2 ring-rose-500 select-none pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <StatusBadge status={draggedTopic.status} />
                <PriorityBadge priority={draggedTopic.priority} />
              </div>
              <h5 className="text-xs font-bold text-stone-900 dark:text-stone-100 line-clamp-1">
                {draggedTopic.title}
              </h5>
            </div>
          ) : null}
        </DragOverlay>

        {/* Date Schedule Modal */}
        {actionModal && (
          <CalendarDateActionModal
            isOpen
            targetDate={actionModal.date}
            activeTopic={actionModal.topic}
            unscheduledTopics={unscheduledTopics}
            availableTags={effectiveTags}
            onClose={() => setActionModal(null)}
            onUpdateTopic={onUpdateTopic}
            onCreateTopic={onCreateTopic}
          />
        )}
      </div>
    </DndContext>
  );
};
