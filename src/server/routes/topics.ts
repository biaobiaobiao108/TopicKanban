import type { NativeApp } from '../native';
import type { TopicStatus } from '../../types';
import { isTopicStatus } from '../../types';
import {
  MAX_BATCH_SIZE,
  createId,
  isNonNegativeInteger,
  isOneOf,
  jsonError,
  parseTopicCreate,
  parseTopicUpdate,
  requireDb,
} from '../apiShared';
import {
  insertTopic,
  listTrashedTopicIds,
  loadTodayFocus,
  loadActiveTopicCount,
  loadTopic,
  loadTopicPage,
  loadTrashedTopics,
  permanentlyDeleteTrashedTopics,
  reorderTopics,
  restoreTopic,
  setTopicPinned,
  softDeleteTopic,
  TopicNotInTrashError,
  TopicReorderInvalidStateError,
  ensureTopicsInTrash,
  TopicAlreadyExistsError,
  updateTopic,
} from '../repositories';

async function revokeTopicShares(env: { KV: { deleteTopicShares: (topicId: string) => Promise<number> } }, ids: string[]): Promise<void> {
  for (const id of ids) await env.KV.deleteTopicShares(id);
}

export function registerTopicRoutes(app: NativeApp): void {
  app.get('/topics', async (c) => {
    try {
      const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.req.query('page_size') || '50', 10) || 50));
      const scopeValue = c.req.query('scope') || 'all';
      if (!isOneOf(scopeValue, ['active', 'archived', 'trash', 'all'])) return c.json({ error: 'Invalid scope' }, 400);
      const status = c.req.query('status');
      const statuses = status?.split(',').map((value) => value.trim()).filter(Boolean) || [];
      if (statuses.some((value) => !isTopicStatus(value))) return c.json({ error: 'Invalid topic status' }, 400);
      const priority = c.req.query('priority');
      if (priority && !isOneOf(priority, ['high', 'medium', 'low', 'none'])) return c.json({ error: 'Invalid topic priority' }, 400);
      const sortValue = c.req.query('sort') || 'updated_at';
      if (!isOneOf(sortValue, ['title', 'status', 'priority', 'score', 'words', 'updated_at', 'created_at', 'sort_order'])) return c.json({ error: 'Invalid sort' }, 400);
      const directionValue = c.req.query('direction') || 'desc';
      if (!isOneOf(directionValue, ['asc', 'desc'])) return c.json({ error: 'Invalid direction' }, 400);
      const availableForPublishedValue = c.req.query('available_for_published');
      if (availableForPublishedValue && !isOneOf(availableForPublishedValue, ['true', 'false'])) {
        return c.json({ error: 'available_for_published must be true or false' }, 400);
      }
      const publishedVideoId = c.req.query('published_video_id')?.trim().slice(0, 200);
      return c.json(await loadTopicPage(requireDb(c), {
        scope: scopeValue as 'active' | 'archived' | 'trash' | 'all', page, pageSize,
        query: c.req.query('q')?.slice(0, 200), status, priority,
        tagId: c.req.query('tag_id'), personId: c.req.query('person_id'),
        sort: sortValue as 'title' | 'status' | 'priority' | 'score' | 'words' | 'updated_at' | 'created_at' | 'sort_order',
        direction: directionValue as 'asc' | 'desc',
        availableForPublished: availableForPublishedValue === 'true', publishedVideoId,
      }));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/today/focus', async (c) => {
    try {
      return c.json(await loadTodayFocus(requireDb(c)));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/topics/summary', async (c) => {
    try {
      return c.json({ active_count: await loadActiveTopicCount(requireDb(c)) });
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

  app.post('/topics/:id/pin', async (c) => {
    try {
      const body = await c.req.json<{ is_pinned?: unknown }>();
      if (body.is_pinned !== 0 && body.is_pinned !== 1) return c.json({ error: 'is_pinned must be 0 or 1' }, 400);
      return c.json(await setTopicPinned(requireDb(c), c.req.param('id'), body.is_pinned));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/topics', async (c) => {
    try {
      const db = requireDb(c);
      const parsed = parseTopicCreate(await c.req.json<unknown>());
      if (!parsed.success) return c.json({ error: parsed.error }, 400);
      const body = parsed.data;
      if (body.initial_todo) {
        body.initial_todo.title = body.initial_todo.title.trim();
      }
      const now = new Date().toISOString();
      const id = body.id || createId('topic');
      const topic = { ...body, id, title: body.title.trim(), created_at: body.created_at || now };
      await insertTopic(
        db,
        topic,
        body.tags?.map((tag) => tag.id),
        body.people?.map((person) => person.id),
        typeof body.initial_todo?.title === 'string' && body.initial_todo.title.trim()
          ? {
              id: createId('todo'),
              title: body.initial_todo.title.trim(),
            }
          : undefined,
      );
      return c.json(await loadTopic(db, id), 201);
    } catch (error) {
      if (error instanceof TopicAlreadyExistsError) return c.json({ error: error.message }, 409);
      return jsonError(c, error, 400);
    }
  });

  app.patch('/topics/:id', async (c) => {
    try {
      const db = requireDb(c);
      const id = c.req.param('id');
      const parsed = parseTopicUpdate(await c.req.json<unknown>());
      if (!parsed.success) return c.json({ error: parsed.error }, 400);
      await updateTopic(db, id, parsed.data);
      const topic = await loadTopic(db, id);
      return topic ? c.json(topic) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/topics/:id', async (c) => {
    try {
      const topicId = c.req.param('id');
      // 先撤销外部快照，确保删除失败时不会留下仍可访问的审稿链接。
      await revokeTopicShares(c.env, [topicId]);
      await softDeleteTopic(requireDb(c), topicId);
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/topics/:id/restore', async (c) => {
    try {
      const db = requireDb(c);
      const id = c.req.param('id');
      await restoreTopic(db, id);
      const topic = await loadTopic(db, id);
      return topic ? c.json(topic) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/topics/:id/permanent', async (c) => {
    try {
      const db = requireDb(c);
      const topicId = c.req.param('id');
      await ensureTopicsInTrash(db, [topicId]);
      await revokeTopicShares(c.env, [topicId]);
      await permanentlyDeleteTrashedTopics(db, [topicId]);
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
      if (ids.length > 200) return c.json({ error: 'Cannot delete more than 200 topics at once' }, 400);
      const uniqueIds = Array.from(new Set(ids));
      if (uniqueIds.length !== ids.length) return c.json({ error: 'Duplicate topic ids are not allowed' }, 400);
      await ensureTopicsInTrash(db, uniqueIds);
      await revokeTopicShares(c.env, uniqueIds);
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
      const ids = await listTrashedTopicIds(db);
      if (ids.length === 0) return c.json({ success: true, count: 0, ids: [] });
      await revokeTopicShares(c.env, ids);
      await permanentlyDeleteTrashedTopics(db, ids);
      return c.json({ success: true, count: ids.length, ids });
    } catch (error) {
      if (error instanceof TopicNotInTrashError) return c.json({ error: error.message }, 409);
      return jsonError(c, error);
    }
  });

  app.patch('/topics/reorder/batch', async (c) => {
    try {
      const { updates } = await c.req.json<{ updates?: unknown }>();
      if (!Array.isArray(updates)) return c.json({ error: 'Updates are required' }, 400);
      if (updates.length > MAX_BATCH_SIZE) return c.json({ error: `At most ${MAX_BATCH_SIZE} updates are allowed` }, 400);
      if (updates.some((update) => !update || typeof update !== 'object')) return c.json({ error: 'Invalid topic update' }, 400);
      const typedUpdates = updates as Array<{ id?: unknown; status?: unknown; sort_order?: unknown }>;
      if (typedUpdates.some((update) => typeof update.id !== 'string' || update.id.trim().length === 0)) {
        return c.json({ error: 'Each topic update requires a non-empty id' }, 400);
      }
      const ids = typedUpdates.map((update) => update.id as string);
      if (new Set(ids).size !== ids.length) return c.json({ error: 'Duplicate topic ids are not allowed' }, 400);
      if (typedUpdates.some((update) => !isTopicStatus(update.status))) return c.json({ error: 'Invalid topic status' }, 400);
      if (typedUpdates.some((update) => !isNonNegativeInteger(update.sort_order))) return c.json({ error: 'Invalid sort order' }, 400);
      const updatedAt = await reorderTopics(requireDb(c), typedUpdates as Array<{ id: string; status: TopicStatus; sort_order: number }>);
      return c.json({ success: true, updated_at: updatedAt });
    } catch (error) {
      if (error instanceof TopicReorderInvalidStateError) return c.json({ error: error.message }, 400);
      return jsonError(c, error, 400);
    }
  });
}
