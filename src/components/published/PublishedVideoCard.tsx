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
              <div className="absolute top-2 right-2 opacity-0 group-hover/cover:opacity-100 transition-opacity duration-200 bg-black/60 hover:bg-[var(--accent)] text-white p-1.5 rounded-lg text-xs backdrop-blur-xs flex items-center gap-1 shadow-xs font-semibold">
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="text-[10px] pr-0.5 hidden sm:inline">打开</span>
              </div>
            </a>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 bg-stone-100/70 dark:bg-stone-800/40 p-4">
              <Film className="w-7 h-7 stroke-[1.5] mb-1 opacity-40 text-stone-400 dark:text-stone-500" />
              <span className="text-[10px] opacity-60 text-center line-clamp-1">
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
              <span className="text-[11px] font-mono font-bold text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded-full shrink-0">
                {video.bvid || 'BVxxxxxx'}
              </span>
              {video.topic_title && (
                <button
                  type="button"
                  onClick={() => video.topic_id && onSelectTopic(video.topic_id)}
                  className="text-[11px] text-stone-600 dark:text-stone-300 hover:text-[var(--accent)] bg-stone-100 dark:bg-stone-800 hover:bg-[var(--accent-soft)] px-2 py-0.5 rounded-full truncate max-w-[130px] sm:max-w-[170px] transition-colors text-left cursor-pointer font-medium"
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
                  className="p-1 text-stone-400 dark:text-stone-500 hover:text-[var(--accent)] rounded-lg hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50 cursor-pointer"
                  aria-label="从 B站 同步最新数据"
                >
                  <RefreshCw aria-hidden="true" className={`w-3.5 h-3.5 ${isSyncingThis ? 'animate-spin text-[var(--accent)]' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={onEdit}
                aria-label="编辑数据"
                className="p-1 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer transition-colors"
              >
                <Edit2 aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label="删除已发布视频"
                className="p-1 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
              >
                <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: Two-Line Title Slot without clipping */}
          <div className="min-h-[2.75rem] h-[2.75rem] flex items-start overflow-hidden">
            <p className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 leading-snug break-words line-clamp-2 hover:text-[var(--accent)] dark:hover:text-[var(--accent)] transition-colors">
              {video.title}
            </p>
          </div>

          {/* Row 3: Literary Editorial Metrics Flow */}
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-stone-500/[0.03] dark:bg-stone-400/[0.04] px-3 py-2 text-xs select-none">
              <div className="flex items-center gap-1.5 min-w-0" aria-label={`播放量：${video.views}`}>
                <Eye className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" aria-hidden="true" />
                <span className="font-mono font-semibold tabular-nums text-[var(--ink)] text-xs">
                  {formatNumber(video.views)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0" aria-label={`点赞数：${video.likes}`}>
                <ThumbsUp className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
                <span className="font-mono font-semibold tabular-nums text-[var(--ink)] text-xs">
                  {formatNumber(video.likes)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0" aria-label={`投币数：${video.coins}`}>
                <Coins className="w-3.5 h-3.5 text-amber-600/90 dark:text-amber-400 shrink-0" aria-hidden="true" />
                <span className="font-mono font-semibold tabular-nums text-[var(--ink)] text-xs">
                  {formatNumber(video.coins)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0" aria-label={`收藏数：${video.favorites}`}>
                <Bookmark className="w-3.5 h-3.5 text-blue-600/90 dark:text-blue-400 shrink-0" aria-hidden="true" />
                <span className="font-mono font-semibold tabular-nums text-[var(--ink)] text-xs">
                  {formatNumber(video.favorites)}
                </span>
              </div>
            </div>

            {/* Subtle Ratio Micro Pills (内敛微墨质感) */}
            {video.views > 0 && (
              <div className="flex items-center gap-1.5 overflow-hidden text-[10px] text-[var(--ink-muted)] font-mono">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-500/[0.04] dark:bg-stone-400/[0.06] shrink-0">
                  <span className="opacity-70">投币率</span>
                  <strong className="text-[var(--ink)] font-semibold">{metrics.coinRate}%</strong>
                  <span className="text-[9px] px-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-bold">
                    {metrics.coinGrade}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-500/[0.04] dark:bg-stone-400/[0.06] shrink-0">
                  <span className="opacity-70">三连</span>
                  <strong className="text-[var(--accent)] font-semibold">{metrics.tripleRate}%</strong>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-500/[0.04] dark:bg-stone-400/[0.06] shrink-0">
                  <span className="opacity-70">收藏</span>
                  <strong className="text-[var(--ink)] font-semibold">{metrics.favoriteRate}%</strong>
                </span>
                {metrics.viewsPerKWord > 0 && (
                  <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-500/[0.04] dark:bg-stone-400/[0.06] truncate">
                    <span className="opacity-70">千字</span>
                    <strong className="text-[var(--ink)] font-semibold">{formatNumber(metrics.viewsPerKWord)}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Row 4: Bottom Bar (Date + Note Badge + Link) */}
          <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-[11px] text-stone-600 dark:text-stone-400">
            <span className="flex items-center gap-1 shrink-0">
              <Calendar className="w-3 h-3" />
              <span>{video.published_at}</span>
            </span>

            {/* Notes Badge if present (Clean inline badge without hover popup) */}
            {video.notes && (
              <div className="flex items-center mx-1 min-w-0">
                <span className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium max-w-[120px] sm:max-w-[160px] truncate">
                  <FileText className="w-2.5 h-2.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="truncate">{video.notes}</span>
                </span>
              </div>
            )}

            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[var(--accent)] hover:text-[var(--accent-dark)] font-semibold shrink-0"
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
