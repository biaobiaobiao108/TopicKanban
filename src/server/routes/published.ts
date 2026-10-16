import type { NativeApp } from '../native';
import type { PublishedVideo } from '../../types';
import { getBeijingDateString } from '../../lib/beijingTime';
import {
  createId,
  jsonError,
  jsonValidationError,
  requireDb,
} from '../apiShared';
import {
  parseWithZod,
  publishedVideoCreateSchema,
  publishedVideoUpdateSchema,
} from '../schemas';
import {
  deletePublishedVideo,
  insertPublishedVideo,
  invalidatePublishedAnalyticsCache,
  loadBootstrap,
  loadPublishedAnalytics,
  loadPublishedPage,
  updatePublishedVideo,
} from '../repositories';

export function registerPublishedRoutes(app: NativeApp): void {
  app.get('/published', async (c) => {
    try {
      const data = await loadBootstrap(requireDb(c), {
        includeTopics: false, includePeople: false, includeRelationships: false, includePublished: true, includeTags: false,
      });
      return c.json(data.published);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/published/page', async (c) => {
    try {
      const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.req.query('page_size') || '30', 10) || 30));
      return c.json(await loadPublishedPage(requireDb(c), { page, pageSize }));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/published/analytics', async (c) => {
    try {
      const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.req.query('page_size') || '30', 10) || 30));
      const requestedRange = c.req.query('range');
      const range = requestedRange === '90d' || requestedRange === 'year' ? requestedRange : 'all';
      return c.json(await loadPublishedAnalytics(requireDb(c), { page, pageSize, range }));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/published', async (c) => {
    try {
      const parsed = parseWithZod(publishedVideoCreateSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);
      const now = new Date().toISOString();
      const topicId = typeof parsed.data.topic_id === 'string' && parsed.data.topic_id.trim() ? parsed.data.topic_id.trim() : null;
      const video: PublishedVideo = {
        id: parsed.data.id || createId('pub'),
        topic_id: topicId,
        title: parsed.data.title.trim(),
        url: parsed.data.url || '',
        bvid: parsed.data.bvid || '',
        published_at: parsed.data.published_at || getBeijingDateString(),
        views: parsed.data.views || 0,
        likes: parsed.data.likes || 0,
        coins: parsed.data.coins || 0,
        favorites: parsed.data.favorites || 0,
        comments: parsed.data.comments || 0,
        notes: parsed.data.notes || '',
        updated_at: now,
      };
      await insertPublishedVideo(requireDb(c), video);
      invalidatePublishedAnalyticsCache();
      return c.json(video, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.patch('/published/:id', async (c) => {
    try {
      const parsed = parseWithZod(publishedVideoUpdateSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);
      const updateData = { ...parsed.data };
      if (Object.prototype.hasOwnProperty.call(updateData, 'topic_id')) {
        updateData.topic_id = typeof updateData.topic_id === 'string' && updateData.topic_id.trim() ? updateData.topic_id.trim() : null;
      }
      const video = await updatePublishedVideo(requireDb(c), c.req.param('id'), updateData);
      if (video) invalidatePublishedAnalyticsCache();
      return video ? c.json(video) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/published/:id', async (c) => {
    try {
      await deletePublishedVideo(requireDb(c), c.req.param('id'));
      invalidatePublishedAnalyticsCache();
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
