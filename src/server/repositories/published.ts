import type { PaginatedPublishedVideos, PublishedVideo, Topic } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { bind } from './shared';
import { loadTopic } from './topics';
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

async function loadAnalyticsTopics(db: SqliteDatabase): Promise<AnalyticsTopic[]> {
  const [topicResult, peopleResult, tagResult] = await db.batch([
    db.prepare(`SELECT id, score_character, score_conflict, score_contrast, score_material, score_story,
      COALESCE((SELECT word_count FROM drafts d WHERE d.topic_id = t.id LIMIT 1), 0) AS draft_word_count
      FROM topics t WHERE t.deleted_at IS NULL`),
    db.prepare(`SELECT tp.topic_id, p.id, p.name
      FROM topic_people tp INNER JOIN people p ON p.id = tp.person_id
      INNER JOIN topics t ON t.id = tp.topic_id AND t.deleted_at IS NULL`),
    db.prepare(`SELECT tt.topic_id, tg.id, tg.name
      FROM topic_tags tt INNER JOIN tags tg ON tg.id = tt.tag_id
      INNER JOIN topics t ON t.id = tt.topic_id AND t.deleted_at IS NULL`),
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
  const result = await db.prepare(`SELECT v.*, t.title AS topic_title
    FROM published_videos v
    LEFT JOIN topics t ON t.id = v.topic_id
    ORDER BY v.published_at DESC, v.updated_at DESC, v.id DESC`).all<PublishedVideo>();
  const allVideos = result.results || [];
  const topics = await loadAnalyticsTopics(db);
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
  const pageRanking = ranking.slice(offset, offset + options.pageSize);
  const fullTopicIds = Array.from(new Set(pageRanking.map((row) => row.topic?.id).filter((id): id is string => Boolean(id))));
  const fullTopics = await Promise.all(fullTopicIds.map((id) => loadTopic(db, id)));
  const fullTopicMap = new Map(fullTopics.filter((topic): topic is Topic => Boolean(topic)).map((topic) => [topic.id, topic]));

  return {
    totalVideos: filteredVideos.length,
    overview: calculateChannelOverview(filteredVideos, topics),
    correlation: analyzeTopicModelCorrelation(filteredVideos, topics),
    people: analyzePeoplePerformance(filteredVideos, topics),
    tags: analyzeTagPerformance(filteredVideos, topics),
    insights: generateAnalyticsInsights(filteredVideos, topics),
    ranking: pageRanking.map((row) => ({
      ...row,
      topic: row.topic ? fullTopicMap.get(row.topic.id) || null : null,
    })),
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
