import React, { useState } from 'react';
import { PublishedVideo, Topic } from '../../types';
import { calculateDeepMetrics } from '../../lib/videoAnalytics';
import { sanitizeExternalHttpUrl } from '../../lib/urlSafety';
import { extractBvid } from '../../lib/bilibili';
import { useBilibiliCover } from '../../hooks/useBilibiliCover';
import {
  Film,
  ExternalLink,
  Edit2,
  Trash2,
  ThumbsUp,
  Coins,
  Bookmark,
  MessageSquare,
  Eye,
  Calendar,
  RefreshCw,
} from 'lucide-react';

interface PublishedVideoCardProps {
  video: PublishedVideo;
  topic?: Topic;
  isSyncingThis: boolean;
  isBulkSyncing: boolean;
  onSync: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelectTopic: (topicId: string) => void;
  formatNumber: (num: number) => string;
}

export const PublishedVideoCard: React.FC<PublishedVideoCardProps> = ({
  video,
  topic,
  isSyncingThis,
  isBulkSyncing,
  onSync,
  onEdit,
  onDelete,
  onSelectTopic,
  formatNumber,
}) => {
  const [imageError, setImageError] = useState(false);
  const cleanBvid = extractBvid(video.bvid || video.url);
  const { data: coverUrl, isLoading: isCoverLoading } = useBilibiliCover(cleanBvid);

  const safeUrl = sanitizeExternalHttpUrl(video.url) || (cleanBvid ? `https://www.bilibili.com/video/${cleanBvid}` : '');
  const metrics = calculateDeepMetrics(video, topic);
  const displayCover = !imageError && Boolean(coverUrl);

  return (
    <div className="group bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs hover:shadow-card hover:-translate-y-0.5 transition-all flex flex-col justify-between overflow-hidden">
      {/* Top 16:9 Cover Area */}
      <div className="relative w-full aspect-video bg-stone-100 dark:bg-stone-800/70 overflow-hidden select-none border-b border-stone-100 dark:border-stone-800">
        {displayCover ? (
          <a
            href={safeUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full relative cursor-pointer group/cover"
            title="在 B站 打开观看成片"
          >
            <img
              src={coverUrl}
              alt={video.title}
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setImageError(true)}
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/cover:scale-105"
            />
            {/* Subtle Gradient Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-0 group-hover/cover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            {/* Quick Watch on Bilibili Badge */}
            <div className="absolute top-2.5 right-2.5 opacity-0 group-hover/cover:opacity-100 transition-opacity duration-200 bg-black/60 hover:bg-rose-600 text-white px-2.5 py-1 rounded-lg text-xs backdrop-blur-xs flex items-center gap-1.5 shadow-xs font-semibold">
              <ExternalLink className="w-3.5 h-3.5" />
              <span>在 B站 观看</span>
            </div>
          </a>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 bg-stone-100/70 dark:bg-stone-800/40">
            <Film className="w-8 h-8 stroke-[1.5] mb-1.5 opacity-40 text-stone-400 dark:text-stone-500" />
            <span className="text-[11px] font-mono opacity-60">
              {cleanBvid ? (isCoverLoading ? '加载封面中...' : '未获取到封面') : '未填写 BV 号'}
            </span>
          </div>
        )}
      </div>

      {/* Card Content Body */}
      <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-3">
          {/* Header Row: BV & Topic Pill + Actions */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2 overflow-hidden h-6">
                <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-300 bg-rose-500/10 dark:bg-rose-950/60 border border-rose-500/20 px-2 py-0.5 rounded-full shrink-0">
                  {video.bvid || 'BVxxxxxx'}
                </span>
                {video.topic_title && (
                  <button
                    type="button"
                    onClick={() => video.topic_id && onSelectTopic(video.topic_id)}
                    className="text-[11px] text-stone-600 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 bg-stone-100 dark:bg-stone-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2 py-0.5 rounded-full truncate max-w-[180px] transition-colors text-left cursor-pointer font-medium"
                    title={`查看选题: ${video.topic_title}`}
                  >
                    选题: {video.topic_title}
                  </button>
                )}
              </div>
              <h3
                className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-snug break-words line-clamp-2 min-h-[2.75rem] flex items-start"
                title={video.title}
              >
                {video.title}
              </h3>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {cleanBvid && (
                <button
                  type="button"
                  onClick={onSync}
                  disabled={isSyncingThis || isBulkSyncing}
                  className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-50 cursor-pointer"
                  title="从 B站 同步最新播放与互动数据"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingThis ? 'animate-spin text-rose-600 dark:text-rose-400' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={onEdit}
                className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
                title="编辑数据"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="p-1.5 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-5 gap-2 bg-stone-500/[0.03] dark:bg-stone-800/60 p-3 rounded-xl border border-stone-200/50 dark:border-stone-800 text-center font-mono">
            <div>
              <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                <Eye className="w-3 h-3" />
                <span>播放</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                {formatNumber(video.views)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                <ThumbsUp className="w-3 h-3" />
                <span>点赞</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-400 mt-0.5">
                {formatNumber(video.likes)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                <Coins className="w-3 h-3" />
                <span>投币</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {formatNumber(video.coins)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                <Bookmark className="w-3 h-3" />
                <span>收藏</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                {formatNumber(video.favorites)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                <MessageSquare className="w-3 h-3" />
                <span>评论</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mt-0.5">
                {formatNumber(video.comments)}
              </div>
            </div>
          </div>

          {/* Deep Key Ratio Badges */}
          {video.views > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300">
                <span>投币率</span>
                <span className="font-bold">{metrics.coinRate}%</span>
                <span className="text-[9px] font-bold px-1 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-200">
                  {metrics.coinGrade}级
                </span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-800 dark:text-rose-300">
                <span>三连率</span>
                <span className="font-bold">{metrics.tripleRate}%</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-800 dark:text-blue-300">
                <span>收藏比</span>
                <span className="font-bold">{metrics.favoriteRate}%</span>
              </span>
              {metrics.viewsPerKWord > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-800 dark:text-purple-300"
                  title="每千字文案产出的播放量"
                >
                  <span>千字产出</span>
                  <span className="font-bold">{formatNumber(metrics.viewsPerKWord)}</span>
                </span>
              )}
            </div>
          )}

          {/* Notes */}
          {video.notes && (
            <div
              className="text-xs text-stone-600 dark:text-stone-300 bg-amber-500/[0.04] dark:bg-amber-950/20 p-3 rounded-xl border border-amber-500/20 leading-relaxed line-clamp-2"
              title={video.notes}
            >
              <strong className="text-stone-800 dark:text-stone-200">复盘笔记：</strong> {video.notes}
            </div>
          )}
        </div>

        {/* Bottom URL link & date */}
        <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-400 dark:text-stone-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            发布时间: {video.published_at}
          </span>

          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-semibold"
            >
              <span>观看成片</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
