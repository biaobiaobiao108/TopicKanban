import React, { useState } from 'react';
import { Topic } from '../../types';
import { StatusBadge, PriorityBadge, TagPill } from '../ui/Badge';
import {
  Flame,
  ArrowRight,
  Clock,
  CheckCircle2,
  FileText,
  User,
  Plus,
  Sparkles,
  Pin
} from 'lucide-react';
import { NextActionDialog } from '../topic-detail/NextActionDialog';
import { getNextActionAgeDays, getNextActionWarning } from '../../lib/topicMetrics';

const FOCUS_PRIORITY = { high: 3, medium: 2, low: 1, none: 0 };
const ACTIVE_FOCUS_STATUSES = new Set(['approved', 'scripting', 'production']);

interface TodayViewProps {
  topics: Topic[];
  onOpenDetail: (topicId: string) => void;
  onOpenQuickCreate: () => void;
  onTogglePin?: (topicId: string) => void;
  onUpdateTopic: (topicId: string, updates: Partial<Topic>) => Promise<void>;
}

export const TodayView: React.FC<TodayViewProps> = ({
  topics,
  onOpenDetail,
  onOpenQuickCreate,
  onTogglePin,
  onUpdateTopic,
}) => {
  const [actionTopic, setActionTopic] = useState<Topic | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);
  // Main focus: pinned first, then production stage, priority and recent activity.
  const focusTopic = [...topics]
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

  // Top 3~5 today priority items
  const priorityList = [...topics]
    .filter((t) => t.id !== focusTopic?.id && t.status !== 'published' && t.status !== 'icebox')
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return (b.is_pinned || 0) - (a.is_pinned || 0);
      if (FOCUS_PRIORITY[a.priority] !== FOCUS_PRIORITY[b.priority]) return FOCUS_PRIORITY[b.priority] - FOCUS_PRIORITY[a.priority];
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
    .slice(0, 4);

  // Recently updated stream
  const recentUpdates = [...topics]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);
  const visibleRecentUpdates = showAllActivity ? recentUpdates : recentUpdates.slice(0, 3);

  return (
    <div className="flex-1 w-full h-full overflow-y-auto pb-20 md:pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">今日生产聚焦</h2>
              <span className="text-xs bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded-full">
                专注当下
              </span>
            </div>
            <p className="text-xs sm:text-sm text-stone-500 mt-1">
              清晰锁定当前最高价值的视频项目，杜绝多选题犹豫。
            </p>
          </div>

          <button
            onClick={onOpenQuickCreate}
            className="self-start sm:self-auto flex items-center gap-2 bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>记录新灵感</span>
          </button>
        </div>

        {/* 1. Spotlight Feature Topic Card */}
        {focusTopic ? (
          <div className="today-spotlight-card relative bg-white dark:bg-stone-900 rounded-2xl border-2 border-stone-900/80 dark:border-stone-700 p-5 sm:p-8 shadow-card overflow-hidden transition-all">
            {/* Subtle background glow */}
            <div className="absolute -right-8 -top-8 w-40 h-40 bg-rose-50 dark:bg-rose-950/20 rounded-full blur-2xl pointer-events-none" />

            <div className="relative space-y-5 sm:space-y-6">
              {/* Header Badges & Pin */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-rose-600 px-2.5 py-1 rounded-md shadow-xs">
                    <Flame className="w-3.5 h-3.5" />
                    当前主推选题
                  </span>
                  <StatusBadge status={focusTopic.status} />
                  <PriorityBadge priority={focusTopic.priority} />
                  {focusTopic.is_pinned === 1 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900/60">
                      <Pin className="w-3 h-3 fill-amber-600 dark:fill-amber-400" />
                      置顶
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">
                  行动持续 {getNextActionAgeDays(focusTopic)} 天
                </div>
              </div>

              {/* Title & Summary */}
              <div>
                <h3
                  onClick={() => onOpenDetail(focusTopic.id)}
                  className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer leading-tight"
                >
                  {focusTopic.title}
                </h3>
                {focusTopic.summary && (
                  <p className="text-sm sm:text-base text-stone-600 dark:text-stone-300 mt-2 leading-relaxed max-w-3xl">
                    {focusTopic.summary}
                  </p>
                )}
              </div>

              {/* Next Action Callout (The core highlight) */}
              <div className="bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-2">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600 dark:bg-rose-500"></span>
                    </span>
                    <span>当前核心行动 (Next Action)</span>
                  </div>
                  <div className="text-sm sm:text-base font-bold text-rose-950 dark:text-rose-200 leading-snug">
                    {focusTopic.next_action || '尚未设置具体下一步，点击进入工作台规划！'}
                  </div>
                </div>

                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  onClick={() => setActionTopic(focusTopic)}
                  className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{focusTopic.next_action ? '完成当前行动' : '设置下一步'}</span>
                </button>
                <button
                  onClick={() => onOpenDetail(focusTopic.id)}
                  className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 border border-rose-300 dark:border-rose-800 bg-white dark:bg-stone-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                >
                  <span>进入工作台</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                </div>
              </div>

              {getNextActionWarning(focusTopic) && (
                <div className="-mt-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  ⚠ {getNextActionWarning(focusTopic)}
                </div>
              )}

              {/* Bottom Meta */}
              <div className="flex items-center justify-between pt-2 border-t border-stone-200/60 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400">
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
                    <span className="font-mono text-stone-700 dark:text-stone-300 font-medium">
                      文案已写: {focusTopic.draft_word_count} 字
                    </span>
                  ) : null}
                  <span>{focusTopic.verified_facts_count || 0} 条已核实事实</span>
                  <span>{focusTopic.materials_count || 0} 条素材</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-2xl bg-white dark:bg-stone-900">
            <p className="text-stone-500 dark:text-stone-400">当前没有选题，立即创建一个开启今日视频制作！</p>
            <button
              onClick={onOpenQuickCreate}
              className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium cursor-pointer"
            >
              + 新建选题
            </button>
          </div>
        )}

        {/* 2-Column Section: Top Priorities & Recent Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Top Priorities */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <span>今日优先选题</span>
                <span className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-full font-mono font-semibold">
                  {priorityList.length}
                </span>
              </h4>
            </div>

            <div className="space-y-2.5">
              {priorityList.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onOpenDetail(t.id)}
                  className="today-priority-item bg-white dark:bg-stone-900 rounded-xl border border-stone-200/90 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 p-4 shadow-subtle hover:shadow-card-hover transition-all cursor-pointer flex flex-col gap-2 group"
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

                  <h5 className="text-sm font-bold text-stone-900 dark:text-stone-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors line-clamp-1">
                    {t.title}
                  </h5>

                  <div className={`text-xs border p-2 rounded-md ${
                    t.next_action
                      ? 'bg-stone-50 dark:bg-stone-800/60 border-stone-100 dark:border-stone-700/80 text-stone-700 dark:text-stone-300'
                      : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300'
                  }`}>
                    <strong className="text-rose-700 dark:text-rose-400">下一步：</strong>
                    {t.next_action || '尚未设置'}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] ${getNextActionWarning(t) ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'}`}>
                      {getNextActionWarning(t) || `行动持续 ${getNextActionAgeDays(t)} 天`}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setActionTopic(t);
                      }}
                      className="min-h-9 rounded-lg bg-rose-600 px-3 text-[11px] font-bold text-white hover:bg-rose-700 cursor-pointer"
                    >
                      {t.next_action ? '完成行动' : '设置行动'}
                    </button>
                  </div>
                </div>
              ))}

              {priorityList.length === 0 && (
                <div className="p-6 text-center text-xs text-stone-400 dark:text-stone-500 border border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900">
                  暂无其他优先选题
                </div>
              )}
            </div>
          </div>

          {/* Right: Recent Activity / Worklog */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                <span>近期活跃轨迹</span>
              </h4>
            </div>

            <div className="today-recent-updates-panel bg-white/70 dark:bg-stone-900/70 rounded-xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
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

                  <div className="text-[11px] text-stone-400 dark:text-stone-500 font-mono shrink-0">
                    {new Date(t.updated_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                  </div>
                </div>
              ))}
              {recentUpdates.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllActivity((previous) => !previous)}
                  className="w-full px-3 py-2.5 text-xs font-semibold text-stone-500 dark:text-stone-400 hover:bg-white dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer"
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
          onUpdate={(updates) => onUpdateTopic(actionTopic.id, updates)}
        />
      )}
    </div>
  );
};
