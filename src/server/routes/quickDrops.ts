import type { NativeApp, NativeMiddleware } from '../native';
import { bodyLimit } from '../native';
import type { QuickDropItem } from '../../types';
import {
  MAX_QUICK_DROP_REQUEST_BYTES,
  createId,
  jsonError,
} from '../apiShared';
import { isSafeExternalHttpUrl } from '../../lib/urlSafety';
import { normalizeQuickDropUrl } from '../../lib/quickDrop';

const QUICK_DROP_RATE_WINDOW_MS = 60_000;
const QUICK_DROP_RATE_LIMIT = 120;
const QUICK_DROP_RATE_MAX_ENTRIES = 10_000;
const quickDropRate = new Map<string, { count: number; resetAt: number }>();

const quickDropRateLimit: NativeMiddleware = async (c, next) => {
  const now = Date.now();
  for (const [key, value] of quickDropRate) {
    if (value.resetAt <= now) quickDropRate.delete(key);
  }
  while (quickDropRate.size >= QUICK_DROP_RATE_MAX_ENTRIES) {
    const oldestKey = quickDropRate.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    quickDropRate.delete(oldestKey);
  }

  const clientIp = c.env.CLIENT_IP || 'unknown';
  const current = quickDropRate.get(clientIp);
  if (!current || current.resetAt <= now) {
    quickDropRate.set(clientIp, { count: 1, resetAt: now + QUICK_DROP_RATE_WINDOW_MS });
    return next();
  }
  if (current.count >= QUICK_DROP_RATE_LIMIT) {
    c.header('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
    return c.json({ error: '快投请求过于频繁，请稍后再试' }, 429);
  }
  current.count += 1;
  return next();
};

export function registerQuickDropRoutes(app: NativeApp): void {
  app.post('/inbox/quick-drop', quickDropRateLimit, bodyLimit({
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
      await c.env.KV.putQuickDrop(id, JSON.stringify(item), 86400 * 7);
      return c.json({ success: true, item, message: '灵感投递成功！已暂存至工作台快投箱' }, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/inbox/quick-drops', async (c) => {
    try {
      const rawListIndex = (await c.env.KV.get<unknown>('quick_drops_index', 'json')) || [];
      const listIndex = Array.from(new Set(
        (Array.isArray(rawListIndex) ? rawListIndex : []).filter((id): id is string => typeof id === 'string' && id.length > 0)
      )).slice(0, 100);
      if (!Array.isArray(rawListIndex) || listIndex.length !== rawListIndex.length) {
        await c.env.KV.updateQuickDropsIndex(() => listIndex);
      }
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
      const validIdSet = new Set(validIds);
      const orderedValidIds = listIndex.filter((id) => validIdSet.has(id));
      if (orderedValidIds.length !== listIndex.length) {
        const staleIds = new Set(listIndex.filter((id) => !validIdSet.has(id)));
        await c.env.KV.updateQuickDropsIndex((current) => current.filter((id) => !staleIds.has(id)));
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
      await c.env.KV.updateQuickDropsIndex((listIndex) => listIndex.filter((itemKey) => itemKey !== id));
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
