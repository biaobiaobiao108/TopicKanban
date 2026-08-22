import React, { useMemo } from 'react';
import { PublishedVideo, Topic } from '../../types';
import {
  calculateChannelOverview,
  analyzeTopicModelCorrelation,
  analyzePeoplePerformance,
  analyzeTagPerformance,
  generateAnalyticsInsights,
  calculateDeepMetrics,
  formatViewsText
} from '../../lib/videoAnalytics';
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

interface AnalyticsDashboardProps {
  publishedList: PublishedVideo[];
  topics: Topic[];
  onSelectTopic: (topicId: string) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  publishedList,
  topics,
  onSelectTopic,
}) => {
  const topicMap = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const overview = useMemo(() => calculateChannelOverview(publishedList, topics), [publishedList, topics]);
  const correlation = useMemo(() => analyzeTopicModelCorrelation(publishedList, topics), [publishedList, topics]);
  const peoplePerf = useMemo(() => analyzePeoplePerformance(publishedList, topics), [publishedList, topics]);
  const tagPerf = useMemo(() => analyzeTagPerformance(publishedList, topics), [publishedList, topics]);
  const insights = useMemo(() => generateAnalyticsInsights(publishedList, topics), [publishedList, topics]);

  // Video ranking list with deep metrics
  const videoTableData = useMemo(() => {
    return publishedList
      .map((video) => {
        const topic = video.topic_id ? topicMap.get(video.topic_id) : undefined;
        const deepMetrics = calculateDeepMetrics(video, topic);
        const storyModelTotal = topic
          ? (topic.score_character || 0) +
            (topic.score_conflict || 0) +
            (topic.score_contrast || 0) +
            (topic.score_material || 0) +
            (topic.score_story || 0)
          : 0;

        return {
          video,
          topic,
          deepMetrics,
          storyModelTotal,
        };
      })
      .sort((a, b) => (b.video.views || 0) - (a.video.views || 0));
  }, [publishedList, topicMap]);

  if (publishedList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-stone-200 text-center space-y-3">
        <BarChart3 className="w-12 h-12 text-stone-300 stroke-[1.5]" />
        <h3 className="text-base font-bold text-stone-800">暂无已发布视频数据</h3>
        <p className="text-xs text-stone-500 max-w-sm">
          在「已发布视频」中添加或从 B 站同步视频数据后，系统将自动基于 5 维故事模型、人物与标签生成深度复盘分析。
        </p>
      </div>
    );
  }

  const renderGradeBadge = (grade: 'S' | 'A' | 'B' | 'C') => {
    const colors: Record<string, string> = {
      S: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
      A: 'bg-amber-100 text-amber-800 border-amber-300 font-bold',
      B: 'bg-blue-50 text-blue-700 border-blue-200',
      C: 'bg-stone-100 text-stone-600 border-stone-200',
    };
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${colors[grade] || colors.C}`}>
        {grade}级
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Channel KPI Overview Cards */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-rose-600" />
            <span>全频道核心数据大盘</span>
          </h3>
          <span className="text-xs text-stone-400 font-mono">已沉淀 {overview.totalVideos} 期视频</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Total Views */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs space-y-1">
            <div className="text-xs font-semibold text-stone-500 flex items-center justify-between">
              <span>总播放量</span>
              <Flame className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-stone-900">
              {formatViewsText(overview.totalViews)}
            </div>
            <div className="text-[11px] text-stone-400 font-mono">
              平均单片: <span className="font-semibold text-stone-700">{formatViewsText(overview.avgViews)}</span>
            </div>
          </div>

          {/* Average Coin Ratio */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs space-y-1">
            <div className="text-xs font-semibold text-stone-500 flex items-center justify-between">
              <span>平均投币率</span>
              <Coins className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-600">
              {overview.avgCoinRate}%
            </div>
            <div className="text-[11px] text-stone-400 flex items-center gap-1">
              <span>B站核心权重</span>
              <span className={`font-bold ${overview.avgCoinRate >= 1.5 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {overview.avgCoinRate >= 1.5 ? '（优秀）' : '（良好）'}
              </span>
            </div>
          </div>

          {/* Average Triple Ratio */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs space-y-1">
            <div className="text-xs font-semibold text-stone-500 flex items-center justify-between">
              <span>平均三连率</span>
              <ThumbsUp className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-rose-600">
              {overview.avgTripleRate}%
            </div>
            <div className="text-[11px] text-stone-400">
              总点赞: <span className="font-semibold text-stone-700 font-mono">{formatViewsText(overview.totalLikes)}</span>
            </div>
          </div>

          {/* Average Favorite Ratio */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs space-y-1">
            <div className="text-xs font-semibold text-stone-500 flex items-center justify-between">
              <span>收藏播放比</span>
              <Bookmark className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-blue-600">
              {overview.avgFavoriteRate}%
            </div>
            <div className="text-[11px] text-stone-400">
              总收藏: <span className="font-semibold text-stone-700 font-mono">{formatViewsText(overview.totalFavorites)}</span>
            </div>
          </div>

          {/* Engagement Score */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs space-y-1 col-span-2 sm:col-span-1">
            <div className="text-xs font-semibold text-stone-500 flex items-center justify-between">
              <span>互动活力评分</span>
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-purple-700">
              {overview.avgEngagementScore} <span className="text-xs font-normal text-stone-400">/ 100</span>
            </div>
            <div className="text-[11px] text-stone-400">
              加权多维互动指数
            </div>
          </div>
        </div>
      </section>

      {/* 2. Topic Model 5D Correlation & Hit Insights */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 5D Story Model Correlation Bars (7 Cols) */}
        <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-2xl border border-stone-200/90 shadow-2xs space-y-5">
          {correlation.hasData ? <>
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-rose-600" />
                <span>5 维故事模型爆款相关性分析</span>
              </h4>
              <p className="text-xs text-stone-500 mt-0.5">
                对比 Top {correlation.topHitsCount} 部高播放爆款与全频道选题的 5 维打分特征
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
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
                    <span className="font-bold text-stone-800">{dim.label}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-rose-700 font-bold">
                        爆款: {dim.topHitsAverage.toFixed(1)}分
                      </span>
                      <span className="text-stone-400">|</span>
                      <span className="text-stone-500">
                        全量: {dim.allAverage.toFixed(1)}分
                      </span>
                      {dim.difference !== 0 && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            isPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {isPositive ? `+${dim.difference.toFixed(1)}` : dim.difference.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dual Bar Comparison */}
                  <div className="h-3 bg-stone-100 rounded-full overflow-hidden relative">
                    {/* All average bar (Light gray baseline) */}
                    <div
                      className="absolute top-0 bottom-0 bg-stone-300 rounded-full opacity-60"
                      style={{ width: `${allPercent}%` }}
                      title={`全频道均值: ${dim.allAverage}分`}
                    />
                    {/* Top hit average bar (Rose primary) */}
                    <div
                      className="absolute top-0 bottom-0 bg-rose-600 rounded-full transition-all duration-500 opacity-90"
                      style={{ width: `${hitPercent}%` }}
                      title={`Top 爆款均值: ${dim.topHitsAverage}分`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-[11px] text-stone-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
                <span>Top 爆款选题均分</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-stone-300 inline-block"></span>
                <span>全频道基准均分</span>
              </span>
            </div>
            <span>满分 5.0 分</span>
          </div>
          </> : (
            <div className="py-10 text-center text-sm text-stone-500">
              暂无关联选题的视频数据，无法进行 5 维故事模型分析。
            </div>
          )}
        </div>

        {/* Right: Hit Insights & Actionable Guidance (5 Cols) */}
        <div className="lg:col-span-5 bg-white p-5 sm:p-6 rounded-2xl border border-stone-200/90 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-3">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span>爆款规律与立项洞察</span>
            </h4>

            <div className="mt-3.5 space-y-3">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-3 rounded-xl border border-stone-200/70 bg-stone-50/60 hover:bg-stone-50 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>{insight.title}</span>
                    </span>
                    {insight.badgeText && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-rose-100/80 text-rose-800">
                        {insight.badgeText}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed pl-5">
                    {insight.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {correlation.hasData && <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/60 text-xs text-amber-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>立项小贴士：</strong> 选题进入「已立项」阶段前，建议确保【{correlation.strongestHitFactor}】得分不低于 4 分，能显著提高完播与出圈概率。
            </div>
          </div>}
        </div>
      </section>

      {/* 3. High-Performance Figures & Tags Ranking */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Figures Performance */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <span>人物票房号召力排行榜</span>
            </h4>
            <span className="text-xs text-stone-400 font-mono">Top {peoplePerf.length} 位人物</span>
          </div>

          {peoplePerf.length === 0 ? (
            <p className="text-xs text-stone-400 py-6 text-center">暂无关联人物数据</p>
          ) : (
            <div className="space-y-2.5">
              {peoplePerf.slice(0, 5).map((person, idx) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-100 hover:border-stone-200 bg-stone-50/40 hover:bg-stone-50 transition-colors"
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
                          : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        {person.name}
                      </div>
                      <div className="text-[11px] text-stone-400 truncate">
                        {person.videoCount} 期视频 · 代表作: {person.topVideoTitle || '无'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono shrink-0">
                    <div className="text-xs font-bold text-stone-900">
                      {formatViewsText(person.totalViews)}
                    </div>
                    <div className="text-[10px] text-amber-600 font-semibold">
                      投币率 {person.avgCoinRate}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tags Performance */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-600" />
              <span>题材标签受众偏好矩阵</span>
            </h4>
            <span className="text-xs text-stone-400 font-mono">Top {tagPerf.length} 个标签</span>
          </div>

          {tagPerf.length === 0 ? (
            <p className="text-xs text-stone-400 py-6 text-center">暂无关联标签数据</p>
          ) : (
            <div className="space-y-2.5">
              {tagPerf.slice(0, 5).map((tag, idx) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-100 hover:border-stone-200 bg-stone-50/40 hover:bg-stone-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span className="text-xs font-mono font-bold text-stone-400 shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        #{tag.name}
                      </div>
                      <div className="text-[11px] text-stone-400">
                        {tag.videoCount} 期视频 · 平均 {formatViewsText(tag.avgViews)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono shrink-0">
                    <div className="text-xs font-bold text-stone-900">
                      {formatViewsText(tag.totalViews)}
                    </div>
                    <div className="text-[10px] text-rose-600 font-semibold">
                      三连率 {tag.avgTripleRate}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. Single Video Deep Metrics Leaderboard */}
      <section className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-rose-600" />
              <span>已发布视频深度复盘明细表</span>
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              透视每部视频的真实三连率、投币率、5 维故事模型总分与千字转化产出
            </p>
          </div>
          <span className="text-xs text-stone-400 font-mono">按播放量降序排列</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200/80 text-stone-500 font-mono">
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
            <tbody className="divide-y divide-stone-100">
              {videoTableData.map(({ video, topic, deepMetrics, storyModelTotal }, index) => (
                <tr key={video.id} className="hover:bg-stone-50/60 transition-colors">
                  {/* Title & Topic Link */}
                  <td className="py-3 px-4 max-w-[280px]">
                    <div className="flex items-start gap-2">
                      <span className="font-mono font-bold text-stone-400 text-xs shrink-0 mt-0.5">
                        {(index + 1).toString().padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        {topic ? (
                          <button
                            onClick={() => onSelectTopic(topic.id)}
                            className="font-bold text-stone-900 hover:text-rose-600 text-left line-clamp-1 transition-colors cursor-pointer"
                            title={`点击进入选题详情「${video.title}」`}
                          >
                            {video.title}
                          </button>
                        ) : (
                          <span className="font-bold text-stone-900 line-clamp-1">{video.title}</span>
                        )}
                        <div className="text-[11px] text-stone-400 flex items-center gap-1.5 mt-0.5">
                          <span>{video.published_at || '未填日期'}</span>
                          {video.bvid && <span className="font-mono text-[10px]">{video.bvid}</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Views */}
                  <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">
                    {formatViewsText(video.views || 0)}
                  </td>

                  {/* Coin Rate & Grade */}
                  <td className="py-3 px-3 text-center font-mono">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-bold text-amber-600">{deepMetrics.coinRate}%</span>
                      {renderGradeBadge(deepMetrics.coinGrade)}
                    </div>
                  </td>

                  {/* Triple Rate & Grade */}
                  <td className="py-3 px-3 text-center font-mono">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-bold text-rose-600">{deepMetrics.tripleRate}%</span>
                      {renderGradeBadge(deepMetrics.tripleGrade)}
                    </div>
                  </td>

                  {/* Favorite Rate */}
                  <td className="py-3 px-3 text-center font-mono font-semibold text-blue-600">
                    {deepMetrics.favoriteRate}%
                  </td>

                  {/* 5D Story Score Total */}
                  <td className="py-3 px-3 text-center font-mono font-bold text-purple-700">
                    {storyModelTotal > 0 ? `${storyModelTotal}分` : '-'}
                  </td>

                  {/* Views per 1k Words */}
                  <td className="py-3 px-3 text-right font-mono text-stone-600">
                    {deepMetrics.viewsPerKWord > 0 ? `${formatViewsText(deepMetrics.viewsPerKWord)}/千字` : '-'}
                  </td>

                  {/* Notes */}
                  <td className="py-3 px-4 max-w-[220px]">
                    {video.notes ? (
                      <span className="text-stone-600 line-clamp-1 text-[11px]" title={video.notes}>
                        {video.notes}
                      </span>
                    ) : (
                      <span className="text-stone-300 text-[11px]">暂无笔记</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
