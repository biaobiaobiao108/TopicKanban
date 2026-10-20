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
  communicating: 'bg-info-soft text-info',
  producing: 'bg-info-soft text-info',
  delivered: 'bg-success-soft text-success',
  archived: 'bg-control text-ink-muted',
};

function EventStatusBadge({ event }: { event: CalendarEventItem }) {
  if (!event.status || event.status === 'inbox') return null;

  if (event.type === 'commercial_deal') {
    const status = event.status as CommercialDealStatus;
    return (
      <span className="inline-flex max-w-full items-center gap-1 truncate text-2xs text-ink-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-info shrink-0" />
        {DEAL_STATUS_LABELS[status] || status}
      </span>
    );
  }

  return <StatusBadge status={event.status as TopicStatus} />;
}

interface CalendarEventPillProps {
  event: CalendarEventItem;
  compact?: boolean;
  monthCell?: boolean;
  onOpenTopic?: (topicId: string) => void;
  onOpenDeal?: (dealId: string) => void;
  onOpenPublished?: () => void;
}

export const CalendarEventPill: React.FC<CalendarEventPillProps> = ({
  event,
  compact = true,
  monthCell = false,
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

  const compactCardClass = monthCell
    ? 'w-full min-w-0 rounded-lg border border-line/40 bg-canvas/45 px-2 py-1.5 text-left text-xs leading-4 text-ink transition-colors hover:bg-surface hover:border-line cursor-pointer'
    : 'w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 py-0.5 text-left text-2xs leading-4 text-ink transition-all hover:border-line hover:bg-canvas cursor-pointer';
  const compactTitleClass = monthCell
    ? 'min-w-0 flex-1 line-clamp-2 whitespace-normal break-words font-medium leading-4'
    : 'min-w-0 flex-1 truncate';

  if (compact && monthCell) {
    const dotClass = {
      planned_publish: 'bg-accent',
      deadline: 'bg-warning',
      commercial_deal: 'bg-info',
      published: 'bg-success',
    }[event.type];

    return (
      <button
        type="button"
        onClick={handleClick}
        data-testid="calendar-event"
        data-calendar-event-type={event.type}
        className="flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs leading-4 text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <span data-testid="calendar-event-title" className="min-w-0 flex-1 truncate font-medium">
          {event.title}
        </span>
      </button>
    );
  }

  if (compact) {
    switch (event.type) {
      case 'planned_publish':
        return (
          <button
            type="button"
            onClick={handleClick}
            data-testid="calendar-event"
            data-calendar-event-type={event.type}
            className={`${compactCardClass} ${monthCell ? 'block' : 'flex items-center gap-1.5'}`}
          >
            <span className="flex min-w-0 items-start gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-accent ${monthCell ? 'mt-1' : ''}`} />
              <span className={compactTitleClass}>{event.title}</span>
              {!monthCell && event.status && event.status !== 'inbox' && (
                <span className="hidden shrink-0 text-3xs text-ink-muted xl:inline">
                  {event.status === 'scripting' ? '写稿' : event.status === 'production' ? '制作' : event.status === 'published' ? '已发布' : '搁置'}
                </span>
              )}
            </span>
            {monthCell && event.status && event.status !== 'inbox' && (
              <span className="mt-0.5 block truncate pl-3.5 text-3xs leading-3 text-ink-muted">
                {event.status === 'scripting' ? '写稿中' : event.status === 'production' ? '制作中' : event.status === 'published' ? '已发布' : '搁置'}
              </span>
            )}
          </button>
        );

      case 'deadline':
        return (
          <button
            type="button"
            onClick={handleClick}
            data-testid="calendar-event"
            data-calendar-event-type={event.type}
            className={`${compactCardClass} flex items-start gap-1.5`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-warning ${monthCell ? 'mt-1' : ''}`} />
            <span className={compactTitleClass}>{event.title}</span>
          </button>
        );

      case 'commercial_deal':
        if (monthCell) {
          return (
            <button
              type="button"
              onClick={handleClick}
              data-testid="calendar-event"
              data-calendar-event-type={event.type}
              className={`${compactCardClass} block`}
            >
              <span data-testid="calendar-event-title" className="block truncate font-medium leading-4">
                {event.title}
              </span>
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={handleClick}
            data-testid="calendar-event"
            data-calendar-event-type={event.type}
            className={`${compactCardClass} block`}
          >
            <span className="flex min-w-0 items-start gap-1.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
              <span data-testid="calendar-event-title" className={compactTitleClass}>{event.title}</span>
              {!monthCell && typeof event.amount_cents === 'number' && event.amount_cents > 0 && (
                <span className="max-w-[4.5rem] shrink-0 truncate font-mono text-3xs text-ink-muted">
                  ¥{(event.amount_cents / 100).toLocaleString()}
                </span>
              )}
            </span>
            {(event.status || (monthCell && typeof event.amount_cents === 'number' && event.amount_cents > 0)) && (
              <span className={`mt-0.5 flex min-w-0 items-center gap-1 text-3xs leading-3 text-ink-muted ${monthCell ? 'pl-3.5' : 'pl-3'}`}>
                {event.status && (
                  <span className="min-w-0 truncate">
                    {DEAL_STATUS_LABELS[event.status as CommercialDealStatus] || event.status}
                  </span>
                )}
                {monthCell && typeof event.amount_cents === 'number' && event.amount_cents > 0 && (
                  <span className="ml-auto shrink-0 font-mono tabular-nums">
                    ¥{(event.amount_cents / 100).toLocaleString()}
                  </span>
                )}
              </span>
            )}
          </button>
        );

      case 'published':
        return (
          <button
            type="button"
            onClick={handleClick}
            data-testid="calendar-event"
            data-calendar-event-type={event.type}
            className={`${compactCardClass} ${monthCell ? 'block' : 'flex items-center gap-1.5'}`}
          >
            <span className="flex min-w-0 items-start gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-success ${monthCell ? 'mt-1' : ''}`} />
              <span className={compactTitleClass}>{event.title}</span>
              {!monthCell && typeof event.views === 'number' && event.views > 0 && (
                <span className="shrink-0 text-3xs text-ink-muted">
                  <span className="font-mono tabular-nums">{event.views >= 10000 ? `${(event.views / 10000).toFixed(1)}w` : event.views}</span>播
                </span>
              )}
            </span>
            {monthCell && typeof event.views === 'number' && event.views > 0 && (
              <span className="mt-0.5 block pl-3.5 text-3xs leading-3 text-ink-muted">
                <span className="font-mono tabular-nums">{event.views >= 10000 ? `${(event.views / 10000).toFixed(1)}w` : event.views}</span> 播放
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
      className="p-3 rounded-sm border border-line bg-surface hover:bg-canvas transition-all cursor-pointer shadow-2xs hover:shadow-card hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {event.type === 'planned_publish' && (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-ink-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> 计划发布
            </span>
          )}
          {event.type === 'commercial_deal' && (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-ink-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-info" /> 商单交付
            </span>
          )}
          {event.type === 'deadline' && (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-ink-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-warning" /> 制作截止
            </span>
          )}
          {event.type === 'published' && (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-ink-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-success" /> 已上线
            </span>
          )}
          <EventStatusBadge event={event} />
        </div>
        {event.priority && <PriorityBadge priority={event.priority} />}
      </div>

      <div data-testid="calendar-event-title" className="min-w-0 text-sm font-bold leading-snug text-ink line-clamp-2">
        {event.title}
      </div>

      {event.subtitle && (
        <p className="text-xs text-ink-muted mt-1 line-clamp-1">
          {event.subtitle}
        </p>
      )}

      {event.type === 'published' && (typeof event.views === 'number' || typeof event.likes === 'number') && (
        <div className="flex items-center gap-3 mt-2 text-xs text-ink-muted">
          {typeof event.views === 'number' && <span><span className="font-mono tabular-nums">{event.views.toLocaleString()}</span> 播放</span>}
          {typeof event.likes === 'number' && <span><span className="font-mono tabular-nums">{event.likes.toLocaleString()}</span> 点赞</span>}
        </div>
      )}

      {event.type === 'commercial_deal' && typeof event.amount_cents === 'number' && event.amount_cents > 0 && (
        <div className="mt-2 text-xs font-bold text-info">
          商单金额：<span className="font-mono tabular-nums">¥{(event.amount_cents / 100).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};
