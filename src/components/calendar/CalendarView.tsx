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
import { fetchCommercialDealsForCalendar, fetchPublishedVideos, fetchTags } from '../../lib/storage';
import { PageHeader } from '../layout/PageHeader';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Inbox,
  Eye,
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
import { createBeijingCalendarDate } from '../../lib/actionDate';

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
  const date = createBeijingCalendarDate(value);
  return Number.isFinite(date.getTime()) ? date : null;
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
  const [currentDate, setCurrentDate] = useState<Date>(() => parseCalendarDate(searchParams.get('date')) || createBeijingCalendarDate());
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => parseCalendarView(searchParams.get('view')));
  const [filters, setFilters] = useState<CalendarLayerFilters>(DEFAULT_CALENDAR_LAYERS);
  const [isPoolOpen, setIsPoolOpen] = useState(false);
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

  const year = currentDate.getUTCFullYear();
  const monthIndex = currentDate.getUTCMonth();
  const monthDays = useMemo(() => getMonthGridDays(year, monthIndex), [year, monthIndex]);
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const visibleDays = viewMode === 'month' ? monthDays : weekDays;
  const calendarRangeStart = visibleDays[0]?.date || getBeijingDateString(currentDate);
  const calendarRangeEnd = visibleDays[visibleDays.length - 1]?.date || calendarRangeStart;

  // Navigation handlers
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setUTCMonth(next.getUTCMonth() - 1);
    } else {
      next.setUTCDate(next.getUTCDate() - 7);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setUTCMonth(next.getUTCMonth() + 1);
    } else {
      next.setUTCDate(next.getUTCDate() + 7);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(createBeijingCalendarDate());
  };

  // Fetch published videos via query for live auto-sync
  const publishedQuery = useQuery({
    queryKey: ['published'],
    queryFn: fetchPublishedVideos,
    initialData: publishedList.length > 0 ? publishedList : undefined,
  });

  // Fetch only the visible commercial-deal date range so no paginated records are omitted.
  const dealsQuery = useQuery({
    queryKey: ['commercial-deals-calendar', calendarRangeStart, calendarRangeEnd],
    queryFn: () => fetchCommercialDealsForCalendar(calendarRangeStart, calendarRangeEnd),
    enabled: filters.showDeals,
    subscribed: filters.showDeals,
  });

  // Fetch tags via query for live auto-sync
  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags,
    initialData: availableTags.length > 0 ? availableTags : undefined,
  });

  const effectivePublishedList = publishedQuery.data || publishedList || [];
  const fallbackDeals = useMemo(() => deals.filter((deal) => (
    [deal.delivery_due_date, deal.publish_date, deal.next_action_due_date]
      .some((date) => Boolean(date && date >= calendarRangeStart && date <= calendarRangeEnd))
  )), [calendarRangeEnd, calendarRangeStart, deals]);
  const effectiveDeals = dealsQuery.data || fallbackDeals;
  const effectiveTags = tagsQuery.data || availableTags || [];

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

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--canvas)] transition-colors">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-7 sm:px-8 sm:py-7">
          <PageHeader
            title="选题日历"
            icon={CalendarDays}
            badge={(
              <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--accent)]">
                发片排期
              </span>
            )}
            actions={(
              <>
                {/* Month navigation controls */}
                <div aria-label="月份导航" className="inline-flex min-h-10 items-center gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1">
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="上一周期"
                    title="上一周期"
                    className="grid h-8 w-8 place-items-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <span className="min-w-[78px] px-2 text-center text-xs font-semibold text-[var(--ink)] sm:text-sm">
                    <span className="font-mono tabular-nums">{year}</span>年{' '}
                    <span className="font-mono tabular-nums">{monthIndex + 1}</span>月
                  </span>

                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="下一周期"
                    title="下一周期"
                    className="grid h-8 w-8 place-items-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleToday}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-transparent px-3 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:border-[var(--line)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                >
                  回到今天
                </button>

                {/* View Switcher */}
                <div className="inline-flex min-h-10 items-center gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-1 text-xs font-medium">
                  {([
                    ['month', '月视图'],
                    ['week', '周视图'],
                    ['agenda', '日程流'],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={`rounded-lg px-2.5 py-1.5 transition-all ${
                        viewMode === mode
                          ? 'bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-2xs'
                          : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Toggle Unscheduled Drawer */}
                <button
                  type="button"
                  onClick={() => setIsPoolOpen((prev) => !prev)}
                  className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all ${
                    isPoolOpen
                      ? 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-2xs'
                      : 'border-transparent text-[var(--ink-muted)] hover:border-[var(--line)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Inbox className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                  <span>待排期池</span>
                  <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)]">
                    {unscheduledTopics.length}
                  </span>
                </button>
              </>
            )}
          />

          <section aria-label="日历视图与排期池" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xs">
            {/* Subheader: Month Stats & Layer Filter Toggles */}
            <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--line)] bg-[var(--surface)]/70 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            {/* Stats Chips */}
            <div className="flex items-center gap-3 sm:gap-4 text-xs text-[var(--ink-muted)] overflow-x-auto select-none">
              <span className="font-medium text-[var(--ink)]">本月生产：</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                计划发片 <strong className="font-mono tabular-nums text-[var(--ink)]">{monthStats.plannedPublishCount}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                商单履约 <strong className="font-mono tabular-nums text-[var(--ink)]">{monthStats.commercialDealCount}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                已发视频 <strong className="font-mono tabular-nums text-[var(--ink)]">{monthStats.publishedVideoCount}</strong>
              </span>
            </div>

            {/* Layer Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto text-xs">
              <span className="text-[11px] font-medium text-[var(--ink-muted)] shrink-0">图层：</span>

              <button
                type="button"
                onClick={() => handleToggleLayer('showPlannedPublish')}
                className={`px-2 py-1 rounded-[var(--radius-sm)] border transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  filters.showPlannedPublish
                    ? 'border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--canvas)] text-[var(--ink)] font-medium'
                    : 'border-transparent text-[var(--ink-muted)] opacity-40 line-through hover:opacity-75'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                <span>计划发片</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleLayer('showDeadlines')}
                className={`px-2 py-1 rounded-[var(--radius-sm)] border transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  filters.showDeadlines
                    ? 'border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--canvas)] text-[var(--ink)] font-medium'
                    : 'border-transparent text-[var(--ink-muted)] opacity-40 line-through hover:opacity-75'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>制作截止</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleLayer('showDeals')}
                className={`px-2 py-1 rounded-[var(--radius-sm)] border transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  filters.showDeals
                    ? 'border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--canvas)] text-[var(--ink)] font-medium'
                    : 'border-transparent text-[var(--ink-muted)] opacity-40 line-through hover:opacity-75'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span>商单 DDL</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleLayer('showPublished')}
                className={`px-2 py-1 rounded-[var(--radius-sm)] border transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  filters.showPublished
                    ? 'border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--canvas)] text-[var(--ink)] font-medium'
                    : 'border-transparent text-[var(--ink-muted)] opacity-40 line-through hover:opacity-75'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                <span>历史已发</span>
              </button>

            </div>
            </div>

        {/* Calendar Body Area + Side Pool */}
        <div className="relative flex min-h-0 flex-1 gap-4 overflow-hidden p-3 mobile-bottom-nav-content sm:p-5">
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
        </section>
        </div>

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={null}>
          {draggedTopic ? (
            <div data-testid="calendar-drag-overlay" className="p-3 rounded-xl border border-[var(--accent)]/55 bg-[var(--surface)] shadow-modal w-64 ring-1 ring-[var(--focus-ring)] select-none pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <StatusBadge status={draggedTopic.status} />
                <PriorityBadge priority={draggedTopic.priority} />
              </div>
              <div className="text-xs font-bold text-stone-900 dark:text-stone-100 line-clamp-1">
                {draggedTopic.title}
              </div>
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
