import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type {
  Draft,
  DraftCitation,
  Person,
  PersonRelationship,
  PublishedVideo,
  Source,
  Tag,
  TimelineEvent,
  Topic,
  TopicStatus,
  AppSettings,
} from '../types';
import { isTopicStatus } from '../types';
import {
  loadBootstrap,
  loadTrashedTopics,
  loadTopic,
  loadTopicPage,
  permanentlyDeleteTrashedTopics,
  statements,
  TopicNotInTrashError,
} from './database';
import {
  type ApiBindings,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
  DATE_PRECISIONS,
  PLATFORM_TYPES,
  MAX_BATCH_SIZE,
  MAX_DRAFT_BYTES,
  MAX_QUICK_DROP_REQUEST_BYTES,
  MAX_REQUEST_BYTES,
  createId,
  hasInvalidValue,
  isNonNegativeInteger,
  isOneOf,
  jsonError,
  patchRow,
  requireDb,
  validateTopicFields,
  validateTextFields,
  verifyToken,
  verifyQuickDropCredential,
} from './apiShared';
import { registerSystemRoutes } from './systemRoutes';
import { resolveServerPublicUrl } from '../lib/publicUrl';
import { parseUrlMetadata } from './urlParser';

async function loadTimelineEvents(db: D1Database, topicId: string): Promise<TimelineEvent[]> {
  const [eventResult, personResult] = await db.batch([
    db.prepare('SELECT * FROM timeline_events WHERE topic_id = ? ORDER BY sort_order').bind(topicId),
    db.prepare(`SELECT tep.timeline_event_id, tep.person_id
      FROM timeline_event_people tep
      INNER JOIN timeline_events te ON te.id = tep.timeline_event_id
      WHERE te.topic_id = ?`).bind(topicId),
  ]);
  const personIdsByEvent = new Map<string, string[]>();
  (personResult.results as unknown as Array<{ timeline_event_id: string; person_id: string }>).forEach((row) => {
    personIdsByEvent.set(row.timeline_event_id, [
      ...(personIdsByEvent.get(row.timeline_event_id) || []),
      row.person_id,
    ]);
  });
  return (eventResult.results as unknown as TimelineEvent[]).map((event) => ({
    ...event,
    person_ids: personIdsByEvent.get(event.id) || [],
  }));
}

function replaceTimelinePeopleStatements(
  db: D1Database,
  eventId: string,
  personIds: string[]
): D1PreparedStatement[] {
  return [
    statements.bind(db, 'DELETE FROM timeline_event_people WHERE timeline_event_id = ?', [eventId]),
    ...Array.from(new Set(personIds)).map((personId) => statements.bind(
      db,
      'INSERT INTO timeline_event_people (id, timeline_event_id, person_id) VALUES (?, ?, ?)',
      [`${eventId}:${personId}`, eventId, personId]
    )),
  ];
}

async function loadRelationship(db: D1Database, id: string): Promise<PersonRelationship | null> {
  return db.prepare(`SELECT r.*, a.name AS person_a_name, b.name AS person_b_name
    FROM person_relationships r
    LEFT JOIN people a ON a.id = r.person_a_id
    LEFT JOIN people b ON b.id = r.person_b_id
    WHERE r.id = ?`)
    .bind(id).first<PersonRelationship>();
}

