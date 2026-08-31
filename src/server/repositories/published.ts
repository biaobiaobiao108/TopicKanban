import type { PaginatedPublishedVideos, PublishedVideo, Topic } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';
import { loadTopics } from './topics';
import {
  analyzePeoplePerformance,
  analyzeTagPerformance,
  analyzeTopicModelCorrelation,
  calculateChannelOverview,
  calculateDeepMetrics,
  generateAnalyticsInsights,
  type PublishedAnalyticsPayload,
} from '../../lib/videoAnalytics';

interface PageOptions {
  page: number;
  pageSize: number;
  query?: string;
}

export async function loadPublishedPage(db: SqliteDatabase, options: PageOptions): Promise<PaginatedPublishedVideos> {
  const offset = (options.page - 1) * options.pageSize;
  const [countResult, rowsResult] = await db.batch([
    db.prepare('SELECT COUNT(*) AS count FROM published_videos'),
    db.prepare(`SELECT v.*, t.title AS topic_title
      FROM published_videos v
      LEFT JOIN topics t ON t.id = v.topic_id
      ORDER BY v.published_at DESC, v.updated_at DESC, v.id DESC
      LIMIT ? OFFSET ?`).bind(options.pageSize, offset),
  ]);
  const total = Number((countResult.results[0] as { count?: number } | undefined)?.count || 0);
  return {
    items: rowsResult.results as unknown as PaginatedPublishedVideos['items'],
    page: options.page,
    page_size: options.pageSize,
    total,
    total_pages: Math.ceil(total / options.pageSize),
  };
}

export async function loadPublishedAnalytics(
  db: SqliteDatabase,
  options: PageOptions & { range: 'all' | '90d' | 'year' },
): Promise<PublishedAnalyticsPayload> {
  const result = await db.prepare(`SELECT v.*, t.title AS topic_title
    FROM published_videos v
    LEFT JOIN topics t ON t.id = v.topic_id
    ORDER BY v.published_at DESC, v.updated_at DESC, v.id DESC`).all<PublishedVideo>();
  const allVideos = result.results || [];
  const topics = await loadTopics(db, 'active');
  const filteredVideos = options.range === 'all'
    ? allVideos
    : (() => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (options.range === '90d' ? 90 : 365));
      return allVideos.filter((video) => {
        const publishedAt = video.published_at ? new Date(video.published_at) : null;
        return publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt >= cutoff;
      });
    })();
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const ranking = filteredVideos
    .map((video) => {
      const topic = video.topic_id ? topicMap.get(video.topic_id) || null : null;
      return {
        video,
        topic,
        deepMetrics: calculateDeepMetrics(video, topic),
        storyModelTotal: topic
          ? topic.score_character + topic.score_conflict + topic.score_contrast + topic.score_material + topic.score_story
          : 0,
      };
    })
    .sort((a, b) => (b.video.views || 0) - (a.video.views || 0) || a.video.id.localeCompare(b.video.id));
  const offset = (options.page - 1) * options.pageSize;

  return {
    totalVideos: filteredVideos.length,
    overview: calculateChannelOverview(filteredVideos, topics),
    correlation: analyzeTopicModelCorrelation(filteredVideos, topics),
    people: analyzePeoplePerformance(filteredVideos, topics),
    tags: analyzeTagPerformance(filteredVideos, topics),
    insights: generateAnalyticsInsights(filteredVideos, topics),
    ranking: ranking.slice(offset, offset + options.pageSize),
    ranking_total: ranking.length,
    ranking_page: options.page,
    ranking_page_size: options.pageSize,
  };
}
export function publishedStatement(db: SqliteDatabase, video: PublishedVideo): SqlitePreparedStatement {
  return bind(db, `INSERT INTO published_videos (
    id, topic_id, title, url, bvid, published_at, views, likes, coins, favorites, comments, notes, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    video.id, video.topic_id, video.title, video.url, video.bvid, video.published_at,
    video.views, video.likes, video.coins, video.favorites, video.comments, video.notes, video.updated_at,
  ]);
}

export async function insertPublishedVideo(db: SqliteDatabase, video: PublishedVideo): Promise<void> {
  await publishedStatement(db, video).run();
}

export async function findPublishedVideo(db: SqliteDatabase, id: string): Promise<PublishedVideo | null> {
  return db.prepare('SELECT * FROM published_videos WHERE id = ?').bind(id).first<PublishedVideo>();
}

export async function updatePublishedVideo(db: SqliteDatabase, id: string, body: Record<string, unknown>): Promise<PublishedVideo | null> {
  const fields = ['topic_id', 'title', 'url', 'bvid', 'published_at', 'views', 'likes', 'coins', 'favorites', 'comments', 'notes']
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (fields.length > 0) {
    await bind(db, `UPDATE published_videos SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...fields.map((field) => body[field]), new Date().toISOString(), id]).run();
  }
  return findPublishedVideo(db, id);
}

export async function deletePublishedVideo(db: SqliteDatabase, id: string): Promise<void> {
  await bind(db, 'DELETE FROM published_videos WHERE id = ?', [id]).run();
}
