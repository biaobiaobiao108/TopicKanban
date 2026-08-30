import React from 'react';
import { CalendarEventItem } from './CalendarTypes';
import type { CommercialDealStatus, TopicStatus } from '../../types';
import { Film, Flame, AlertCircle, Handshake, CheckCircle2, Zap } from 'lucide-react';
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
      <span className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-bold ${DEAL_STATUS_CLASSES[status] || DEAL_STATUS_CLASSES.communicating}`}>
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
    if (event.topicId && onOpenTopic) {
      onOpenTopic(event.topicId);
    } else if (event.dealId && onOpenDeal) {
      onOpenDeal(event.dealId);
    } else if (event.publishedVideoId && onOpenPublished) {
      onOpenPublished();
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
            className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-rose-200/50 bg-rose-500/10 px-2 py-1 text-left text-xs font-semibold text-rose-700 shadow-2xs transition-colors hover:bg-rose-500/20 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-400 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
            {event.status && event.status !== 'inbox' && (
              <span className="text-[10px] opacity-75 shrink-0 hidden xl:inline">
                {event.status === 'scripting' ? '写稿' : event.status === 'production' ? '制作' : '已立项'}
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
            className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-amber-200/50 bg-amber-500/10 px-2 py-0.5 text-left text-[11px] font-medium text-amber-800 transition-colors hover:bg-amber-500/20 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
          >
            <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
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
            className="w-full min-w-0 rounded-lg border border-indigo-200/50 bg-indigo-500/10 px-2 py-1.5 text-left text-xs font-semibold text-indigo-700 shadow-2xs transition-colors hover:bg-indigo-500/20 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Handshake className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span data-testid="calendar-event-title" className="min-w-0 flex-1 truncate">{event.title}</span>
              {typeof event.amount_cents === 'number' && event.amount_cents > 0 && (
                <span className="max-w-[4.5rem] shrink-0 truncate font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
                  ¥{(event.amount_cents / 100).toLocaleString()}
                </span>
              )}
            </span>
            {event.status && (
              <span className="mt-1 flex min-w-0 items-center gap-1 pl-[1.125rem] text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500 dark:bg-indigo-400" />
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
            className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-emerald-200/50 bg-emerald-500/10 px-2 py-0.5 text-left text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-500/20 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
          >
            <Film className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
            {typeof event.views === 'number' && event.views > 0 && (
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                {(event.views >= 10000 ? `${(event.views / 10000).toFixed(1)}w` : event.views)}播
              </span>
            )}
          </button>
        );

      case 'deferred_action':
        return (
          <button
            type="button"
            onClick={handleClick}
            title={event.title}
            data-testid="calendar-event"
            data-calendar-event-type={event.type}
            className="flex w-full min-w-0 items-center gap-1 rounded-lg border border-stone-200/50 bg-stone-500/10 px-2 py-0.5 text-left text-[10px] font-medium text-stone-600 transition-colors hover:bg-stone-500/20 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400"
          >
            <Zap className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
          </button>
        );
    }
  }

  // Expanded card format (for agenda view)
  return (
    <div
      onClick={handleClick}
      data-testid="calendar-event"
      data-calendar-event-type={event.type}
      className={`p-3 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-card hover:-translate-y-0.5 ${
        event.type === 'planned_publish'
          ? 'bg-rose-500/[0.04] dark:bg-rose-950/20 border-rose-200/70 dark:border-rose-900/40'
          : event.type === 'commercial_deal'
            ? 'bg-indigo-500/[0.04] dark:bg-indigo-950/20 border-indigo-200/70 dark:border-indigo-900/40'
            : event.type === 'published'
              ? 'bg-emerald-500/[0.04] dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/40'
              : 'bg-stone-500/[0.03] dark:bg-stone-800/40 border-stone-200/70 dark:border-stone-700/60'
      }`}
    >
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {event.type === 'planned_publish' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">计划发布</span>
          )}
          {event.type === 'commercial_deal' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">商单交付</span>
          )}
          {event.type === 'deadline' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-700 text-white">制作截止</span>
          )}
          {event.type === 'published' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-700 text-white">已上线</span>
          )}
          {event.type === 'deferred_action' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-600 text-white">行动唤醒</span>
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
        <div className="flex items-center gap-3 mt-2 text-xs text-stone-500 dark:text-stone-400 font-mono">
          {typeof event.views === 'number' && <span>{event.views.toLocaleString()} 播放</span>}
          {typeof event.likes === 'number' && <span>{event.likes.toLocaleString()} 点赞</span>}
        </div>
      )}

      {event.type === 'commercial_deal' && typeof event.amount_cents === 'number' && event.amount_cents > 0 && (
        <div className="mt-2 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
          商单金额：¥{(event.amount_cents / 100).toLocaleString()}
        </div>
      )}
    </div>
  );
};
