import type { NativeApp } from '../native';
import type { Source } from '../../types';
import {
  PLATFORM_TYPES,
  VERIFICATION_STATUSES,
  createId,
  hasInvalidValue,
  isOneOf,
  jsonError,
  requireDb,
  validateExternalUrlField,
  validateTextFields,
} from '../apiShared';
import {
  deleteSource,
  insertSource,
  loadSourcesByTopic,
  loadTopicWorkspace,
  reorderSources,
  SourceReorderInvalidStateError,
  updateSource,
} from '../repositories';

export function registerWorkspaceRoutes(app: NativeApp): void {
  app.get('/topics/:id/workspace', async (c) => {
    try {
      return c.json(await loadTopicWorkspace(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/topics/:id/sources', async (c) => {
    try {
      return c.json(await loadSourcesByTopic(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/sources', async (c) => {
    try {
      const body = await c.req.json<Partial<Source>>();
      if (!body.topic_id || !body.title?.trim()) return c.json({ error: 'topic_id and title are required' }, 400);
      const textError = validateTextFields(body as Record<string, unknown>, {
        title: [200, true], content: [20000], url: [2048], author: [200], published_at: [50], notes: [20000],
        event_date: [50], date_precision: [20],
      });
      if (textError) return c.json({ error: textError }, 400);
      const urlError = validateExternalUrlField(body as Record<string, unknown>, 'url');
      if (urlError) return c.json({ error: urlError }, 400);
      if (body.platform !== undefined && !isOneOf(body.platform, PLATFORM_TYPES)) return c.json({ error: 'Invalid source platform' }, 400);
      if (body.verification_status !== undefined && !isOneOf(body.verification_status, VERIFICATION_STATUSES)) {
        return c.json({ error: 'Invalid verification status' }, 400);
      }
      const now = new Date().toISOString();
      const source: Source = {
        id: body.id || createId('src'), topic_id: body.topic_id, title: body.title.trim(),
        content: body.content || '', url: body.url || '',
        platform: body.platform || 'bilibili', author: body.author || '', published_at: body.published_at || '',
        verification_status: body.verification_status || 'unverified', notes: body.notes || '',
        event_date: body.event_date || '', date_precision: body.date_precision || 'exact',
        sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
        created_at: body.created_at || now, updated_at: now,
      };
      await insertSource(requireDb(c), source);
      return c.json(source, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/sources/reorder/batch', async (c) => {
    try {
      const body = await c.req.json<{ sources?: Array<{ id: string; topic_id: string }> }>();
      const sources = body?.sources;
      if (!Array.isArray(sources) || sources.length === 0) return c.json({ error: 'sources array is required' }, 400);
      const updated_at = await reorderSources(requireDb(c), sources);
      return c.json({ success: true, updated_at });
    } catch (error) {
      if (error instanceof SourceReorderInvalidStateError) return c.json({ error: error.message }, 400);
      return jsonError(c, error, 400);
    }
  });

  app.patch('/sources/:id', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const textError = validateTextFields(body, {
        title: [200, true], content: [20000], url: [2048], author: [200], published_at: [50], notes: [20000],
        event_date: [50], date_precision: [20],
      });
      if (textError) return c.json({ error: textError }, 400);
      const urlError = validateExternalUrlField(body, 'url');
      if (urlError) return c.json({ error: urlError }, 400);
      if (hasInvalidValue(body, 'platform', (value) => isOneOf(value, PLATFORM_TYPES))) return c.json({ error: 'Invalid source platform' }, 400);
      if (hasInvalidValue(body, 'verification_status', (value) => isOneOf(value, VERIFICATION_STATUSES))) {
        return c.json({ error: 'Invalid verification status' }, 400);
      }
      const source = await updateSource(requireDb(c), c.req.param('id'), body);
      return source ? c.json(source) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/sources/:id', async (c) => {
    try {
      await deleteSource(requireDb(c), c.req.param('id'));
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

}
