import type { NativeApp } from '../native';
import type { Tag } from '../../types';
import { createId, jsonError, requireDb } from '../apiShared';
import { deleteTag, insertTag, listTags, loadBootstrap, loadTagsPage, updateTag } from '../repositories';

export function registerTagRoutes(app: NativeApp): void {
  app.get('/tags', async (c) => {
    try {
      const data = await loadBootstrap(requireDb(c), undefined, {
        includeTopics: false, includePeople: false, includeRelationships: false, includePublished: false, includeTags: true,
      });
      return c.json(data.tags);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/tags/page', async (c) => {
    try {
      const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.req.query('page_size') || '30', 10) || 30));
      return c.json(await loadTagsPage(requireDb(c), {
        page,
        pageSize,
        query: c.req.query('q')?.slice(0, 200),
      }));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/tags', async (c) => {
    try {
      const body = await c.req.json<{ name?: string; color?: string }>();
      if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
      if (body.name.trim().length > 40) return c.json({ error: 'Name exceeds 40 characters' }, 400);
      const tag: Tag = { id: createId('tag'), name: body.name.trim(), color: body.color || 'stone' };
      const existing = await insertTag(requireDb(c), tag);
      return existing ? c.json(existing) : c.json(tag, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/tags/:id', async (c) => {
    try {
      const body = await c.req.json<{ name?: string; color?: string }>();
      const name = body.name?.trim();
      if (!name) return c.json({ error: 'Name is required' }, 400);
      if (name.length > 40) return c.json({ error: 'Name exceeds 40 characters' }, 400);
      const result = await updateTag(requireDb(c), c.req.param('id'), { name, color: body.color || 'stone' });
      if (result === 'duplicate') return c.json({ error: 'Tag name already exists' }, 409);
      return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/tags/:id', async (c) => {
    try {
      await deleteTag(requireDb(c), c.req.param('id'));
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
