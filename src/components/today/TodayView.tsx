import React, { useState, useMemo } from 'react';
import { CommercialDeal, DealFocusData, Topic } from '../../types';
import { StatusBadge, PriorityBadge, TagPill } from '../ui/Badge';
import {
  Flame,
  ArrowRight,
  Clock,
  CheckCircle2,
  User,
  Sparkles,
  Pin,
  Zap,
  Handshake,
  WalletCards,
  Calendar,
} from 'lucide-react';
import { NextActionDialog } from '../topic-detail/NextActionDialog';
import { PageHeader } from '../layout/PageHeader';
import { getNextActionAgeDays, getNextActionWarning } from '../../lib/topicMetrics';
import { useActionDateDisplay } from '../../lib/actionDate';
import { ActionDateText } from '../ui/ActionDate';

const FOCUS_PRIORITY = { high: 3, medium: 2, low: 1, none: 0 };
const ACTIVE_FOCUS_STATUSES = new Set(['approved', 'scripting', 'production']);
const DEAL_STATUS_LABELS: Record<CommercialDeal['status'], string> = {
  communicating: '沟通中',
  producing: '制作中',
  delivered: '已交付',
  archived: '归档',
};

function DealFocusCard({ deal, onOpen }: { deal: CommercialDeal; onOpen: () => void }) {
  const deliveryDate = useActionDateDisplay(deal.delivery_due_date, !['delivered', 'archived'].includes(deal.status));
  const isDue = deliveryDate.state === 'today' || deliveryDate.state === 'overdue';
  const isUnpaid = deal.payment_status === 'unpaid' && deal.status === 'delivered';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-stone-200/70 bg-white p-4 text-left shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-card dark:border-stone-800 dark:bg-stone-900"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isUnpaid ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'bg-rose-500/10 text-rose-600 dark:text-rose-300'}`}>
        {isUnpaid ? <WalletCards className="h-5 w-5" /> : <Handshake className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-sm font-bold text-stone-900 dark:text-stone-100"
            title={`${deal.brand_name || '未命名品牌'} · ${deal.title}`}
          >
            {deal.brand_name || '未命名品牌'} · {deal.title}
          </span>
          <span className="max-w-[4.5rem] shrink-0 truncate rounded-full bg-stone-500/10 px-2 py-0.5 text-[10px] font-bold text-stone-600 dark:text-stone-300">
            {DEAL_STATUS_LABELS[deal.status]}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
          {isUnpaid ? <span className="font-semibold text-amber-700 dark:text-amber-300">已交付待回款</span> : <span className={isDue ? 'font-semibold text-rose-700 dark:text-rose-300' : ''}>{isDue ? '截止' : '交付截止'}：{deliveryDate.state === 'empty' ? '未设截止日期' : <ActionDateText display={deliveryDate} />}</span>}
          {deal.next_action ? <span className="truncate">下一步：{deal.next_action}</span> : <span className="font-semibold text-amber-700 dark:text-amber-300">缺少下一步行动</span>}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" />
    </button>
  );
}

interface TodayViewProps {
  topics: Topic[];
  dealFocus?: DealFocusData;
  staleActionDays?: number;
  onOpenDetail: (topicId: string) => void;
  onOpenDeal?: (dealId: string) => void;
  onOpenQuickCreate: () => void;
  onTogglePin?: (topicId: string) => void;
  onUpdateTopic: (topicId: string, updates: Partial<Topic>) => Promise<void>;
}

