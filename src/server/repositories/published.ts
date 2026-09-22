import type { PaginatedPublishedVideos, PublishedVideo, Topic } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';
import { loadTopicBatch } from './topics';
import {
  analyzePeoplePerformance,
  analyzeTagPerformance,
  analyzeTopicModelCorrelation,
  calculateChannelOverview,
  calculateDeepMetrics,
  generateAnalyticsInsights,
  type AnalyticsTopic,
  type PublishedAnalyticsPayload,
} from '../../lib/videoAnalytics';

interface PageOptions {
  page: number;
  pageSize: number;
  query?: string;
}

const ANALYTICS_CACHE_TTL_MS = 30_000;
const ANALYTICS_CACHE_MAX_ENTRIES = 12;
const analyticsCache = new Map<string, { expiresAt: number; payload: PublishedAnalyticsPayload }>();

export function invalidatePublishedAnalyticsCache(): void {
  analyticsCache.clear();
}

function readPublishedAnalyticsCache(key: string): PublishedAnalyticsPayload | null {
  const entry = analyticsCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    analyticsCache.delete(key);
    return null;
  }
  analyticsCache.delete(key);
  analyticsCache.set(key, entry);
  return entry.payload;
}

function writePublishedAnalyticsCache(key: string, payload: PublishedAnalyticsPayload): void {
  analyticsCache.delete(key);
  analyticsCache.set(key, { expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS, payload });
  while (analyticsCache.size > ANALYTICS_CACHE_MAX_ENTRIES) {
    const oldestKey = analyticsCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    analyticsCache.delete(oldestKey);
  }
}

async function loadAnalyticsTopics(
  db: SqliteDatabase,
  range: 'all' | '90d' | 'year',
  cutoff?: string,
): Promise<AnalyticsTopic[]> {
  const eligibility = {
    sql: `t.deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM published_videos av
      WHERE av.topic_id = t.id${range === 'all' ? '' : ' AND av.published_at >= ?'}
    )`,
    values: (range === 'all' ? [] : [cutoff]) as unknown[],
  };
  const [topicResult, peopleResult, tagResult] = await db.batch([
    db.prepare(`SELECT t.id, t.score_character, t.score_conflict, t.score_contrast, t.score_material, t.score_story,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t WHERE ${eligibility.sql}`).bind(...eligibility.values),
    db.prepare(`SELECT tp.topic_id, p.id, p.name
      FROM topic_people tp INNER JOIN people p ON p.id = tp.person_id
      INNER JOIN topics t ON t.id = tp.topic_id
      WHERE ${eligibility.sql}`).bind(...eligibility.values),
    db.prepare(`SELECT tt.topic_id, tg.id, tg.name
      FROM topic_tags tt INNER JOIN tags tg ON tg.id = tt.tag_id
      INNER JOIN topics t ON t.id = tt.topic_id
      WHERE ${eligibility.sql}`).bind(...eligibility.values),
  ]);
  const peopleByTopic = new Map<string, Array<{ id: string; name: string }>>();
  const tagsByTopic = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of peopleResult.results as unknown as Array<{ topic_id: string; id: string; name: string }>) {
    const people = peopleByTopic.get(row.topic_id) || [];
    people.push({ id: row.id, name: row.name });
    peopleByTopic.set(row.topic_id, people);
  }
  for (const row of tagResult.results as unknown as Array<{ topic_id: string; id: string; name: string }>) {
    const tags = tagsByTopic.get(row.topic_id) || [];
    tags.push({ id: row.id, name: row.name });
    tagsByTopic.set(row.topic_id, tags);
  }
  return (topicResult.results as unknown as AnalyticsTopic[]).map((topic) => ({
    ...topic,
    people: peopleByTopic.get(topic.id) || [],
    tags: tagsByTopic.get(topic.id) || [],
  }));
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
  const cacheKey = `${options.range}:${options.page}:${options.pageSize}`;
  const cached = readPublishedAnalyticsCache(cacheKey);
  if (cached) return cached;

  const rangeDays = options.range === '90d' ? 90 : 365;
  const cutoffDate = options.range === 'all' ? null : new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const cutoff = cutoffDate?.toISOString();
  const videoFilter = cutoff ? 'WHERE v.published_at >= ?' : '';
  const result = await db.prepare(`SELECT v.id, v.topic_id, v.title, v.published_at,
      v.views, v.likes, v.coins, v.favorites, v.comments
    FROM published_videos v
    ${videoFilter}
    ORDER BY v.published_at DESC, v.updated_at DESC, v.id DESC`).bind(...(cutoff ? [cutoff] : [])).all<PublishedVideo>();
  const queriedVideos = result.results || [];
  const allVideos = cutoffDate
    ? queriedVideos.filter((video) => {
      const publishedAt = video.published_at ? new Date(video.published_at) : null;
      return publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt >= cutoffDate;
    })
    : queriedVideos;
  const topics = await loadAnalyticsTopics(db, options.range, cutoff);
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const ranking = allVideos
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
  const pageRanking = ranking.slice(offset, offset + options.pageSize);
  const fullTopicIds = Array.from(new Set(pageRanking.map((row) => row.topic?.id).filter((id): id is string => Boolean(id))));
  const overview = calculateChannelOverview(allVideos, topics);
  const fullVideoIds = Array.from(new Set([
    ...pageRanking.map((row) => row.video.id),
    overview.topViewedVideo?.id,
    overview.topCoinedVideo?.id,
  ].filter((id): id is string => Boolean(id))));
  const [fullTopics, fullVideoResult] = await Promise.all([
    loadTopicBatch(db, fullTopicIds),
    fullVideoIds.length > 0
      ? bind(db, `SELECT v.*, t.title AS topic_title
        FROM published_videos v LEFT JOIN topics t ON t.id = v.topic_id
        WHERE v.id IN (${fullVideoIds.map(() => '?').join(',')})`, fullVideoIds).all<PublishedVideo>()
      : Promise.resolve({ results: [] as PublishedVideo[] }),
  ]);
  const fullTopicMap = new Map(fullTopics.map((topic) => [topic.id, topic]));
  const fullVideoMap = new Map(fullVideoResult.results.map((video) => [video.id, video]));
  const completeOverview = {
    ...overview,
    topViewedVideo: overview.topViewedVideo ? fullVideoMap.get(overview.topViewedVideo.id) || overview.topViewedVideo : null,
    topCoinedVideo: overview.topCoinedVideo ? fullVideoMap.get(overview.topCoinedVideo.id) || overview.topCoinedVideo : null,
  };

  const payload: PublishedAnalyticsPayload = {
    totalVideos: allVideos.length,
    overview: completeOverview,
    correlation: analyzeTopicModelCorrelation(allVideos, topics),
    people: analyzePeoplePerformance(allVideos, topics),
    tags: analyzeTagPerformance(allVideos, topics),
    insights: generateAnalyticsInsights(allVideos, topics),
    ranking: pageRanking.map((row) => ({
      ...row,
      video: fullVideoMap.get(row.video.id) || row.video,
      topic: row.topic ? fullTopicMap.get(row.topic.id) || null : null,
    })),
    ranking_total: ranking.length,
    ranking_page: options.page,
    ranking_page_size: options.pageSize,
  };
  writePublishedAnalyticsCache(cacheKey, payload);
  return payload;
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
