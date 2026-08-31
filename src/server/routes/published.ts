import type { NativeApp } from '../native';
import type { PublishedVideo } from '../../types';
import {
  createId,
  hasInvalidValue,
  isNonNegativeInteger,
  jsonError,
  requireDb,
  validateExternalUrlField,
  validateTextFields,
} from '../apiShared';
import {
  deletePublishedVideo,
  insertPublishedVideo,
  loadBootstrap,
  loadPublishedAnalytics,
  loadPublishedPage,
  updatePublishedVideo,
} from '../repositories';

export function registerPublishedRoutes(app: NativeApp): void {
  app.get('/published', async (c) => {
    try {
      const data = await loadBootstrap(requireDb(c), undefined, {
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
      return jsonError(c, error, 400);
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
      return jsonError(c, error, 400);
    }
  });

  app.post('/published', async (c) => {
    try {
      const body = await c.req.json<Partial<PublishedVideo>>();
      if (!body.title?.trim()) return c.json({ error: 'title is required' }, 400);
      if (body.topic_id !== undefined && body.topic_id !== null && typeof body.topic_id !== 'string') {
        return c.json({ error: 'topic_id must be a string or null' }, 400);
      }
      const textError = validateTextFields(body as Record<string, unknown>, {
        title: [200, true], url: [2048], bvid: [20], published_at: [50], notes: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
      const urlError = validateExternalUrlField(body as Record<string, unknown>, 'url');
      if (urlError) return c.json({ error: urlError }, 400);
      if (body.bvid && !/^BV[a-zA-Z0-9]{10}$/i.test(body.bvid)) return c.json({ error: 'Invalid BVID' }, 400);
      for (const field of ['views', 'likes', 'coins', 'favorites', 'comments'] as const) {
        if (body[field] !== undefined && !isNonNegativeInteger(body[field])) {
          return c.json({ error: `${field} must be a non-negative integer` }, 400);
        }
      }
      const now = new Date().toISOString();
      const topicId = typeof body.topic_id === 'string' && body.topic_id.trim() ? body.topic_id.trim() : null;
      const video: PublishedVideo = {
        id: body.id || createId('pub'), topic_id: topicId, title: body.title.trim(),
        url: body.url || '', bvid: body.bvid || '', published_at: body.published_at || now.slice(0, 10),
        views: body.views || 0, likes: body.likes || 0, coins: body.coins || 0,
        favorites: body.favorites || 0, comments: body.comments || 0, notes: body.notes || '', updated_at: now,
      };
      await insertPublishedVideo(requireDb(c), video);
      return c.json(video, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/published/:id', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      if (Object.prototype.hasOwnProperty.call(body, 'topic_id')) {
        if (body.topic_id !== null && typeof body.topic_id !== 'string') {
          return c.json({ error: 'topic_id must be a string or null' }, 400);
        }
        body.topic_id = typeof body.topic_id === 'string' && body.topic_id.trim() ? body.topic_id.trim() : null;
      }
      const textError = validateTextFields(body, { title: [200, true], url: [2048], bvid: [20], published_at: [50], notes: [20000] });
      if (textError) return c.json({ error: textError }, 400);
      const urlError = validateExternalUrlField(body, 'url');
      if (urlError) return c.json({ error: urlError }, 400);
      if (typeof body.bvid === 'string' && body.bvid && !/^BV[a-zA-Z0-9]{10}$/i.test(body.bvid)) return c.json({ error: 'Invalid BVID' }, 400);
      for (const field of ['views', 'likes', 'coins', 'favorites', 'comments']) {
        if (hasInvalidValue(body, field, isNonNegativeInteger)) {
          return c.json({ error: `${field} must be a non-negative integer` }, 400);
        }
      }
      const video = await updatePublishedVideo(requireDb(c), c.req.param('id'), body);
      return video ? c.json(video) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/published/:id', async (c) => {
    try {
      await deletePublishedVideo(requireDb(c), c.req.param('id'));
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
