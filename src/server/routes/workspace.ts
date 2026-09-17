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
  TimelineReorderInvalidStateError,
  insertTimelineEvents,
  updateSource,
  updateTimelineEvent,
} from '../repositories';

function validateTimelineFields(body: Record<string, unknown>): string | null {
  const textError = validateTextFields(body, {
    title: [200, true], description: [20000], event_date: [50], contrast_tag: [100],
  });
  if (textError) return textError;
  if (hasInvalidValue(body, 'date_precision', (value) => isOneOf(value, DATE_PRECISIONS))) {
    return 'Invalid date precision';
  }
  if (hasInvalidValue(body, 'verification_status', (value) => isOneOf(value, VERIFICATION_STATUSES))) {
    return 'Invalid verification status';
  }
  if (hasInvalidValue(body, 'sort_order', isNonNegativeInteger)) return 'Invalid sort order';
  if (hasInvalidValue(body, 'person_ids', (value) => (
    Array.isArray(value)
    && value.length <= MAX_BATCH_SIZE
    && value.every((personId) => typeof personId === 'string' && personId.trim().length > 0)
  ))) {
    return `person_ids must be an array of at most ${MAX_BATCH_SIZE} non-empty IDs`;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

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
      const body = asRecord(await c.req.json<unknown>());
      if (!body) return c.json({ error: 'Invalid timeline event' }, 400);
      if (typeof body.topic_id !== 'string' || !body.topic_id.trim() || typeof body.title !== 'string' || !body.title.trim()) {
        return c.json({ error: 'topic_id and title are required' }, 400);
      }
      const validationError = validateTimelineFields(body);
      if (validationError) return c.json({ error: validationError }, 400);
      const now = new Date().toISOString();
      const event: TimelineEvent = {
        id: typeof body.id === 'string' && body.id ? body.id : createId('time'),
        topic_id: body.topic_id.trim(),
        title: body.title.trim(),
        description: typeof body.description === 'string' ? body.description : '',
        event_date: typeof body.event_date === 'string' ? body.event_date : '',
        date_precision: (body.date_precision as TimelineEvent['date_precision'] | undefined) || 'exact',
        verification_status: (body.verification_status as TimelineEvent['verification_status'] | undefined) || 'confirmed',
        sort_order: typeof body.sort_order === 'number'
          ? body.sort_order
          : await getNextTimelineSortOrder(requireDb(c), body.topic_id.trim()),
        contrast_tag: typeof body.contrast_tag === 'string' ? body.contrast_tag : '',
        created_at: typeof body.created_at === 'string' && body.created_at ? body.created_at : now,
        updated_at: now,
        person_ids: Array.isArray(body.person_ids) ? body.person_ids as string[] : undefined,
      };
      await insertTimelineEvent(requireDb(c), event);
      return c.json(event, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/timeline/batch', async (c) => {
    try {
      const payload = asRecord(await c.req.json<unknown>());
      const rawEvents = payload?.events;
      if (!Array.isArray(rawEvents) || rawEvents.length === 0) return c.json({ error: 'Events are required' }, 400);
      if (rawEvents.length > MAX_BATCH_SIZE) return c.json({ error: `At most ${MAX_BATCH_SIZE} events are allowed` }, 400);

      const bodies: Record<string, unknown>[] = [];
      for (const rawEvent of rawEvents) {
        const body = asRecord(rawEvent);
        if (!body) return c.json({ error: 'Invalid timeline event' }, 400);
        if (typeof body.topic_id !== 'string' || !body.topic_id.trim() || typeof body.title !== 'string' || !body.title.trim()) {
          return c.json({ error: 'Each timeline event requires a topic_id and title' }, 400);
        }
        const validationError = validateTimelineFields(body);
        if (validationError) return c.json({ error: validationError }, 400);
        bodies.push(body);
      }

      const topicId = (bodies[0].topic_id as string).trim();
      if (bodies.some((body) => (body.topic_id as string).trim() !== topicId)) {
        return c.json({ error: 'All timeline events must belong to the same topic' }, 400);
      }

      const db = requireDb(c);
      const firstSortOrder = await getNextTimelineSortOrder(db, topicId);
      const now = new Date().toISOString();
      const events: TimelineEvent[] = bodies.map((body, index) => ({
        id: createId('time'),
        topic_id: topicId,
        title: (body.title as string).trim(),
        description: typeof body.description === 'string' ? body.description : '',
        event_date: typeof body.event_date === 'string' ? body.event_date : '',
        date_precision: (body.date_precision as TimelineEvent['date_precision'] | undefined) || 'exact',
        verification_status: (body.verification_status as TimelineEvent['verification_status'] | undefined) || 'confirmed',
        sort_order: typeof body.sort_order === 'number' ? body.sort_order : firstSortOrder + index,
        contrast_tag: typeof body.contrast_tag === 'string' ? body.contrast_tag : '',
        created_at: typeof body.created_at === 'string' && body.created_at ? body.created_at : now,
        updated_at: now,
        person_ids: Array.isArray(body.person_ids) ? body.person_ids as string[] : undefined,
      }));
      await insertTimelineEvents(db, events);
      return c.json({ events }, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/timeline/:id', async (c) => {
    try {
      const body = asRecord(await c.req.json<unknown>());
      if (!body) return c.json({ error: 'Invalid timeline event' }, 400);
      const validationError = validateTimelineFields(body);
      if (validationError) return c.json({ error: validationError }, 400);
      const event = await updateTimelineEvent(requireDb(c), c.req.param('id'), body);
      return event ? c.json(event) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/timeline/reorder/batch', async (c) => {
    try {
      const { events } = await c.req.json<{ events?: unknown }>();
      if (!Array.isArray(events)) return c.json({ error: 'Events are required' }, 400);
      if (events.length > MAX_BATCH_SIZE) return c.json({ error: `At most ${MAX_BATCH_SIZE} events are allowed` }, 400);
      if (events.some((event) => !event || typeof event !== 'object')) return c.json({ error: 'Invalid timeline event' }, 400);
      const typedEvents = events as Array<{ id?: unknown; topic_id?: unknown }>;
      if (typedEvents.some((event) => typeof event.id !== 'string' || event.id.trim().length === 0)) {
        return c.json({ error: 'Each timeline event requires a non-empty id' }, 400);
      }
      if (typedEvents.some((event) => typeof event.topic_id !== 'string' || event.topic_id.trim().length === 0)) {
        return c.json({ error: 'Each timeline event requires a topic id' }, 400);
      }
      const ids = typedEvents.map((event) => event.id as string);
      if (new Set(ids).size !== ids.length) return c.json({ error: 'Duplicate timeline event ids are not allowed' }, 400);
      const updatedAt = await reorderTimelineEvents(requireDb(c), events as TimelineEvent[]);
      return c.json({ success: true, updated_at: updatedAt });
    } catch (error) {
      if (error instanceof TimelineReorderInvalidStateError) return c.json({ error: error.message }, 400);
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
