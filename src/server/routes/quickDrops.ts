import type { NativeApp } from '../native';
import { bodyLimit } from '../native';
import type { QuickDropItem } from '../../types';
import {
  MAX_QUICK_DROP_REQUEST_BYTES,
  createId,
  jsonError,
} from '../apiShared';
import { isSafeExternalHttpUrl } from '../../lib/urlSafety';
import { normalizeQuickDropUrl } from '../../lib/quickDrop';

export function registerQuickDropRoutes(app: NativeApp): void {
  app.post('/inbox/quick-drop', bodyLimit({
    maxSize: MAX_QUICK_DROP_REQUEST_BYTES,
    onError: (c) => c.json({ error: 'Quick drop request body is too large' }, 413),
  }), async (c) => {
    try {
      let rawContent = '';
      let rawUrl: string | undefined;
      let rawSource = '手机快捷投递';
      try {
        const body = await c.req.json<{ content?: string; text?: string; url?: string; source?: string }>();
        rawContent = typeof body.content === 'string' ? body.content : typeof body.text === 'string' ? body.text : '';
        rawUrl = typeof body.url === 'string' ? body.url : undefined;
        rawSource = typeof body.source === 'string' ? body.source.trim() || rawSource : rawSource;
      } catch {
        rawContent = await c.req.text().catch(() => '');
      }
      const hasContent = rawContent.trim().length > 0;
      const hasUrl = typeof rawUrl === 'string' && rawUrl.trim().length > 0;
      if (!hasContent && !hasUrl) return c.json({ error: '内容或链接不能为空' }, 400);
      const normalizedUrl = hasUrl ? normalizeQuickDropUrl(rawUrl) : undefined;
      if (hasUrl && (!normalizedUrl || !isSafeExternalHttpUrl(normalizedUrl))) return c.json({ error: 'url must be an http(s) URL' }, 400);
      const id = createId('drop');
      const item: QuickDropItem = {
        id,
        content: rawContent,
        url: normalizedUrl,
        source: rawSource,
        created_at: new Date().toISOString(),
      };
      await c.env.KV.put(`drop:${id}`, JSON.stringify(item), { expirationTtl: 86400 * 7 });
      const listIndex = (await c.env.KV.get<string[]>('quick_drops_index', 'json')) || [];
      const updatedIndex = [id, ...listIndex.filter((itemKey) => itemKey !== id)].slice(0, 100);
      await c.env.KV.put('quick_drops_index', JSON.stringify(updatedIndex), { expirationTtl: 86400 * 30 });
      return c.json({ success: true, item, message: '灵感投递成功！已暂存至工作台快投箱' }, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/inbox/quick-drops', async (c) => {
    try {
      const listIndex = (await c.env.KV.get<string[]>('quick_drops_index', 'json')) || [];
      const items: QuickDropItem[] = [];
      const validIds: string[] = [];
      await Promise.all(listIndex.map(async (id) => {
        const drop = await c.env.KV.get<QuickDropItem>(`drop:${id}`, 'json');
        if (drop) {
          items.push(drop);
          validIds.push(id);
        }
      }));
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (validIds.length !== listIndex.length) {
        await c.env.KV.put('quick_drops_index', JSON.stringify(validIds), { expirationTtl: 86400 * 30 });
      }
      return c.json({ items });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/inbox/quick-drops/:id', async (c) => {
    try {
      const id = c.req.param('id');
      await c.env.KV.delete(`drop:${id}`);
      const listIndex = (await c.env.KV.get<string[]>('quick_drops_index', 'json')) || [];
      await c.env.KV.put('quick_drops_index', JSON.stringify(listIndex.filter((itemKey) => itemKey !== id)), { expirationTtl: 86400 * 30 });
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
