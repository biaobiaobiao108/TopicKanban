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
  FileText,
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
    <div className="published-card-container w-full">
      <div className="group bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 shadow-2xs hover:shadow-card hover:-translate-y-0.5 transition-all duration-200 flex flex-col published-card-inner p-3.5 sm:p-4 gap-3.5 sm:gap-4">
        {/* Left 16:9 Inset Cover Area with Full Rounded Corners */}
        <div className="relative w-full published-card-cover aspect-video shrink-0 rounded-xl overflow-hidden select-none border border-stone-200/70 dark:border-stone-800 bg-stone-100 dark:bg-stone-800/70 shadow-2xs">
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
                width={640}
                height={360}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                onError={() => setImageError(true)}
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/cover:scale-105"
              />
              {/* Subtle Hover Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover/cover:opacity-100 transition-opacity duration-300 pointer-events-none" />

              {/* Quick Watch Icon */}
              <div className="absolute top-2 right-2 opacity-0 group-hover/cover:opacity-100 transition-opacity duration-200 bg-black/60 hover:bg-rose-600 text-white p-1.5 rounded-lg text-xs backdrop-blur-xs flex items-center gap-1 shadow-xs font-semibold">
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="text-[10px] pr-0.5 hidden sm:inline">打开</span>
              </div>
            </a>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 bg-stone-100/70 dark:bg-stone-800/40 p-4">
              <Film className="w-7 h-7 stroke-[1.5] mb-1 opacity-40 text-stone-400 dark:text-stone-500" />
              <span className="text-[10px] font-mono opacity-60 text-center line-clamp-1">
                {cleanBvid ? (isCoverLoading ? '加载封面...' : '未获取封面') : '无 BV 号'}
              </span>
            </div>
          )}
        </div>

        {/* Right Column: Structured Fixed Slots */}
        <div className="flex-1 min-w-0 flex flex-col justify-between space-y-2">
          {/* Row 1: Header Row (BV + Topic + Actions) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-hidden min-w-0 flex-1">
              <span className="text-[11px] font-mono font-bold text-rose-700 dark:text-rose-300 bg-rose-500/10 dark:bg-rose-950/60 border border-rose-500/20 px-2 py-0.5 rounded-full shrink-0">
                {video.bvid || 'BVxxxxxx'}
              </span>
              {video.topic_title && (
                <button
                  type="button"
                  onClick={() => video.topic_id && onSelectTopic(video.topic_id)}
                  className="text-[11px] text-stone-600 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 bg-stone-100 dark:bg-stone-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2 py-0.5 rounded-full truncate max-w-[130px] sm:max-w-[170px] transition-colors text-left cursor-pointer font-medium"
                  title={`查看选题: ${video.topic_title}`}
                >
                  选题: {video.topic_title}
                </button>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {cleanBvid && (
                <button
                  type="button"
                  onClick={onSync}
                  disabled={isSyncingThis || isBulkSyncing}
                  className="p-1 text-stone-400 dark:text-stone-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-50 cursor-pointer"
                  aria-label="从 B站 同步最新数据"
                  title="从 B站 同步最新数据"
                >
                  <RefreshCw aria-hidden="true" className={`w-3.5 h-3.5 ${isSyncingThis ? 'animate-spin text-rose-600 dark:text-rose-400' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={onEdit}
                aria-label="编辑数据"
                className="p-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
                title="编辑数据"
              >
                <Edit2 aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label="删除已发布视频"
                className="p-1 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                title="删除"
              >
                <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: Two-Line Title Slot without clipping */}
          <div className="min-h-[2.75rem] h-[2.75rem] flex items-start overflow-hidden">
            <h3
              className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 leading-snug break-words line-clamp-2 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              title={video.title}
            >
              {video.title}
            </h3>
          </div>

          {/* Row 3: 5 Key Metrics Bar + Ratios */}
          <div className="space-y-1">
            <div className="grid grid-cols-5 gap-1 bg-stone-500/[0.03] dark:bg-stone-800/50 p-1.5 rounded-lg border border-stone-200/50 dark:border-stone-800 text-center font-mono">
              <div>
                <div className="text-[9px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                  <Eye className="w-2.5 h-2.5" />
                  <span>播放</span>
                </div>
                <div className="text-[11px] font-bold text-stone-900 dark:text-stone-100 leading-tight">
                  {formatNumber(video.views)}
                </div>
              </div>

              <div>
                <div className="text-[9px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                  <ThumbsUp className="w-2.5 h-2.5" />
                  <span>点赞</span>
                </div>
                <div className="text-[11px] font-bold text-rose-700 dark:text-rose-400 leading-tight">
                  {formatNumber(video.likes)}
                </div>
              </div>

              <div>
                <div className="text-[9px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                  <Coins className="w-2.5 h-2.5" />
                  <span>投币</span>
                </div>
                <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 leading-tight">
                  {formatNumber(video.coins)}
                </div>
              </div>

              <div>
                <div className="text-[9px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                  <Bookmark className="w-2.5 h-2.5" />
                  <span>收藏</span>
                </div>
                <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 leading-tight">
                  {formatNumber(video.favorites)}
                </div>
              </div>

              <div>
                <div className="text-[9px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-0.5">
                  <MessageSquare className="w-2.5 h-2.5" />
                  <span>评论</span>
                </div>
                <div className="text-[11px] font-bold text-stone-700 dark:text-stone-300 leading-tight">
                  {formatNumber(video.comments)}
                </div>
              </div>
            </div>

            {/* Key Ratio Micro Badges */}
            {video.views > 0 && (
              <div className="flex items-center gap-1.5 overflow-hidden text-[10px] font-mono">
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-800 dark:text-amber-300 shrink-0">
                  <span>投币</span>
                  <span className="font-bold">{metrics.coinRate}%</span>
                  <span className="text-[8px] font-bold px-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-200">
                    {metrics.coinGrade}
                  </span>
                </span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-800 dark:text-rose-300 shrink-0">
                  <span>三连</span>
                  <span className="font-bold">{metrics.tripleRate}%</span>
                </span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-800 dark:text-blue-300 shrink-0">
                  <span>收藏</span>
                  <span className="font-bold">{metrics.favoriteRate}%</span>
                </span>
                {metrics.viewsPerKWord > 0 && (
                  <span
                    className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-800 dark:text-purple-300 truncate"
                    title={`每千字文案产出 ${formatNumber(metrics.viewsPerKWord)} 播放`}
                  >
                    <span>千字</span>
                    <span className="font-bold">{formatNumber(metrics.viewsPerKWord)}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Row 4: Bottom Bar (Date + Note Tooltip + Link) */}
          <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-[11px] text-stone-400 dark:text-stone-500">
            <span className="flex items-center gap-1 shrink-0">
              <Calendar className="w-3 h-3" />
              <span>{video.published_at}</span>
            </span>

            {/* Notes Tooltip Badge if present */}
            {video.notes && (
              <div className="relative group/note flex items-center cursor-help mx-1 min-w-0">
                <span className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium max-w-[120px] sm:max-w-[160px] truncate">
                  <FileText className="w-2.5 h-2.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="truncate">{video.notes}</span>
                </span>
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/note:block w-56 sm:w-64 p-2.5 bg-stone-900/95 dark:bg-stone-800 text-stone-100 text-xs rounded-xl shadow-xl z-30 pointer-events-none whitespace-normal leading-relaxed border border-stone-700 backdrop-blur-xs">
                  <strong className="text-amber-400 block mb-0.5">复盘笔记：</strong>
                  {video.notes}
                </div>
              </div>
            )}

            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-semibold shrink-0"
              >
                <span>成片</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
