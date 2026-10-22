import type { NativeApp } from '../native';
import type { Source } from '../../types';
import {
  createId,
  jsonError,
  jsonValidationError,
  requireDb,
} from '../apiShared';
import {
  parseWithZod,
  sourceReorderBatchSchema,
  sourceCreateSchema,
  sourceUpdateSchema,
} from '../schemas';
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
      const parsed = parseWithZod(sourceCreateSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);
      const now = new Date().toISOString();
      const source: Source = {
        id: parsed.data.id || createId('src'),
        topic_id: parsed.data.topic_id,
        title: parsed.data.title.trim(),
        content: parsed.data.content || '',
        url: parsed.data.url || '',
        platform: parsed.data.platform || 'bilibili',
        author: parsed.data.author || '',
        published_at: parsed.data.published_at || '',
        verification_status: parsed.data.verification_status || 'unverified',
        notes: parsed.data.notes || '',
        event_date: parsed.data.event_date ?? '',
        date_precision: parsed.data.date_precision || 'exact',
        sort_order: typeof parsed.data.sort_order === 'number' ? parsed.data.sort_order : 0,
        created_at: parsed.data.created_at || now,
        updated_at: now,
      };
      await insertSource(requireDb(c), source);
      return c.json(source, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.patch('/sources/reorder/batch', async (c) => {
    try {
      const parsed = parseWithZod(sourceReorderBatchSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);
      const updated_at = await reorderSources(requireDb(c), parsed.data.sources);
      return c.json({ success: true, updated_at });
    } catch (error) {
      if (error instanceof SourceReorderInvalidStateError) return c.json({ error: error.message }, 400);
      return jsonError(c, error);
    }
  });

  app.patch('/sources/:id', async (c) => {
    try {
      const parsed = parseWithZod(sourceUpdateSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);
      const source = await updateSource(requireDb(c), c.req.param('id'), parsed.data);
      return source ? c.json(source) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error);
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