export const TodayView: React.FC<TodayViewProps> = ({
  topics,
  dealFocus = { due_items: [], unpaid_items: [], total_active: 0 },
  staleActionDays = 5,
  onOpenDetail,
  onOpenDeal,
  onOpenQuickCreate,
  onTogglePin,
  onUpdateTopic,
}) => {
  const [actionTopic, setActionTopic] = useState<Topic | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);

  // Main focus: pinned first, then production stage, priority and recent activity.
  const focusTopic = useMemo(() => {
    return [...topics]
      .filter((topic) => topic.status !== 'published' && topic.status !== 'icebox')
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return (b.is_pinned || 0) - (a.is_pinned || 0);
        const activeDiff = Number(ACTIVE_FOCUS_STATUSES.has(b.status)) - Number(ACTIVE_FOCUS_STATUSES.has(a.status));
        if (activeDiff !== 0) return activeDiff;
        if (FOCUS_PRIORITY[a.priority] !== FOCUS_PRIORITY[b.priority]) {
          return FOCUS_PRIORITY[b.priority] - FOCUS_PRIORITY[a.priority];
        }
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      })[0] || null;
  }, [topics]);

  // Top 3~5 today priority items
  const priorityList = useMemo(() => {
    return [...topics]
      .filter((t) => t.id !== focusTopic?.id && t.status !== 'published' && t.status !== 'icebox')
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return (b.is_pinned || 0) - (a.is_pinned || 0);
        if (FOCUS_PRIORITY[a.priority] !== FOCUS_PRIORITY[b.priority]) return FOCUS_PRIORITY[b.priority] - FOCUS_PRIORITY[a.priority];
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      })
      .slice(0, 4);
  }, [topics, focusTopic?.id]);

  // Recently updated stream
  const recentUpdates = useMemo(() => {
    return [...topics]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 8);
  }, [topics]);
  const visibleRecentUpdates = showAllActivity ? recentUpdates : recentUpdates.slice(0, 3);
  const focusDeals = useMemo(() => {
    const seen = new Set<string>();
    return [...dealFocus.due_items, ...dealFocus.unpaid_items].filter((deal) => {
      if (seen.has(deal.id)) return false;
      seen.add(deal.id);
      return true;
    }).slice(0, 8);
  }, [dealFocus.due_items, dealFocus.unpaid_items]);

  return (
    <div className="flex-1 w-full h-full overflow-y-auto overscroll-contain pb-20 md:pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        <PageHeader
          title="今日生产聚焦"
          icon={Calendar}
          badge={<span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">专注当下</span>}
          actions={(
            <button
              type="button"
              onClick={onOpenQuickCreate}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-stone-800 hover:shadow-xs dark:bg-rose-600 dark:hover:bg-rose-700 sm:text-sm"
            >
              <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <span>记录新灵感</span>
            </button>
          )}
        />

        {/* 1. Spotlight Feature Topic Card (Editorial Hero Spotlight) */}
        {focusTopic ? (
          <div className="today-spotlight-card relative bg-gradient-to-br from-white via-white to-rose-50/20 dark:from-stone-900 dark:via-stone-900 dark:to-rose-950/20 rounded-3xl border border-stone-200/70 dark:border-stone-800 p-6 sm:p-8 shadow-card ring-1 ring-stone-900/5 dark:ring-white/5 overflow-hidden transition-all">
            {/* Subtle atmospheric glow */}
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-rose-500/5 dark:bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative space-y-5 sm:space-y-6">
              {/* Header Badges & Pin */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-rose-600 px-3 py-1 rounded-full shadow-2xs">
                    <Flame className="w-3.5 h-3.5" />
                    <span>主推选题</span>
                  </span>
                  <StatusBadge status={focusTopic.status} />
                  <PriorityBadge priority={focusTopic.priority} />
                  {focusTopic.is_pinned === 1 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                      <Pin className="w-3 h-3 fill-amber-600 dark:fill-amber-400" />
                      置顶
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-stone-400 dark:text-stone-500">
                  行动持续 <span className="font-mono tabular-nums">{getNextActionAgeDays(focusTopic)}</span> 天
                </div>
              </div>

              {/* Title & Summary */}
              <div>
                <h2
                  onClick={() => onOpenDetail(focusTopic.id)}
                  className="text-xl sm:text-2xl lg:text-3xl font-bold text-stone-900 dark:text-stone-100 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer leading-tight text-pretty"
                >
                  {focusTopic.title}
                </h2>
                {focusTopic.summary && (
                  <p className="text-sm sm:text-base text-stone-600 dark:text-stone-300 mt-2.5 leading-relaxed max-w-4xl">
                    {focusTopic.summary}
                  </p>
                )}
              </div>

              {/* Next Action Callout (Editorial Action Hero Tile) */}
              <div className="bg-rose-500/[0.07] dark:bg-rose-500/[0.12] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-2">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600 dark:bg-rose-500"></span>
                    </span>
                    <Zap className="w-3.5 h-3.5 fill-rose-500/20" />
                    <span>当前核心行动 (Next Action)</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-snug">
                    {focusTopic.next_action || '尚未设置具体下一步，点击立即规划！'}
                  </div>
                </div>

                <div className="flex w-full shrink-0 flex-col gap-2.5 sm:w-auto sm:flex-row">
                  <button
                    onClick={() => setActionTopic(focusTopic)}
                    className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-2xs hover:shadow-xs active:scale-[0.98] cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{focusTopic.next_action ? '推进 / 完成行动' : '设置下一步'}</span>
                  </button>
                  <button
                    onClick={() => onOpenDetail(focusTopic.id)}
                    className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700/80 text-stone-800 dark:text-stone-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-2xs hover:shadow-xs active:scale-[0.98] cursor-pointer"
                  >
                    <span>进入工作台</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {getNextActionWarning(focusTopic, new Date(), staleActionDays) && (
                <div className="-mt-3 text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <span>⚠</span>
                  <span>{getNextActionWarning(focusTopic, new Date(), staleActionDays)}</span>
                </div>
              )}

              {/* Bottom Meta */}
              <div className="flex items-center justify-between pt-3 border-t border-stone-200/60 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400">
                <div className="flex items-center gap-2 flex-wrap">
                  {focusTopic.people && focusTopic.people.length > 0 && (
                    <span className="flex items-center gap-1 font-medium text-stone-700 dark:text-stone-300">
                      <User className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
                      {focusTopic.people.map((p) => p.name).join(' / ')}
                    </span>
                  )}
                  {focusTopic.tags?.map((t) => (
                    <TagPill key={t.id} name={t.name} />
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  {focusTopic.draft_word_count ? (
                    <span className="text-stone-700 dark:text-stone-300 font-medium">
                      文案: <span className="font-mono tabular-nums">{focusTopic.draft_word_count}</span> 字
                    </span>
                  ) : null}
                  <span>{focusTopic.verified_sources_count || 0} 条已确认资料</span>
                  <span>{focusTopic.sources_count || 0} 条资料</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center border-2 border-dashed border-stone-300/70 dark:border-stone-800 rounded-3xl bg-white dark:bg-stone-900">
            <p className="text-stone-500 dark:text-stone-400">当前没有活跃选题，立即创建一个开启今日视频制作！</p>
            <button
              onClick={onOpenQuickCreate}
              className="mt-4 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition-all shadow-2xs cursor-pointer"
            >
              + 新建选题
            </button>
          </div>
        )}

        {focusDeals.length > 0 && onOpenDeal && (
          <section aria-labelledby="today-deals-heading" className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="today-deals-heading" className="flex items-center gap-2 text-base font-bold text-stone-900 dark:text-stone-100">
                  <Handshake className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  商单待推进
                  <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-mono font-bold text-rose-700 dark:text-rose-300">{focusDeals.length}</span>
                </h2>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">交付节点、下一步行动与已交付未回款事项集中在这里。</p>
              </div>
              <button type="button" onClick={() => onOpenDeal(focusDeals[0].id)} className="min-h-11 shrink-0 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-800 dark:hover:text-rose-300">打开商单</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {focusDeals.map((deal) => <DealFocusCard key={deal.id} deal={deal} onOpen={() => onOpenDeal(deal.id)} />)}
            </div>
          </section>
        )}

        {/* 2-Column Section: Top Priorities & Recent Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Top Priorities */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <span>今日优先选题</span>
                <span className="text-xs bg-stone-200/60 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2 py-0.5 rounded-full font-mono font-bold tabular-nums">
                  {priorityList.length}
                </span>
              </h2>
            </div>

            <div className="space-y-3">
              {priorityList.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenDetail(t.id)}
                  className="today-priority-item bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 p-4 sm:p-5 shadow-2xs hover:shadow-card-hover hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col gap-2.5 group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                    </div>
                    {t.is_pinned === 1 && (
                      <Pin className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors line-clamp-1">
                    {t.title}
                  </h3>

                  <div className={`text-xs p-2.5 rounded-xl ${
                    t.next_action
                      ? 'bg-stone-500/5 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300'
                      : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
                  }`}>
                    <strong className="text-rose-700 dark:text-rose-400">下一步：</strong>
                    {t.next_action || '尚未设置'}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className={`text-[11px] ${getNextActionWarning(t, new Date(), staleActionDays) ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'}`}>
                      {getNextActionWarning(t, new Date(), staleActionDays) || `行动持续 ${getNextActionAgeDays(t)} 天`}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setActionTopic(t);
                      }}
                      className="min-h-8 rounded-lg bg-rose-600 px-3 text-[11px] font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer shadow-2xs"
                    >
                      {t.next_action ? '完成行动' : '设置行动'}
                    </button>
                  </div>
                </div>
              ))}

              {priorityList.length === 0 && (
                <div className="p-8 text-center text-xs text-stone-500 dark:text-stone-400 border border-stone-200/70 dark:border-stone-800 rounded-2xl bg-white dark:bg-stone-900">
                  暂无其他优先选题
                </div>
              )}
            </div>
          </div>

          {/* Right: Recent Activity / Worklog */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                <span>近期活跃轨迹</span>
              </h2>
            </div>

            <div className="today-recent-updates-panel bg-white/80 dark:bg-stone-900/80 rounded-2xl border border-stone-200/70 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800/70 shadow-2xs overflow-hidden">
              {visibleRecentUpdates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenDetail(t.id)}
                  className="p-3.5 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors truncate">
                        {t.title}
                      </span>
                      <StatusBadge status={t.status} />
                    </div>
                    {t.next_action && (
                      <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                        下一步: {t.next_action}
                      </p>
                    )}
                  </div>

                  <div className="text-[11px] text-stone-600 dark:text-stone-400 shrink-0">
                    <time dateTime={t.updated_at} className="tabular-nums">
                      {new Date(t.updated_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                    </time>
                  </div>
                </div>
              ))}
              {recentUpdates.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllActivity((previous) => !previous)}
                  className="w-full px-3 py-2.5 text-xs font-semibold text-stone-500 dark:text-stone-400 hover:bg-white dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer transition-colors"
                >
                  {showAllActivity ? '收起近期轨迹' : `展开另外 ${recentUpdates.length - 3} 条`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {actionTopic && (
        <NextActionDialog
          isOpen
          topic={topics.find((topic) => topic.id === actionTopic.id) || actionTopic}
          onClose={() => setActionTopic(null)}
          onUpdate={async (updates) => {
            await onUpdateTopic(actionTopic.id, updates);
          }}
        />
      )}
    </div>
  );
};
