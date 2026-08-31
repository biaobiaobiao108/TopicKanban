import type { NativeApp } from '../native';
import type { Source, TimelineEvent } from '../../types';
import {
  DATE_PRECISIONS,
  MAX_BATCH_SIZE,
  PLATFORM_TYPES,
  VERIFICATION_STATUSES,
  createId,
  hasInvalidValue,
  isNonNegativeInteger,
  isOneOf,
  jsonError,
  requireDb,
  validateExternalUrlField,
  validateTextFields,
} from '../apiShared';
import {
  deleteSource,
  deleteTimelineEvent,
  getNextTimelineSortOrder,
  insertSource,
  insertTimelineEvent,
  loadSourcesByTopic,
  loadTimelineEvents,
  loadTopicWorkspace,
  reorderTimelineEvents,
  updateSource,
  updateTimelineEvent,
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
        created_at: body.created_at || now, updated_at: now,
      };
      await insertSource(requireDb(c), source);
      return c.json(source, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/sources/:id', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const textError = validateTextFields(body, {
        title: [200, true], content: [20000], url: [2048], author: [200], published_at: [50], notes: [20000],
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

  app.get('/topics/:id/timeline', async (c) => {
    try {
      return c.json(await loadTimelineEvents(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/timeline', async (c) => {
    try {
      const body = await c.req.json<Partial<TimelineEvent>>();
      if (!body.topic_id || !body.title?.trim()) return c.json({ error: 'topic_id and title are required' }, 400);
      const textError = validateTextFields(body as Record<string, unknown>, {
        title: [200, true], description: [20000], event_date: [50], contrast_tag: [100],
      });
      if (textError) return c.json({ error: textError }, 400);
      if (body.date_precision !== undefined && !isOneOf(body.date_precision, DATE_PRECISIONS)) return c.json({ error: 'Invalid date precision' }, 400);
      if (body.verification_status !== undefined && !isOneOf(body.verification_status, VERIFICATION_STATUSES)) {
        return c.json({ error: 'Invalid verification status' }, 400);
      }
      if (body.sort_order !== undefined && !isNonNegativeInteger(body.sort_order)) return c.json({ error: 'Invalid sort order' }, 400);
      const now = new Date().toISOString();
      const event: TimelineEvent = {
        id: body.id || createId('time'), topic_id: body.topic_id, title: body.title.trim(),
        description: body.description || '', event_date: body.event_date || '',
        date_precision: body.date_precision || 'exact', verification_status: body.verification_status || 'confirmed',
        sort_order: body.sort_order ?? await getNextTimelineSortOrder(requireDb(c), body.topic_id),
        contrast_tag: body.contrast_tag || '', created_at: body.created_at || now, updated_at: now,
        person_ids: body.person_ids,
      };
      await insertTimelineEvent(requireDb(c), event);
      return c.json(event, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/timeline/:id', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const textError = validateTextFields(body, { title: [200, true], description: [20000], event_date: [50], contrast_tag: [100] });
      if (textError) return c.json({ error: textError }, 400);
      if (hasInvalidValue(body, 'date_precision', (value) => isOneOf(value, DATE_PRECISIONS))) return c.json({ error: 'Invalid date precision' }, 400);
      if (hasInvalidValue(body, 'verification_status', (value) => isOneOf(value, VERIFICATION_STATUSES))) {
        return c.json({ error: 'Invalid verification status' }, 400);
      }
      if (hasInvalidValue(body, 'sort_order', isNonNegativeInteger)) return c.json({ error: 'Invalid sort order' }, 400);
      const event = await updateTimelineEvent(requireDb(c), c.req.param('id'), body);
      return event ? c.json(event) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/timeline/reorder/batch', async (c) => {
    try {
      const { events } = await c.req.json<{ events?: TimelineEvent[] }>();
      if (!Array.isArray(events)) return c.json({ error: 'Events are required' }, 400);
      if (events.length > MAX_BATCH_SIZE) return c.json({ error: `At most ${MAX_BATCH_SIZE} events are allowed` }, 400);
      const updatedAt = await reorderTimelineEvents(requireDb(c), events);
      return c.json({ success: true, updated_at: updatedAt });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/timeline/:id', async (c) => {
    try {
      await deleteTimelineEvent(requireDb(c), c.req.param('id'));
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