export function createApp() {
  const app = new Hono<{ Bindings: ApiBindings }>().basePath('/api');

  app.use('*', bodyLimit({
    maxSize: MAX_REQUEST_BYTES,
    onError: (c) => c.json({ error: 'Request body is too large' }, 413),
  }));

  app.use('*', async (c, next) => {
    const path = c.req.path;
    if (path === '/api/auth/login' || path === '/auth/login') return next();
    if (path === '/api/health' || path === '/health') return next();
    if (path.startsWith('/api/public/') || path.startsWith('/public/')) return next();
    if (path === '/api/inbox/quick-drop' || path === '/inbox/quick-drop') {
      const dropToken = c.req.header('X-Quick-Drop-Token');
      if (dropToken) {
        const credential = verifyQuickDropCredential(dropToken, c.env.QUICK_DROP_TOKEN);
        if (credential === 'missing_config') return c.json({ error: 'QUICK_DROP_TOKEN is not configured' }, 503);
        if (credential === 'invalid') return c.json({ error: 'Invalid quick drop token' }, 401);
        return next();
      }
    }
    const authorization = c.req.header('Authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const password = c.env.APP_PASSWORD;
    if (!password) return c.json({ error: 'APP_PASSWORD is not configured' }, 503);
    if (!token || !(await verifyToken(token, password))) return c.json({ error: 'Unauthorized' }, 401);
    return next();
  });

  registerSystemRoutes(app);

  app.get('/topics', async (c) => {
    try {
      const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.req.query('page_size') || '50', 10) || 50));
      const scopeValue = c.req.query('scope') || 'all';
      if (!isOneOf(scopeValue, ['active', 'archived', 'trash', 'all'])) return c.json({ error: 'Invalid scope' }, 400);
      const status = c.req.query('status');
      if (status && !isTopicStatus(status)) return c.json({ error: 'Invalid topic status' }, 400);
      const priority = c.req.query('priority');
      if (priority && !isOneOf(priority, ['high', 'medium', 'low', 'none'])) return c.json({ error: 'Invalid priority' }, 400);
      const sortValue = c.req.query('sort') || 'updated_at';
      if (!isOneOf(sortValue, ['title', 'status', 'priority', 'score', 'words', 'updated_at', 'created_at'])) return c.json({ error: 'Invalid sort' }, 400);
      const directionValue = c.req.query('direction') || 'desc';
      if (!isOneOf(directionValue, ['asc', 'desc'])) return c.json({ error: 'Invalid direction' }, 400);
      return c.json(await loadTopicPage(requireDb(c), {
        scope: scopeValue as 'active' | 'archived' | 'trash' | 'all', page, pageSize,
        query: c.req.query('q')?.slice(0, 200), status, priority,
        tagId: c.req.query('tag_id'), personId: c.req.query('person_id'),
        sort: sortValue as 'title' | 'status' | 'priority' | 'score' | 'words' | 'updated_at' | 'created_at',
        direction: directionValue as 'asc' | 'desc',
      }));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/topics/trash', async (c) => {
    try {
      return c.json(await loadTrashedTopics(requireDb(c)));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/topics/:id', async (c) => {
    try {
      const topic = await loadTopic(requireDb(c), c.req.param('id'));
      return topic ? c.json(topic) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/topics/:id/workspace', async (c) => {
    try {
      const db = requireDb(c);
      const topicId = c.req.param('id');
      const [sourcesResult, timeline, draft, citationsResult] = await Promise.all([
        db.prepare('SELECT * FROM sources WHERE topic_id = ? ORDER BY created_at DESC').bind(topicId).all<Source>(),
        loadTimelineEvents(db, topicId),
        db.prepare('SELECT * FROM drafts WHERE topic_id = ?').bind(topicId).first<Draft>(),
        db.prepare('SELECT * FROM draft_citations WHERE topic_id = ? ORDER BY created_at DESC').bind(topicId).all<DraftCitation>(),
      ]);
      return c.json({ sources: sourcesResult.results, timeline, draft: draft || null, citations: citationsResult.results });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/topics', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Partial<Topic>>();
      if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400);
      const validationError = validateTopicFields(body);
      if (validationError) return c.json({ error: validationError }, 400);
      const now = new Date().toISOString();
      const id = body.id || createId('topic');
      const topic = { ...body, id, title: body.title.trim(), created_at: body.created_at || now };
      const batch: D1PreparedStatement[] = [statements.topic(db, topic)];
      body.tags?.forEach((tag) => batch.push(statements.bind(db,
        'INSERT OR IGNORE INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)',
        [`${id}:${tag.id}`, id, tag.id]
      )));
      body.people?.forEach((person) => batch.push(statements.bind(db,
        'INSERT OR IGNORE INTO topic_people (id, topic_id, person_id, role) VALUES (?, ?, ?, ?)',
        [`${id}:${person.id}`, id, person.id, '']
      )));
      await db.batch(batch);
      return c.json(await loadTopic(db, id), 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/topics/:id', async (c) => {
    try {
      const db = requireDb(c);
      const id = c.req.param('id');
      const body = await c.req.json<Partial<Topic>>();
      const validationError = validateTopicFields(body);
      if (validationError) return c.json({ error: validationError }, 400);
      const batch: D1PreparedStatement[] = [];
      const fields = [
        'title', 'summary', 'hook', 'storyline', 'why_now', 'status', 'priority', 'next_action',
        'next_action_updated_at', 'next_action_deferred_until',
        'score_character', 'score_conflict', 'score_contrast', 'score_material', 'score_story',
        'is_pinned', 'sort_order', 'published_at', 'deleted_at',
      ].filter((field) => Object.prototype.hasOwnProperty.call(body, field));
      if (fields.length > 0) {
        const values = fields.map((field) => body[field as keyof Topic]);
        batch.push(statements.bind(db,
          `UPDATE topics SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
          [...values, new Date().toISOString(), id]
        ));
      }
      if (body.tags) {
        batch.push(statements.bind(db, 'DELETE FROM topic_tags WHERE topic_id = ?', [id]));
        body.tags.forEach((tag) => batch.push(statements.bind(db,
          'INSERT OR IGNORE INTO topic_tags (id, topic_id, tag_id) VALUES (?, ?, ?)',
          [`${id}:${tag.id}`, id, tag.id]
        )));
      }
      if (body.people) {
        batch.push(statements.bind(db, 'DELETE FROM topic_people WHERE topic_id = ?', [id]));
        body.people.forEach((person) => batch.push(statements.bind(db,
          'INSERT OR IGNORE INTO topic_people (id, topic_id, person_id, role) VALUES (?, ?, ?, ?)',
          [`${id}:${person.id}`, id, person.id, '']
        )));
      }
      if (batch.length > 0) await db.batch(batch);
      const topic = await loadTopic(db, id);
      return topic ? c.json(topic) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/topics/:id', async (c) => {
    try {
      const db = requireDb(c);
      const id = c.req.param('id');
      await db.prepare('UPDATE topics SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
        .bind(new Date().toISOString(), new Date().toISOString(), id).run();
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/topics/:id/restore', async (c) => {
    try {
      const db = requireDb(c);
      const id = c.req.param('id');
      await db.prepare('UPDATE topics SET deleted_at = NULL, updated_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), id).run();
      const topic = await loadTopic(db, id);
      return topic ? c.json(topic) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/topics/:id/permanent', async (c) => {
    try {
      const db = requireDb(c);
      const id = c.req.param('id');
      await permanentlyDeleteTrashedTopics(db, [id]);
      return c.json({ success: true });
    } catch (error) {
      if (error instanceof TopicNotInTrashError) return c.json({ error: error.message }, 409);
      return jsonError(c, error);
    }
  });

  app.post('/topics/batch/permanent', async (c) => {
    try {
      const db = requireDb(c);
      const { ids } = await c.req.json<{ ids?: string[] }>();
      if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string' || !id.trim())) {
        return c.json({ error: 'ids array is required' }, 400);
      }
      if (ids.length > 200) {
        return c.json({ error: 'Cannot delete more than 200 topics at once' }, 400);
      }

      const uniqueIds = Array.from(new Set(ids));
      if (uniqueIds.length !== ids.length) return c.json({ error: 'Duplicate topic ids are not allowed' }, 400);
      await permanentlyDeleteTrashedTopics(db, uniqueIds);
      return c.json({ success: true, count: uniqueIds.length });
    } catch (error) {
      if (error instanceof TopicNotInTrashError) return c.json({ error: error.message }, 409);
      return jsonError(c, error, 400);
    }
  });

  app.post('/topics/trash/empty', async (c) => {
    try {
      const db = requireDb(c);
      const trashed = await db.prepare('SELECT id FROM topics WHERE deleted_at IS NOT NULL').all<{ id: string }>();
      const ids = trashed.results.map((r) => r.id);
      if (ids.length === 0) {
        return c.json({ success: true, count: 0 });
      }

      await permanentlyDeleteTrashedTopics(db, ids);
      return c.json({ success: true, count: ids.length });
    } catch (error) {
      if (error instanceof TopicNotInTrashError) return c.json({ error: error.message }, 409);
      return jsonError(c, error);
    }
  });

  app.patch('/topics/reorder/batch', async (c) => {
    try {
      const db = requireDb(c);
      const { updates } = await c.req.json<{ updates?: Array<{ id: string; status: TopicStatus; sort_order: number }> }>();
      if (!Array.isArray(updates)) return c.json({ error: 'Updates are required' }, 400);
      if (updates.length > MAX_BATCH_SIZE) return c.json({ error: `At most ${MAX_BATCH_SIZE} updates are allowed` }, 400);
      if (updates.some((update) => !isTopicStatus(update.status))) return c.json({ error: 'Invalid topic status' }, 400);
      if (updates.some((update) => !isNonNegativeInteger(update.sort_order))) return c.json({ error: 'Invalid sort order' }, 400);
      const now = new Date().toISOString();
      if (updates.length > 0) {
        await db.batch(updates.map((update) => statements.bind(db,
          'UPDATE topics SET status = ?, sort_order = ?, updated_at = ? WHERE id = ?',
          [update.status, update.sort_order, now, update.id]
        )));
      }
      return c.json({ success: true, updated_at: now });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/topics/:id/sources', async (c) => {
    try {
      const result = await requireDb(c).prepare('SELECT * FROM sources WHERE topic_id = ? ORDER BY created_at DESC')
        .bind(c.req.param('id')).all<Source>();
      return c.json(result.results);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/sources', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Partial<Source>>();
      if (!body.topic_id || !body.title?.trim()) return c.json({ error: 'topic_id and title are required' }, 400);
      const textError = validateTextFields(body as Record<string, unknown>, {
        title: [200, true], content: [20000], url: [2048], author: [200], published_at: [50], notes: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
      if (body.type !== undefined && !isOneOf(body.type, SOURCE_TYPES)) return c.json({ error: 'Invalid source type' }, 400);
      if (body.platform !== undefined && !isOneOf(body.platform, PLATFORM_TYPES)) return c.json({ error: 'Invalid source platform' }, 400);
      if (body.verification_status !== undefined && !isOneOf(body.verification_status, VERIFICATION_STATUSES)) {
        return c.json({ error: 'Invalid verification status' }, 400);
      }
      const now = new Date().toISOString();
      const source: Source = {
        id: body.id || createId('src'), topic_id: body.topic_id, title: body.title.trim(),
        type: body.type || 'fact', content: body.content || '', url: body.url || '',
        platform: body.platform || 'bilibili', author: body.author || '', published_at: body.published_at || '',
        verification_status: body.verification_status || 'unverified', notes: body.notes || '',
        created_at: body.created_at || now, updated_at: now,
      };
      await statements.source(db, source).run();
      return c.json(source, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/sources/:id', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Record<string, unknown>>();
      const textError = validateTextFields(body, {
        title: [200, true], content: [20000], url: [2048], author: [200], published_at: [50], notes: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
      if (hasInvalidValue(body, 'type', (value) => isOneOf(value, SOURCE_TYPES))) return c.json({ error: 'Invalid source type' }, 400);
      if (hasInvalidValue(body, 'platform', (value) => isOneOf(value, PLATFORM_TYPES))) return c.json({ error: 'Invalid source platform' }, 400);
      if (hasInvalidValue(body, 'verification_status', (value) => isOneOf(value, VERIFICATION_STATUSES))) {
        return c.json({ error: 'Invalid verification status' }, 400);
      }
      await patchRow(db, 'sources', c.req.param('id'), body,
        ['title', 'type', 'content', 'url', 'platform', 'author', 'published_at', 'verification_status', 'notes']);
      const row = await db.prepare('SELECT * FROM sources WHERE id = ?').bind(c.req.param('id')).first<Source>();
      return row ? c.json(row) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/sources/:id', async (c) => {
    await requireDb(c).prepare('DELETE FROM sources WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ success: true });
  });

  app.get('/sources/parse-url', async (c) => {
    try {
      const urlQuery = c.req.query('url');
      if (!urlQuery?.trim()) {
        return c.json({ error: 'url parameter is required' }, 400);
      }
      const parsed = await parseUrlMetadata(urlQuery.trim());
      return c.json({ success: true, data: parsed });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/topics/:id/timeline', async (c) => {
    return c.json(await loadTimelineEvents(requireDb(c), c.req.param('id')));
  });

  app.post('/timeline', async (c) => {
    try {
      const db = requireDb(c);
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
      const max = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM timeline_events WHERE topic_id = ?')
        .bind(body.topic_id).first<{ value: number }>();
      const event: TimelineEvent = {
        id: body.id || createId('time'), topic_id: body.topic_id, title: body.title.trim(),
        description: body.description || '', event_date: body.event_date || '',
        date_precision: body.date_precision || 'exact', verification_status: body.verification_status || 'confirmed',
        sort_order: body.sort_order ?? ((max?.value || 0) + 1),
        contrast_tag: body.contrast_tag || '',
        created_at: body.created_at || now, updated_at: now,
        person_ids: body.person_ids,
      };
      await db.batch([
        statements.timeline(db, event),
        ...replaceTimelinePeopleStatements(db, event.id, event.person_ids || []),
      ]);
      return c.json(event, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/timeline/:id', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Record<string, unknown>>();
      const textError = validateTextFields(body, { title: [200, true], description: [20000], event_date: [50], contrast_tag: [100] });
      if (textError) return c.json({ error: textError }, 400);
      if (hasInvalidValue(body, 'date_precision', (value) => isOneOf(value, DATE_PRECISIONS))) return c.json({ error: 'Invalid date precision' }, 400);
      if (hasInvalidValue(body, 'verification_status', (value) => isOneOf(value, VERIFICATION_STATUSES))) {
        return c.json({ error: 'Invalid verification status' }, 400);
      }
      if (hasInvalidValue(body, 'sort_order', isNonNegativeInteger)) return c.json({ error: 'Invalid sort order' }, 400);
      const id = c.req.param('id');
      await patchRow(db, 'timeline_events', id, body,
        ['title', 'description', 'event_date', 'date_precision', 'verification_status', 'sort_order', 'contrast_tag']);
      if (Array.isArray(body.person_ids)) {
        await db.batch(replaceTimelinePeopleStatements(
          db,
          id,
          body.person_ids.filter((value): value is string => typeof value === 'string')
        ));
      }
      const row = await db.prepare('SELECT topic_id FROM timeline_events WHERE id = ?').bind(id).first<{ topic_id: string }>();
      if (!row) return c.json({ error: 'Not found' }, 404);
      const saved = (await loadTimelineEvents(db, row.topic_id)).find((event) => event.id === id);
      return saved ? c.json(saved) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/timeline/reorder/batch', async (c) => {
    try {
      const db = requireDb(c);
      const { events } = await c.req.json<{ events?: TimelineEvent[] }>();
      if (!Array.isArray(events)) return c.json({ error: 'Events are required' }, 400);
      if (events.length > MAX_BATCH_SIZE) return c.json({ error: `At most ${MAX_BATCH_SIZE} events are allowed` }, 400);
      const now = new Date().toISOString();
      if (events.length > 0) {
        await db.batch(events.map((event, index) => statements.bind(db,
          'UPDATE timeline_events SET sort_order = ?, updated_at = ? WHERE id = ?', [index + 1, now, event.id]
        )));
      }
      return c.json({ success: true, updated_at: now });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/timeline/:id', async (c) => {
    await requireDb(c).prepare('DELETE FROM timeline_events WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ success: true });
  });

  app.get('/people', async (c) => c.json((await loadBootstrap(requireDb(c))).people));

  app.post('/people', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Partial<Person>>();
      if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
      const textError = validateTextFields(body as Record<string, unknown>, {
        name: [200, true], aliases: [2000], avatar_url: [2048], description: [20000], identity: [2000],
        platform_accounts: [2000], quotes: [20000], notes: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
      const now = new Date().toISOString();
      const person: Person = {
        id: body.id || createId('person'), name: body.name.trim(), aliases: body.aliases || '',
        avatar_url: body.avatar_url || '', description: body.description || '', identity: body.identity || '',
        platform_accounts: body.platform_accounts || '', quotes: body.quotes || '', notes: body.notes || '',
        created_at: body.created_at || now, updated_at: now,
      };
      await statements.person(db, person).run();
      return c.json(person, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/people/:id', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Record<string, unknown>>();
      const textError = validateTextFields(body, {
        name: [200, true], aliases: [2000], avatar_url: [2048], description: [20000], identity: [2000],
        platform_accounts: [2000], quotes: [20000], notes: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
      await patchRow(db, 'people', c.req.param('id'), body,
        ['name', 'aliases', 'avatar_url', 'description', 'identity', 'platform_accounts', 'quotes', 'notes']);
      const row = await db.prepare('SELECT * FROM people WHERE id = ?').bind(c.req.param('id')).first<Person>();
      return row ? c.json(row) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/people/:id', async (c) => {
    const db = requireDb(c);
    const id = c.req.param('id');
    await db.batch([
      statements.bind(db, 'DELETE FROM topic_people WHERE person_id = ?', [id]),
      statements.bind(db, 'DELETE FROM person_relationships WHERE person_a_id = ? OR person_b_id = ?', [id, id]),
      statements.bind(db, 'DELETE FROM people WHERE id = ?', [id]),
    ]);
    return c.json({ success: true });
  });

  app.get('/relationships', async (c) => c.json((await loadBootstrap(requireDb(c))).relationships));

  app.post('/relationships', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Partial<PersonRelationship>>();
      if (!body.person_a_id || !body.person_b_id || !body.relationship?.trim()) {
        return c.json({ error: 'Both people and relationship are required' }, 400);
      }
      if (body.person_a_id === body.person_b_id) return c.json({ error: 'A person cannot relate to itself' }, 400);
      const textError = validateTextFields(body as Record<string, unknown>, { relationship: [200, true], description: [20000] });
      if (textError) return c.json({ error: textError }, 400);
      const relationship: PersonRelationship = {
        id: body.id || createId('rel'), person_a_id: body.person_a_id, person_b_id: body.person_b_id,
        relationship: body.relationship.trim(), description: body.description || '',
        created_at: body.created_at || new Date().toISOString(),
      };
      await statements.relationship(db, relationship).run();
      return c.json(await loadRelationship(db, relationship.id), 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/relationships/:id', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Record<string, unknown>>();
      const textError = validateTextFields(body, { relationship: [200, true], description: [20000] });
      if (textError) return c.json({ error: textError }, 400);
      if (body.person_a_id !== undefined && body.person_a_id === body.person_b_id) return c.json({ error: 'A person cannot relate to itself' }, 400);
      await patchRow(db, 'person_relationships', c.req.param('id'), body,
        ['person_a_id', 'person_b_id', 'relationship', 'description'], false);
      const row = await loadRelationship(db, c.req.param('id'));
      return row ? c.json(row) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/relationships/:id', async (c) => {
    await requireDb(c).prepare('DELETE FROM person_relationships WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ success: true });
  });

  app.get('/topics/:id/draft', async (c) => {
    const row = await requireDb(c).prepare('SELECT * FROM drafts WHERE topic_id = ?')
      .bind(c.req.param('id')).first<Draft>();
    return c.json(row || null);
  });

  app.put('/topics/:id/draft', async (c) => {
    try {
      const db = requireDb(c);
      const topicId = c.req.param('id');
      const body = await c.req.json<Partial<Draft> & { base_version?: number }>();
      const draftBytes = new TextEncoder().encode(`${body.content_json || ''}${body.content_html || ''}`).byteLength;
      if (draftBytes > MAX_DRAFT_BYTES) return c.json({ error: 'Draft exceeds 2 MiB' }, 413);
      if (!isNonNegativeInteger(body.word_count ?? 0) || Number(body.word_count || 0) > 200000) {
        return c.json({ error: 'word_count must be an integer from 0 to 200000' }, 400);
      }
      if (body.content_json) {
        try { JSON.parse(body.content_json); } catch { return c.json({ error: 'content_json must be valid JSON' }, 400); }
      }
      const now = new Date().toISOString();
      const existing = await db.prepare('SELECT * FROM drafts WHERE topic_id = ?').bind(topicId).first<Draft>();
      const baseVersion = Number(body.base_version ?? 0);
      if (existing && baseVersion !== existing.version) {
        return c.json({ error: 'DRAFT_CONFLICT', current: existing }, 409);
      }
      if (!existing && baseVersion !== 0) {
        return c.json({ error: 'DRAFT_CONFLICT', current: null }, 409);
      }
      const draft: Draft = {
        id: existing?.id || body.id || createId('draft'), topic_id: topicId, title: body.title || '',
        content_json: body.content_json || '', content_html: body.content_html || '',
        word_count: body.word_count || 0, version: existing ? existing.version + 1 : 1, updated_at: now,
      };
      const result = existing
        ? await db.prepare(`UPDATE drafts SET title = ?, content_json = ?, content_html = ?, word_count = ?,
            version = version + 1, updated_at = ? WHERE topic_id = ? AND version = ?`)
          .bind(draft.title, draft.content_json, draft.content_html, draft.word_count,
            draft.updated_at, topicId, baseVersion).run()
        : await db.prepare(`INSERT INTO drafts
            (id, topic_id, title, content_json, content_html, word_count, version, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(topic_id) DO NOTHING`)
          .bind(draft.id, draft.topic_id, draft.title, draft.content_json, draft.content_html,
            draft.word_count, draft.updated_at).run();
      if ((result.meta.changes || 0) === 0) {
        const current = await db.prepare('SELECT * FROM drafts WHERE topic_id = ?').bind(topicId).first<Draft>();
        return c.json({ error: 'DRAFT_CONFLICT', current: current || null }, 409);
      }
      return c.json(draft);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/topics/:id/citations', async (c) => {
    const result = await requireDb(c).prepare(
      'SELECT * FROM draft_citations WHERE topic_id = ? ORDER BY created_at DESC'
    ).bind(c.req.param('id')).all<DraftCitation>();
    return c.json(result.results);
  });

  app.post('/topics/:id/citations', async (c) => {
    try {
      const db = requireDb(c);
      const topicId = c.req.param('id');
      const body = await c.req.json<Partial<DraftCitation>>();
      if (!body.reference_type || !body.reference_id || !body.reference_title) {
        return c.json({ error: 'Citation reference is required' }, 400);
      }
      const textError = validateTextFields(body as Record<string, unknown>, {
        reference_id: [200, true], reference_title: [200, true], reference_snapshot: [20000], quoted_text: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
      if (!isOneOf(body.reference_type, ['source', 'timeline', 'person', 'outline'])) {
        return c.json({ error: 'Invalid citation reference type' }, 400);
      }
      if (body.verification_status !== undefined && !isOneOf(body.verification_status, VERIFICATION_STATUSES)) {
        return c.json({ error: 'Invalid verification status' }, 400);
      }
      const citation: DraftCitation = {
        id: body.id || createId('cite'),
        topic_id: topicId,
        reference_type: body.reference_type,
        reference_id: body.reference_id,
        reference_title: body.reference_title,
        reference_snapshot: body.reference_snapshot || '',
        quoted_text: body.quoted_text || '',
        verification_status: body.verification_status || 'unverified',
        created_at: body.created_at || new Date().toISOString(),
      };
      await statements.citation(db, citation).run();
      return c.json(citation, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.put('/topics/:id/citations/active', async (c) => {
    try {
      const { active_ids: activeIds } = await c.req.json<{ active_ids?: unknown }>();
      if (!Array.isArray(activeIds) || activeIds.length > 500 || activeIds.some((id) => typeof id !== 'string')) {
        return c.json({ error: 'active_ids must be an array of citation IDs' }, 400);
      }
      return c.json({ success: true, count: activeIds.length });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/citations/:id', async (c) => {
    await requireDb(c).prepare('DELETE FROM draft_citations WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ success: true });
  });

  app.get('/tags', async (c) => c.json((await loadBootstrap(requireDb(c))).tags));

  app.post('/tags', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<{ name?: string; color?: string }>();
      if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
      if (body.name.trim().length > 40) return c.json({ error: 'Name exceeds 40 characters' }, 400);
      const existing = await db.prepare('SELECT id, name, color FROM tags WHERE name = ? COLLATE NOCASE')
        .bind(body.name.trim()).first<{ id: string; name: string; color: string }>();
      if (existing) return c.json(existing);
      const tag = { id: createId('tag'), name: body.name.trim(), color: body.color || 'stone' };
      await db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)')
        .bind(tag.id, tag.name, tag.color, new Date().toISOString()).run();
      return c.json(tag, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/tags/:id', async (c) => {
    try {
      const db = requireDb(c);
      const id = c.req.param('id');
      const body = await c.req.json<{ name?: string; color?: string }>();
      const name = body.name?.trim();
      if (!name) return c.json({ error: 'Name is required' }, 400);
      if (name.length > 40) return c.json({ error: 'Name exceeds 40 characters' }, 400);
      const duplicate = await db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?')
        .bind(name, id).first<{ id: string }>();
      if (duplicate) return c.json({ error: 'Tag name already exists' }, 409);
      await db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?')
        .bind(name, body.color || 'stone', id).run();
      const tag = await db.prepare('SELECT id, name, color FROM tags WHERE id = ?').bind(id).first<Tag>();
      return tag ? c.json(tag) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/tags/:id', async (c) => {
    const db = requireDb(c);
    const id = c.req.param('id');
    await db.batch([
      statements.bind(db, 'DELETE FROM topic_tags WHERE tag_id = ?', [id]),
      statements.bind(db, 'DELETE FROM tags WHERE id = ?', [id]),
    ]);
    return c.json({ success: true });
  });

  app.get('/published', async (c) => c.json((await loadBootstrap(requireDb(c))).published));

  app.post('/published', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Partial<PublishedVideo>>();
      if (!body.title?.trim()) return c.json({ error: 'title is required' }, 400);
      if (body.topic_id !== undefined && body.topic_id !== null && typeof body.topic_id !== 'string') {
        return c.json({ error: 'topic_id must be a string or null' }, 400);
      }
      const textError = validateTextFields(body as Record<string, unknown>, {
        title: [200, true], url: [2048], bvid: [20], published_at: [50], notes: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
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
      await statements.published(db, video).run();
      return c.json(video, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/published/:id', async (c) => {
    try {
      const db = requireDb(c);
      const body = await c.req.json<Record<string, unknown>>();
      if (Object.prototype.hasOwnProperty.call(body, 'topic_id')) {
        if (body.topic_id !== null && typeof body.topic_id !== 'string') {
          return c.json({ error: 'topic_id must be a string or null' }, 400);
        }
        body.topic_id = typeof body.topic_id === 'string' && body.topic_id.trim() ? body.topic_id.trim() : null;
      }
      const textError = validateTextFields(body, { title: [200, true], url: [2048], bvid: [20], published_at: [50], notes: [20000] });
      if (textError) return c.json({ error: textError }, 400);
      if (typeof body.bvid === 'string' && body.bvid && !/^BV[a-zA-Z0-9]{10}$/i.test(body.bvid)) return c.json({ error: 'Invalid BVID' }, 400);
      for (const field of ['views', 'likes', 'coins', 'favorites', 'comments']) {
        if (hasInvalidValue(body, field, isNonNegativeInteger)) {
          return c.json({ error: `${field} must be a non-negative integer` }, 400);
        }
      }
      await patchRow(db, 'published_videos', c.req.param('id'), body,
        ['topic_id', 'title', 'url', 'bvid', 'published_at', 'views', 'likes', 'coins', 'favorites', 'comments', 'notes']);
      const row = await db.prepare('SELECT * FROM published_videos WHERE id = ?').bind(c.req.param('id')).first<PublishedVideo>();
      return row ? c.json(row) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/published/:id', async (c) => {
    await requireDb(c).prepare('DELETE FROM published_videos WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ success: true });
  });

  /* =========================================================================
     KV Feature 1: Public Review Share (审稿分享快照)
     ========================================================================= */

  // 1. 获取公开审稿只读快照 (免鉴权)
  app.get('/public/share/:token', async (c) => {
    try {
      const kv = c.env.KV;
      if (!kv) return c.json({ error: 'KV is not configured' }, 503);
      const token = c.req.param('token');
      const data = await kv.get(`share:${token}`, 'json');
      if (!data) return c.json({ error: '审稿链接已过期或不存在' }, 404);
      return c.json(data);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  // 2. 创建审稿分享链接 (需鉴权)
  app.post('/topics/:id/share', async (c) => {
    try {
      const kv = c.env.KV;
      if (!kv) return c.json({ error: 'KV is not configured' }, 503);
      const db = requireDb(c);
      const id = c.req.param('id');
      const body = await c.req.json<{ ttl_seconds?: number }>().catch(() => ({ ttl_seconds: 86400 * 3 }));
      const ttl = Math.min(2592000, Math.max(300, Number(body.ttl_seconds) || 86400 * 3));
      const topic = await loadTopic(db, id);
      if (!topic) return c.json({ error: 'Topic not found' }, 404);
      const draft = await db.prepare('SELECT * FROM drafts WHERE topic_id = ?').bind(id).first<Draft>();
      const settings = await kv.get<AppSettings>('app_settings', 'json');
      const readingSpeed = settings?.reading_speed || 280;
      const reviewerBranding = settings?.reviewer_branding || '';
      const publicBaseUrl = settings?.public_base_url || c.env.PUBLIC_BASE_URL;

      const token = createId('rv');
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

      const snapshot = {
        token,
        topic_id: topic.id,
        topic_title: topic.title,
        hook: topic.hook,
        summary: topic.summary,
        storyline: topic.storyline,
        content_html: draft?.content_html || '<p>暂无文案内容</p>',
        word_count: draft?.word_count || 0,
        reading_speed: readingSpeed,
        reviewer_branding: reviewerBranding,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
      };

      await kv.put(`share:${token}`, JSON.stringify(snapshot), { expirationTtl: ttl });
      await kv.put(`topic_share:${id}`, token, { expirationTtl: ttl });

      const fullUrl = resolveServerPublicUrl(`/share/${token}`, {
        configuredUrl: publicBaseUrl,
        forwardedProto: c.req.header('x-forwarded-proto'),
        forwardedHost: c.req.header('x-forwarded-host'),
        host: c.req.header('host'),
      });

      return c.json({ success: true, token, url: `/share/${token}`, full_url: fullUrl, expires_at: expiresAt, snapshot });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  // 3. 销毁审稿分享链接 (需鉴权)
  app.delete('/topics/:id/share/:token', async (c) => {
    try {
      const kv = c.env.KV;
      if (!kv) return c.json({ error: 'KV is not configured' }, 503);
      const token = c.req.param('token');
      const id = c.req.param('id');
      await kv.delete(`share:${token}`);
      await kv.delete(`topic_share:${id}`);
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  /* =========================================================================
     KV Feature 2: Soft Presence & Edit Lock (多端编辑在线感知)
     ========================================================================= */

  // 1. 上报心跳并返回冲突感知 (需鉴权)
  app.post('/topics/:id/presence', async (c) => {
    try {
      const kv = c.env.KV;
      if (!kv) return c.json({ is_locked: false });
      const topicId = c.req.param('id');
      const body = await c.req.json<{ client_id: string; device_name?: string }>();
      const clientId = body.client_id || 'unknown';
      const deviceName = body.device_name || '其他设备';
      const now = new Date().toISOString();

      const currentLock = await kv.get<{ client_id: string; device_name: string; updated_at: string }>(`lock:${topicId}`, 'json');
      const isLockedByOther = !!currentLock && currentLock.client_id !== clientId;

      // Only refresh our own lease. A live editor must not be overwritten by
      // another browser merely because it sent a later heartbeat.
      if (!isLockedByOther) {
        await kv.put(`lock:${topicId}`, JSON.stringify({
          client_id: clientId,
          device_name: deviceName,
          updated_at: now,
        }), { expirationTtl: 30 });
      }

      return c.json({
        is_locked: isLockedByOther,
        active_editor: isLockedByOther ? currentLock : undefined,
      });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  // 2. 主动释放编辑锁 (需鉴权)
  app.delete('/topics/:id/presence', async (c) => {
    try {
      const kv = c.env.KV;
      if (!kv) return c.json({ success: true });
      const topicId = c.req.param('id');
      const clientId = c.req.query('client_id');
      const currentLock = await kv.get<{ client_id: string }>(`lock:${topicId}`, 'json');
      if (!currentLock || !clientId || currentLock.client_id === clientId) {
        await kv.delete(`lock:${topicId}`);
      }
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  /* =========================================================================
     KV Feature 3: Quick Drop Ingestion (手机/快捷指令碎片灵感快投箱)
     ========================================================================= */

  // 1. 投递碎片灵感 (支持 X-Quick-Drop-Token 或 Bearer 鉴权)
  app.post('/inbox/quick-drop', bodyLimit({
    maxSize: MAX_QUICK_DROP_REQUEST_BYTES,
    onError: (c) => c.json({ error: 'Quick drop request body is too large' }, 413),
  }), async (c) => {
    try {
      const kv = c.env.KV;
      if (!kv) return c.json({ error: 'KV is not configured' }, 503);
      let rawContent = '';
      let rawUrl: string | undefined = undefined;
      let rawSource = '手机快捷投递';

      try {
        const body = await c.req.json<{ content?: string; text?: string; url?: string; source?: string }>();
        rawContent = (body.content || body.text || '').trim();
        rawUrl = body.url?.trim() || undefined;
        rawSource = body.source?.trim() || rawSource;
      } catch {
        const text = await c.req.text().catch(() => '');
        rawContent = text.trim();
      }

      if (!rawContent && !rawUrl) {
        return c.json({ error: '内容或链接不能为空' }, 400);
      }
      const id = createId('drop');
      const now = new Date().toISOString();
      const item = {
        id,
        content: rawContent || rawUrl || '',
        url: rawUrl,
        source: rawSource,
        created_at: now,
      };

      await kv.put(`drop:${id}`, JSON.stringify(item), { expirationTtl: 86400 * 7 });

      const listIndex = (await kv.get<string[]>('quick_drops_index', 'json')) || [];
      const updatedIndex = [id, ...listIndex.filter((itemKey) => itemKey !== id)].slice(0, 100);
      await kv.put('quick_drops_index', JSON.stringify(updatedIndex), { expirationTtl: 86400 * 30 });

      return c.json({ success: true, item, message: '灵感投递成功！已暂存至工作台快投箱' }, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  // 2. 获取未处理快投灵感列表 (需鉴权)
  app.get('/inbox/quick-drops', async (c) => {
    try {
      const kv = c.env.KV;
      if (!kv) return c.json({ items: [] });
      const listIndex = (await kv.get<string[]>('quick_drops_index', 'json')) || [];
      const items: Array<{ id: string; content: string; url?: string; source?: string; created_at: string }> = [];
      const validIds: string[] = [];

      await Promise.all(listIndex.map(async (id) => {
        const drop = await kv.get<{ id: string; content: string; url?: string; source?: string; created_at: string }>(`drop:${id}`, 'json');
        if (drop) {
          items.push(drop);
          validIds.push(id);
        }
      }));

      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (validIds.length !== listIndex.length) {
        await kv.put('quick_drops_index', JSON.stringify(validIds), { expirationTtl: 86400 * 30 });
      }

      return c.json({ items });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  // 3. 删除/采纳完成快投灵感 (需鉴权)
  app.delete('/inbox/quick-drops/:id', async (c) => {
    try {
      const kv = c.env.KV;
      if (!kv) return c.json({ success: true });
      const id = c.req.param('id');
      await kv.delete(`drop:${id}`);
      const listIndex = (await kv.get<string[]>('quick_drops_index', 'json')) || [];
      const updatedIndex = listIndex.filter((itemKey) => itemKey !== id);
      await kv.put('quick_drops_index', JSON.stringify(updatedIndex), { expirationTtl: 86400 * 30 });
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  return app;
}
