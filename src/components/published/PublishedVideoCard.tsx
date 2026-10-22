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

  const safeUrl =
    sanitizeExternalHttpUrl(video.url) || (cleanBvid ? `https://www.bilibili.com/video/${cleanBvid}` : '');
  const metrics = calculateDeepMetrics(video, topic);
  const displayCover = !imageError && Boolean(coverUrl);

  return (
    <div className="published-card-container w-full">
      <div className="group bg-surface rounded-2xl border border-line shadow-subtle hover:shadow-card hover:-translate-y-0.5 transition-all duration-200 flex flex-col published-card-inner p-3.5 sm:p-4 gap-3.5 sm:gap-4">
        {/* Left 16:9 Inset Cover Area with Full Rounded Corners */}
        <div className="relative w-full published-card-cover aspect-video shrink-0 rounded-xl overflow-hidden select-none border border-line bg-control shadow-2xs">
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
              <div className="absolute top-2 right-2 opacity-0 group-hover/cover:opacity-100 transition-opacity duration-200 bg-overlay hover:bg-accent text-white p-1.5 rounded-lg text-xs backdrop-blur-xs flex items-center gap-1 shadow-xs font-semibold">
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="text-3xs pr-0.5 hidden sm:inline">打开</span>
              </div>
            </a>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-ink-muted bg-control p-4">
              <Film className="w-7 h-7 stroke-[1.5] mb-1 opacity-40 text-ink-muted" />
              <span className="text-3xs opacity-60 text-center line-clamp-1">
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
              <span className="text-2xs font-mono font-bold text-accent bg-accent-soft px-2 py-0.5 rounded-full shrink-0">
                {video.bvid || 'BVxxxxxx'}
              </span>
              {video.topic_title && (
                <button
                  type="button"
                  onClick={() => video.topic_id && onSelectTopic(video.topic_id)}
                  className="text-2xs text-ink-muted hover:text-accent bg-control hover:bg-accent-soft px-2 py-0.5 rounded-full truncate max-w-[130px] sm:max-w-[170px] transition-colors text-left cursor-pointer font-medium"
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
                  className="p-1 text-ink-muted hover:text-accent rounded-lg hover:bg-accent-soft transition-colors disabled:opacity-50 cursor-pointer"
                  aria-label="从 B站 同步最新数据"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 ${isSyncingThis ? 'animate-spin text-accent' : ''}`}
                  />
                </button>
              )}
              <button
                type="button"
                onClick={onEdit}
                aria-label="编辑数据"
                className="p-1 text-ink-muted hover:text-ink rounded-lg hover:bg-control cursor-pointer transition-colors"
              >
                <Edit2 aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label="删除已发布视频"
                className="p-1 text-ink-muted hover:text-danger rounded-lg hover:bg-danger-soft cursor-pointer transition-colors"
              >
                <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: Two-Line Title Slot without clipping */}
          <div className="min-h-[2.75rem] h-[2.75rem] flex items-start overflow-hidden">
            <p className="text-xs sm:text-sm font-bold text-ink leading-snug break-words line-clamp-2 hover:text-accent transition-colors">
              {video.title}
            </p>
          </div>

          {/* Row 3: Literary Editorial Metrics Flow */}
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-control px-3 py-2 text-xs select-none">
              <div className="flex items-center gap-1.5 min-w-0" aria-label={`播放量：${video.views}`}>
                <Eye className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />
                <span className="font-mono font-semibold tabular-nums text-ink text-xs">
                  {formatNumber(video.views)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0" aria-label={`点赞数：${video.likes}`}>
                <ThumbsUp className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
                <span className="font-mono font-semibold tabular-nums text-ink text-xs">
                  {formatNumber(video.likes)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0" aria-label={`投币数：${video.coins}`}>
                <Coins className="w-3.5 h-3.5 text-warning/90 shrink-0" aria-hidden="true" />
                <span className="font-mono font-semibold tabular-nums text-ink text-xs">
                  {formatNumber(video.coins)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0" aria-label={`收藏数：${video.favorites}`}>
                <Bookmark className="w-3.5 h-3.5 text-info/90 shrink-0" aria-hidden="true" />
                <span className="font-mono font-semibold tabular-nums text-ink text-xs">
                  {formatNumber(video.favorites)}
                </span>
              </div>
            </div>

            {/* Subtle Ratio Micro Pills (内敛微墨质感) */}
            {video.views > 0 && (
              <div className="flex items-center gap-2 sm:gap-2.5 overflow-hidden text-3xs text-ink-muted font-mono">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-control shrink-0">
                  <span className="opacity-70">投币率</span>
                  <strong className="text-ink font-semibold">{metrics.coinRate}%</strong>
                  <span className="text-3xs px-1 rounded-full bg-warning-soft text-warning font-bold">
                    {metrics.coinGrade}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-control shrink-0">
                  <span className="opacity-70">三连</span>
                  <strong className="text-accent font-semibold">{metrics.tripleRate}%</strong>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-control shrink-0">
                  <span className="opacity-70">收藏</span>
                  <strong className="text-ink font-semibold">{metrics.favoriteRate}%</strong>
                </span>
              </div>
            )}
          </div>

          {/* Row 4: Bottom Bar (Date + Note Badge + Link) */}
          <div className="pt-2 border-t border-line flex items-center justify-between text-2xs text-ink-muted">
            <span className="flex items-center gap-1 shrink-0">
              <Calendar className="w-3 h-3" />
              <span>{video.published_at}</span>
            </span>

            {/* Notes Badge if present (Clean inline badge without hover popup) */}
            {video.notes && (
              <div className="flex items-center mx-1 min-w-0">
                <span className="text-3xs text-warning bg-warning-soft border border-warning-soft px-1.5 py-0.5 rounded flex items-center gap-1 font-medium max-w-[120px] sm:max-w-[160px] truncate">
                  <FileText className="w-2.5 h-2.5 shrink-0 text-warning" />
                  <span className="truncate">{video.notes}</span>
                </span>
              </div>
            )}

            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-accent hover:text-accent-dark font-semibold shrink-0"
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
