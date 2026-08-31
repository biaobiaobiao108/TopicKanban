import React, { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchPublishedAnalytics } from '../../lib/storage';
import { formatViewsText, type PublishedAnalyticsPayload } from '../../lib/videoAnalytics';
import {
  TrendingUp,
  Coins,
  ThumbsUp,
  Bookmark,
  Sparkles,
  Flame,
  Award,
  Users,
  Tag,
  BarChart3,
  Lightbulb,
  ExternalLink,
  FileText,
  CheckCircle2,
  ArrowUpRight,
  HelpCircle
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';

interface AnalyticsDashboardProps {
  onSelectTopic: (topicId: string) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  onSelectTopic,
}) => {
  const [range, setRange] = useState<'all' | '90d' | 'year'>('all');
  const [tablePage, setTablePage] = useState(1);
  const analyticsQuery = useQuery<PublishedAnalyticsPayload>({
    queryKey: ['published-analytics', range, tablePage],
    queryFn: () => fetchPublishedAnalytics(range, tablePage, 30),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    setTablePage(1);
  }, [range]);

  if (analyticsQuery.isError) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:text-rose-200">
        复盘数据加载失败，请稍后重试。
      </div>
    );
  }

  if (analyticsQuery.isLoading || !analyticsQuery.data) {
    return (
      <div className="flex items-center justify-center p-16 text-stone-400 dark:text-stone-500">
        <BarChart3 className="w-6 h-6 animate-pulse text-rose-600 dark:text-rose-400 mr-2" />
        <span className="text-sm">正在载入复盘数据...</span>
      </div>
    );
  }

  const { overview, correlation, people: peoplePerf, tags: tagPerf, insights, ranking: videoTableData } = analyticsQuery.data;
  const filteredVideoCount = analyticsQuery.data.totalVideos;
  const tablePageSize = 30;
  const tablePageCount = Math.max(1, Math.ceil(analyticsQuery.data.ranking_total / tablePageSize));
  const visibleVideoTableData = videoTableData;

  if (analyticsQuery.data.totalVideos === 0 && range === 'all') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 text-center space-y-3 shadow-2xs">
        <BarChart3 className="w-12 h-12 text-stone-300 dark:text-stone-600 stroke-[1.5]" />
        <h3 className="text-base font-bold text-stone-800 dark:text-stone-200">暂无已发布视频数据</h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm">
          在「已发布视频」中添加或从 B 站同步视频数据后，系统将自动基于 5 维故事模型、人物与标签生成深度复盘分析。
        </p>
      </div>
    );
  }

  const renderGradeBadge = (grade: 'S' | 'A' | 'B' | 'C') => {
    const colors: Record<string, string> = {
      S: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold',
      A: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 font-bold',
      B: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold',
      C: 'bg-stone-200/60 dark:bg-stone-800 text-stone-600 dark:text-stone-400',
    };
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] ${colors[grade] || colors.C}`}>
        {grade}级
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Filter range */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900 px-5 py-3.5 shadow-2xs">
        <div>
          <div className="text-sm font-bold text-stone-900 dark:text-stone-100">复盘范围</div>
          <div className="text-xs text-stone-500 dark:text-stone-400">按发布时间筛选，将数据规律转化为近期立项行动</div>
        </div>
        <CustomSelect
          value={range}
          onChange={(value) => setRange(value as 'all' | '90d' | 'year')}
          ariaLabel="复盘时间范围"
          size="sm"
          options={[
            { value: 'all', label: '全部视频' },
            { value: '90d', label: '最近 90 天' },
            { value: 'year', label: '最近 1 年' },
          ]}
        />
      </div>

      {filteredVideoCount === 0 && (
        <div className="rounded-2xl border border-amber-200/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          当前时间范围没有带有效发布日期的视频，请切换范围或补充发布日期后再复盘。
        </div>
      )}

      {filteredVideoCount > 0 && filteredVideoCount < 3 && (
        <div className="rounded-2xl border border-stone-200/70 dark:border-stone-800 bg-stone-500/[0.03] dark:bg-stone-800/40 px-4 py-3 text-xs text-stone-600 dark:text-stone-300">
          当前只有 {filteredVideoCount} 期视频，趋势和人物/标签对比仅供参考，积累更多数据后再做结论。
        </div>
      )}

      {/* 1. Channel KPI Overview Cards */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>全频道核心数据大盘</span>
          </h3>
          <span className="text-xs text-stone-400 dark:text-stone-500">已沉淀 <span className="font-mono tabular-nums">{overview.totalVideos}</span> 期视频</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Total Views */}
          <div className="bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs space-y-1">
            <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 flex items-center justify-between">
              <span>总播放量</span>
              <Flame className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-stone-900 dark:text-stone-100">
              {formatViewsText(overview.totalViews)}
            </div>
            <div className="text-[11px] text-stone-400 dark:text-stone-500">
              平均单片: <span className="font-semibold text-stone-700 dark:text-stone-300 font-mono tabular-nums">{formatViewsText(overview.avgViews)}</span>
            </div>
          </div>

          {/* Average Coin Ratio */}
          <div className="bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs space-y-1">
            <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 flex items-center justify-between">
              <span>平均投币率</span>
              <Coins className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
              {overview.avgCoinRate}%
            </div>
            <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center gap-1">
              <span>B站核心权重</span>
              <span className={`font-bold ${overview.avgCoinRate >= 1.5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {overview.avgCoinRate >= 1.5 ? '（优秀）' : '（良好）'}
              </span>
            </div>
          </div>

          {/* Average Triple Ratio */}
          <div className="bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs space-y-1">
            <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 flex items-center justify-between">
              <span>平均三连率</span>
              <ThumbsUp className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
              {overview.avgTripleRate}%
            </div>
            <div className="text-[11px] text-stone-400 dark:text-stone-500">
              总点赞: <span className="font-semibold text-stone-700 dark:text-stone-300 font-mono">{formatViewsText(overview.totalLikes)}</span>
            </div>
          </div>

          {/* Average Favorite Ratio */}
          <div className="bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs space-y-1">
            <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 flex items-center justify-between">
              <span>收藏播放比</span>
              <Bookmark className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
              {overview.avgFavoriteRate}%
            </div>
            <div className="text-[11px] text-stone-400 dark:text-stone-500">
              总收藏: <span className="font-semibold text-stone-700 dark:text-stone-300 font-mono">{formatViewsText(overview.totalFavorites)}</span>
            </div>
          </div>

          {/* Engagement Score */}
          <div className="bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs space-y-1 col-span-2 sm:col-span-1">
            <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 flex items-center justify-between">
              <span>互动活力评分</span>
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-purple-700 dark:text-purple-300">
              {overview.avgEngagementScore} <span className="text-xs font-normal text-stone-400">/ 100</span>
            </div>
            <div className="text-[11px] text-stone-400 dark:text-stone-500">
              加权多维互动指数
            </div>
          </div>
        </div>
      </section>

      {/* 2. Topic Model 5D Correlation & Hit Insights */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 5D Story Model Correlation Bars (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-stone-900 p-5 sm:p-6 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs space-y-5">
          {correlation.hasData ? (
            <>
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <span>5 维故事模型爆款相关性分析</span>
                  </h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    对比 Top {correlation.topHitsCount} 部高播放爆款与全频道选题的 5 维打分特征
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300">
                    第一驱动力: {correlation.strongestHitFactor}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {correlation.dimensions.map((dim) => {
                  const maxScore = 5.0;
                  const hitPercent = Math.min(100, Math.max(0, (dim.topHitsAverage / maxScore) * 100));
                  const allPercent = Math.min(100, Math.max(0, (dim.allAverage / maxScore) * 100));
                  const isPositive = dim.difference > 0;

                  return (
                    <div key={dim.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-stone-800 dark:text-stone-200">{dim.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-rose-700 dark:text-rose-400 font-bold">
                            爆款: <span className="font-mono tabular-nums">{dim.topHitsAverage.toFixed(1)}</span>分
                          </span>
                          <span className="text-stone-400">|</span>
                          <span className="text-stone-500 dark:text-stone-400">
                            全量: <span className="font-mono tabular-nums">{dim.allAverage.toFixed(1)}</span>分
                          </span>
                          {dim.difference !== 0 && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                                isPositive ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-stone-200/60 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                              }`}
                            >
                              {isPositive ? `+${dim.difference.toFixed(1)}` : dim.difference.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Dual Bar Comparison */}
                      <div className="h-3 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden relative">
                        {/* All average bar (Light gray baseline) */}
                        <div
                          className="absolute top-0 bottom-0 bg-stone-300 dark:bg-stone-700 rounded-full opacity-60"
                          style={{ width: `${allPercent}%` }}
                          title={`全频道均值: ${dim.allAverage}分`}
                        />
                        {/* Top hit average bar (Rose primary) */}
                        <div
                          className="absolute top-0 bottom-0 bg-rose-600 dark:bg-rose-500 rounded-full transition-all duration-500 opacity-90"
                          style={{ width: `${hitPercent}%` }}
                          title={`Top 爆款均值: ${dim.topHitsAverage}分`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800 text-[11px] text-stone-400 dark:text-stone-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />
                    <span>Top 爆款选题均分</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-stone-300 dark:bg-stone-700 inline-block" />
                    <span>全频道基准均分</span>
                  </span>
                </div>
                <span>满分 5.0 分</span>
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-stone-500 dark:text-stone-400">
              暂无关联选题的视频数据，无法进行 5 维故事模型分析。
            </div>
          )}
        </div>

        {/* Right: Hit Insights & Actionable Guidance (5 Cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-stone-900 p-5 sm:p-6 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2 border-b border-stone-100 dark:border-stone-800 pb-3">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span>爆款规律与立项洞察</span>
            </h4>

            <div className="mt-3.5 space-y-3">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-3.5 rounded-xl border border-stone-200/60 dark:border-stone-800 bg-stone-500/[0.03] dark:bg-stone-800/40 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>{insight.title}</span>
                    </span>
                    {insight.badgeText && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-800 dark:text-rose-300">
                        {insight.badgeText}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed pl-5">
                    {insight.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {correlation.hasData && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>立项小贴士：</strong> 选题进入「已立项」阶段前，建议确保【{correlation.strongestHitFactor}】得分不低于 4 分，能显著提高完播与出圈概率。
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. High-Performance Figures & Tags Ranking */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Figures Performance */}
        <div className="bg-white dark:bg-stone-900 p-5 sm:p-6 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>人物票房号召力排行榜</span>
            </h4>
            <span className="text-xs text-stone-400 dark:text-stone-500">Top <span className="font-mono tabular-nums">{peoplePerf.length}</span> 位人物</span>
          </div>

          {peoplePerf.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-stone-500 py-6 text-center">暂无关联人物数据</p>
          ) : (
            <div className="space-y-2.5">
              {peoplePerf.slice(0, 5).map((person, idx) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-200/50 dark:border-stone-800 bg-stone-500/[0.03] dark:bg-stone-800/40 hover:bg-stone-100/50 dark:hover:bg-stone-800/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                        idx === 0
                          ? 'bg-amber-500 text-white'
                          : idx === 1
                          ? 'bg-stone-400 text-white'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                        {person.name}
                      </div>
                      <div className="text-[11px] text-stone-400 dark:text-stone-500 truncate">
                        {person.videoCount} 期视频 · 代表作: {person.topVideoTitle || '无'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-stone-900 dark:text-stone-100 font-mono tabular-nums">
                      {formatViewsText(person.totalViews)}
                    </div>
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                      投币率 <span className="font-mono tabular-nums">{person.avgCoinRate}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tags Performance */}
        <div className="bg-white dark:bg-stone-900 p-5 sm:p-6 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>题材标签受众偏好矩阵</span>
            </h4>
            <span className="text-xs text-stone-400 dark:text-stone-500">Top <span className="font-mono tabular-nums">{tagPerf.length}</span> 个标签</span>
          </div>

          {tagPerf.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-stone-500 py-6 text-center">暂无关联标签数据</p>
          ) : (
            <div className="space-y-2.5">
              {tagPerf.slice(0, 5).map((tag, idx) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-200/50 dark:border-stone-800 bg-stone-500/[0.03] dark:bg-stone-800/40 hover:bg-stone-100/50 dark:hover:bg-stone-800/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span className="text-xs font-mono font-bold text-stone-400 dark:text-stone-500 shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                        #{tag.name}
                      </div>
                      <div className="text-[11px] text-stone-400 dark:text-stone-500">
                        {tag.videoCount} 期视频 · 平均 {formatViewsText(tag.avgViews)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-stone-900 dark:text-stone-100 font-mono tabular-nums">
                      {formatViewsText(tag.totalViews)}
                    </div>
                    <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                      三连率 <span className="font-mono tabular-nums">{tag.avgTripleRate}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. Single Video Deep Metrics Leaderboard */}
      <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Award className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>已发布视频深度复盘明细表</span>
            </h4>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              透视每部视频的真实三连率、投币率、5 维故事模型总分与千字转化产出
            </p>
          </div>
          <span className="text-xs text-stone-400 dark:text-stone-500">按播放量降序排列</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-50/80 dark:bg-stone-800/80 border-b border-stone-200/70 dark:border-stone-800 text-stone-500 dark:text-stone-400">
                <th className="py-3 px-4 font-semibold">排名/视频标题</th>
                <th className="py-3 px-3 font-semibold text-right">播放量</th>
                <th className="py-3 px-3 font-semibold text-center">投币率</th>
                <th className="py-3 px-3 font-semibold text-center">三连率</th>
                <th className="py-3 px-3 font-semibold text-center">收藏比</th>
                <th className="py-3 px-3 font-semibold text-center">5维总分</th>
                <th className="py-3 px-3 font-semibold text-right">千字产出</th>
                <th className="py-3 px-4 font-semibold">复盘心得</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {visibleVideoTableData.map(({ video, topic, deepMetrics, storyModelTotal }, index) => (
                <tr key={video.id} className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition-colors">
                  {/* Title & Topic Link */}
                  <td className="py-3 px-4 max-w-[280px]">
                    <div className="flex items-start gap-2">
                      <span className="font-mono tabular-nums font-bold text-stone-400 dark:text-stone-500 text-xs shrink-0 mt-0.5">
                        {(index + 1 + (tablePage - 1) * tablePageSize).toString().padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        {topic ? (
                          <button
                            onClick={() => onSelectTopic(topic.id)}
                            className="font-bold text-stone-900 dark:text-stone-100 hover:text-rose-600 dark:hover:text-rose-400 text-left line-clamp-1 transition-colors cursor-pointer"
                            title={`点击进入选题详情「${video.title}」`}
                          >
                            {video.title}
                          </button>
                        ) : (
                          <span className="font-bold text-stone-900 dark:text-stone-100 line-clamp-1">{video.title}</span>
                        )}
                        <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center gap-1.5 mt-0.5">
                          <span>{video.published_at || '未填日期'}</span>
                          {video.bvid && <span className="font-mono text-[10px]">{video.bvid}</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Views */}
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-stone-900 dark:text-stone-100">
                    {formatViewsText(video.views || 0)}
                  </td>

                  {/* Coin Rate & Grade */}
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums">{deepMetrics.coinRate}%</span>
                      {renderGradeBadge(deepMetrics.coinGrade)}
                    </div>
                  </td>

                  {/* Triple Rate & Grade */}
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-bold text-rose-600 dark:text-rose-400 font-mono tabular-nums">{deepMetrics.tripleRate}%</span>
                      {renderGradeBadge(deepMetrics.tripleGrade)}
                    </div>
                  </td>

                  {/* Favorite Rate */}
                  <td className="py-3 px-3 text-center font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                    {deepMetrics.favoriteRate}%
                  </td>

                  {/* 5D Story Score Total */}
                  <td className="py-3 px-3 text-center font-bold text-purple-700 dark:text-purple-300">
                    {storyModelTotal > 0 ? <><span className="font-mono tabular-nums">{storyModelTotal}</span>分</> : '-'}
                  </td>

                  {/* Views per 1k Words */}
                  <td className="py-3 px-3 text-right text-stone-600 dark:text-stone-300">
                    {deepMetrics.viewsPerKWord > 0 ? <><span className="font-mono tabular-nums">{formatViewsText(deepMetrics.viewsPerKWord)}</span>/千字</> : '-'}
                  </td>

                  {/* Notes */}
                  <td className="py-3 px-4 max-w-[220px]">
                    {video.notes ? (
                      <span className="text-stone-600 dark:text-stone-300 line-clamp-1 text-[11px]" title={video.notes}>
                        {video.notes}
                      </span>
                    ) : (
                      <span className="text-stone-300 dark:text-stone-600 text-[11px]">暂无笔记</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {analyticsQuery.data.ranking_total > 0 && (
          <div className="flex items-center justify-center gap-3 border-t border-stone-100 px-5 py-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
            <button type="button" disabled={tablePage <= 1} onClick={() => setTablePage((current) => Math.max(1, current - 1))} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900">上一页</button>
            <span><span className="font-mono tabular-nums">{tablePage} / {tablePageCount}</span> · 共 <span className="font-mono tabular-nums">{analyticsQuery.data.ranking_total}</span> 条</span>
            <button type="button" disabled={tablePage >= tablePageCount} onClick={() => setTablePage((current) => Math.min(tablePageCount, current + 1))} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900">下一页</button>
          </div>
        )}
      </section>
    </div>
  );
};
