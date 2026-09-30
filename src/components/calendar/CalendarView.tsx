import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Inbox,
  Filter,
  Check,
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
  shiftCalendarMonth,
  extractCalendarEvents,
} from './calendarUtils';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { CalendarWeekGrid } from './CalendarWeekGrid';
import { CalendarAgendaView } from './CalendarAgendaView';
import { UnscheduledTopicPool } from './UnscheduledTopicPool';
import { CalendarDateActionModal } from './CalendarDateActionModal';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { createBeijingCalendarDate } from '../../lib/actionDate';
import { FloatingMenu } from '../ui/FloatingMenu';

const CALENDAR_LAYER_OPTIONS: Array<{
  key: keyof CalendarLayerFilters;
  label: string;
  dotClass: string;
}> = [
  { key: 'showPlannedPublish', label: '计划发片', dotClass: 'bg-[var(--accent)]' },
  { key: 'showDeadlines', label: '制作截止', dotClass: 'bg-amber-500' },
  { key: 'showDeals', label: '商单 DDL', dotClass: 'bg-indigo-500' },
  { key: 'showPublished', label: '历史已发', dotClass: 'bg-teal-500' },
];

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
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [isPoolOpen, setIsPoolOpen] = useState(false);
  const [draggedTopic, setDraggedTopic] = useState<Topic | null>(null);
  const layerMenuTriggerRef = useRef<HTMLButtonElement>(null);

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
      setCurrentDate(shiftCalendarMonth(currentDate, -1));
    } else {
      next.setUTCDate(next.getUTCDate() - 7);
      setCurrentDate(next);
    }
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      setCurrentDate(shiftCalendarMonth(currentDate, 1));
    } else {
      next.setUTCDate(next.getUTCDate() + 7);
      setCurrentDate(next);
    }
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

  const enabledLayerCount = Object.values(filters).filter(Boolean).length;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--canvas)] transition-colors">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <PageHeader
            title="选题日历"
            icon={CalendarDays}
            badge={(
              <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                发片排期
              </span>
            )}
            actions={(
              <>
                {/* Month navigation controls */}
                <div aria-label="月份导航" className="inline-flex h-10 items-center gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1">
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="上一周期"
                    className="grid h-8 w-8 place-items-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] cursor-pointer"
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

                {/* View Switcher (文人胶囊分段器) */}
                <div className="inline-flex h-10 items-center gap-1 rounded-full border border-[var(--line)]/50 bg-stone-500/[0.04] dark:bg-stone-400/[0.06] p-1 text-xs font-medium">
                  {([
                    ['month', '月视图'],
                    ['week', '周视图'],
                    ['agenda', '日程流'],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={`rounded-full px-3 py-1 transition-all cursor-pointer ${
                        viewMode === mode
                          ? 'bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-2xs'
                          : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <button
                    ref={layerMenuTriggerRef}
                    type="button"
                    aria-label="筛选日历图层"
                    aria-expanded={isLayerMenuOpen}
                    aria-controls={isLayerMenuOpen ? 'calendar-layer-menu' : undefined}
                    onClick={() => setIsLayerMenuOpen((open) => !open)}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${
                      isLayerMenuOpen || enabledLayerCount < CALENDAR_LAYER_OPTIONS.length
                        ? 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'
                        : 'border-transparent text-[var(--ink-muted)] hover:border-[var(--line)]/60 hover:bg-[var(--surface)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>图层</span>
                    <span className="font-mono text-[10px] tabular-nums opacity-70">
                      {enabledLayerCount}/{CALENDAR_LAYER_OPTIONS.length}
                    </span>
                  </button>

                  <FloatingMenu
                    isOpen={isLayerMenuOpen}
                    anchorRef={layerMenuTriggerRef}
                    onClose={() => setIsLayerMenuOpen(false)}
                    id="calendar-layer-menu"
                    ariaLabel="日历显示图层"
                    width={192}
                    minWidth={192}
                    maxHeight={280}
                    className="p-1.5"
                  >
                    <div className="px-2.5 py-1.5 text-[11px] font-medium text-[var(--ink-muted)]">
                      显示事项
                    </div>
                    {CALENDAR_LAYER_OPTIONS.map(({ key, label, dotClass }) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={filters[key]}
                        onClick={() => handleToggleLayer(key)}
                        className={`flex min-h-9 w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors ${
                          filters[key]
                            ? 'text-[var(--ink)] hover:bg-[var(--canvas)]'
                            : 'text-[var(--ink-muted)] opacity-60 hover:bg-[var(--canvas)] hover:opacity-100'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                          {label}
                        </span>
                        {filters[key] && (
                          <Check className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </FloatingMenu>
                </div>

                {/* Toggle Unscheduled Drawer */}
                <button
                  type="button"
                  onClick={() => setIsPoolOpen((prev) => !prev)}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-all cursor-pointer ${
                    isPoolOpen
                      ? 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-2xs'
                      : 'border-transparent text-[var(--ink-muted)] hover:border-[var(--line)]/60 hover:bg-[var(--surface)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Inbox className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                  <span>待排期池</span>
                  <span className="font-mono text-[10px] tabular-nums opacity-75">
                    {unscheduledTopics.length}
                  </span>
                </button>
              </>
            )}
          />

          <section aria-label="日历视图与排期池" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="relative flex min-h-0 flex-1 gap-4 overflow-hidden">
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
