import React from 'react';
import { CalendarEventItem } from './CalendarTypes';
import type { CommercialDealStatus, TopicStatus } from '../../types';
import { Film, AlertCircle, Handshake, CheckCircle2 } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../ui/Badge';

const DEAL_STATUS_LABELS: Record<CommercialDealStatus, string> = {
  communicating: '沟通中',
  producing: '制作中',
  delivered: '已交付',
  archived: '归档',
};

const DEAL_STATUS_CLASSES: Record<CommercialDealStatus, string> = {
  communicating: 'bg-blue-500/10 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  producing: 'bg-indigo-500/10 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  delivered: 'bg-teal-500/10 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  archived: 'bg-stone-500/10 text-stone-600 dark:bg-stone-800/70 dark:text-stone-300',
};

function EventStatusBadge({ event }: { event: CalendarEventItem }) {
  if (!event.status || event.status === 'inbox') return null;

  if (event.type === 'commercial_deal') {
    const status = event.status as CommercialDealStatus;
    return (
      <span className="inline-flex max-w-full items-center gap-1 truncate text-[11px] text-[var(--ink-muted)]">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
        {DEAL_STATUS_LABELS[status] || status}
      </span>
    );
  }

  return <StatusBadge status={event.status as TopicStatus} />;
}

interface CalendarEventPillProps {
  event: CalendarEventItem;
  compact?: boolean;
  onOpenTopic?: (topicId: string) => void;
  onOpenDeal?: (dealId: string) => void;
  onOpenPublished?: () => void;
}

export const CalendarEventPill: React.FC<CalendarEventPillProps> = ({
  event,
  compact = true,
  onOpenTopic,
  onOpenDeal,
  onOpenPublished,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleOpen();
  };

  const handleOpen = () => {
    if (event.topicId && onOpenTopic) {
      onOpenTopic(event.topicId);
    } else if (event.dealId && onOpenDeal) {
      onOpenDeal(event.dealId);
    } else if (event.publishedVideoId && onOpenPublished) {
      onOpenPublished();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      handleOpen();
    }
  };

  if (compact) {
    switch (event.type) {
      case 'planned_publish':
        return (
          <button
            type="button"
            onClick={handleClick}
            title={`计划发布：${event.title}`}
            data-testid="calendar-event"
            data-calendar-event-type={event.type}
            className="flex w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--canvas)] px-1.5 py-0.5 text-left text-[11px] leading-4 text-[var(--ink)] transition-all cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
            {event.status && event.status !== 'inbox' && (
              <span className="hidden shrink-0 text-[10px] text-[var(--ink-muted)] xl:inline">
                {event.status === 'scripting' ? '写稿' : event.status === 'production' ? '制作' : event.status === 'published' ? '已发布' : '搁置'}
              </span>
            )}
          </button>
        );

      case 'deadline':
        return (
          <button
            type="button"
            onClick={handleClick}
            title={event.title}
            data-testid="calendar-event"
            data-calendar-event-type={event.type}
            className="flex w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--canvas)] px-1.5 py-0.5 text-left text-[11px] leading-4 text-[var(--ink)] transition-all cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
          </button>
        );

      case 'commercial_deal':
        return (
          <button
            type="button"
            onClick={handleClick}
            title={`${event.title}${event.status ? ` · ${DEAL_STATUS_LABELS[event.status as CommercialDealStatus] || event.status}` : ''}`}
            data-testid="calendar-event"
            data-calendar-event-type={event.type}
            className="w-full min-w-0 rounded-[var(--radius-sm)] border border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--canvas)] px-1.5 py-0.5 text-left text-[11px] leading-4 text-[var(--ink)] transition-all cursor-pointer"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
              <span data-testid="calendar-event-title" className="min-w-0 flex-1 truncate">{event.title}</span>
              {typeof event.amount_cents === 'number' && event.amount_cents > 0 && (
                <span className="max-w-[4.5rem] shrink-0 truncate font-mono text-[10px] text-[var(--ink-muted)]">
                  ¥{(event.amount_cents / 100).toLocaleString()}
                </span>
              )}
            </span>
            {event.status && (
              <span className="mt-0.5 flex min-w-0 items-center gap-1 pl-3 text-[10px] text-[var(--ink-muted)]">
                <span className="truncate">{DEAL_STATUS_LABELS[event.status as CommercialDealStatus] || event.status}</span>
              </span>
            )}
          </button>
        );

      case 'published':
        return (
          <button
            type="button"
            onClick={handleClick}
            title={`已上线：${event.title}`}
            data-testid="calendar-event"
            data-calendar-event-type={event.type}
            className="flex w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent hover:border-[var(--line)] bg-transparent hover:bg-[var(--canvas)] px-1.5 py-0.5 text-left text-[11px] leading-4 text-[var(--ink)] transition-all cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
            {typeof event.views === 'number' && event.views > 0 && (
              <span className="text-[10px] text-[var(--ink-muted)] shrink-0 font-mono">
                {event.views >= 10000 ? `${(event.views / 10000).toFixed(1)}w` : event.views}播
              </span>
            )}
          </button>
        );

    }
  }

  // Expanded card format (for agenda view)
  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`打开日历事项：${event.title}`}
      data-testid="calendar-event"
      data-calendar-event-type={event.type}
      className="p-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--canvas)] transition-all cursor-pointer shadow-2xs hover:shadow-card hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {event.type === 'planned_publish' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> 计划发布
            </span>
          )}
          {event.type === 'commercial_deal' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> 商单交付
            </span>
          )}
          {event.type === 'deadline' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> 制作截止
            </span>
          )}
          {event.type === 'published' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> 已上线
            </span>
          )}
          <EventStatusBadge event={event} />
        </div>
        {event.priority && <PriorityBadge priority={event.priority} />}
      </div>

      <div data-testid="calendar-event-title" className="min-w-0 text-sm font-bold leading-snug text-stone-900 dark:text-stone-100 line-clamp-2">
        {event.title}
      </div>

      {event.subtitle && (
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-1">
          {event.subtitle}
        </p>
      )}

      {event.type === 'published' && (typeof event.views === 'number' || typeof event.likes === 'number') && (
        <div className="flex items-center gap-3 mt-2 text-xs text-stone-500 dark:text-stone-400">
          {typeof event.views === 'number' && <span><span className="font-mono tabular-nums">{event.views.toLocaleString()}</span> 播放</span>}
          {typeof event.likes === 'number' && <span><span className="font-mono tabular-nums">{event.likes.toLocaleString()}</span> 点赞</span>}
        </div>
      )}

      {event.type === 'commercial_deal' && typeof event.amount_cents === 'number' && event.amount_cents > 0 && (
        <div className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
          商单金额：<span className="font-mono tabular-nums">¥{(event.amount_cents / 100).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};
