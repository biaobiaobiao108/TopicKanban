import React from 'react';
import { CalendarEventItem } from './CalendarTypes';
import { Film, Flame, AlertCircle, Handshake, CheckCircle2, Zap } from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../ui/Badge';

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
            className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 transition-colors text-left cursor-pointer truncate shadow-2xs border border-rose-200/50 dark:border-rose-900/40"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-400 shrink-0" />
            <span className="truncate flex-1">{event.title}</span>
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
            className="w-full flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 transition-colors text-left cursor-pointer truncate border border-amber-200/50 dark:border-amber-900/40"
          >
            <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate flex-1">{event.title}</span>
          </button>
        );

      case 'commercial_deal':
        return (
          <button
            type="button"
            onClick={handleClick}
            title={event.title}
            className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 transition-colors text-left cursor-pointer truncate shadow-2xs border border-indigo-200/50 dark:border-indigo-900/40"
          >
            <Handshake className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate flex-1">{event.title}</span>
            {typeof event.amount_cents === 'number' && event.amount_cents > 0 && (
              <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 shrink-0">
                ¥{(event.amount_cents / 100).toLocaleString()}
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
            className="w-full flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 transition-colors text-left cursor-pointer truncate border border-emerald-200/50 dark:border-emerald-900/40"
          >
            <Film className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate flex-1">{event.title}</span>
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
            className="w-full flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-stone-500/10 hover:bg-stone-500/20 text-stone-600 dark:text-stone-400 dark:bg-stone-800 transition-colors text-left cursor-pointer truncate border border-stone-200/50 dark:border-stone-700"
          >
            <Zap className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="truncate flex-1">{event.title}</span>
          </button>
        );
    }
  }

  // Expanded card format (for week or agenda view)
  return (
    <div
      onClick={handleClick}
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
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          {event.type === 'planned_publish' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">计划发布</span>
          )}
          {event.type === 'commercial_deal' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">商单交付</span>
          )}
          {event.type === 'deadline' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">制作截止</span>
          )}
          {event.type === 'published' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">已上线</span>
          )}
          {event.type === 'deferred_action' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-600 text-white">行动唤醒</span>
          )}
          {event.status && typeof event.status === 'string' && event.status !== 'inbox' && (
            <StatusBadge status={event.status as any} />
          )}
        </div>
        {event.priority && <PriorityBadge priority={event.priority} />}
      </div>

      <h5 className="text-sm font-bold text-stone-900 dark:text-stone-100 leading-snug line-clamp-2">
        {event.title}
      </h5>

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
