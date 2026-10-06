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
import { QuickDropRepository } from '../repositories/quickDrops';

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
      new QuickDropRepository(c.env.DB).save(item);
      return c.json({ success: true, item, message: '灵感投递成功！已暂存至工作台快投箱' }, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/inbox/quick-drops', async (c) => {
    try {
      return c.json({ items: new QuickDropRepository(c.env.DB).list() });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/inbox/quick-drops/count', async (c) => {
    try {
      return c.json({ count: new QuickDropRepository(c.env.DB).count() });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/inbox/quick-drops/:id', async (c) => {
    try {
      const id = c.req.param('id');
      new QuickDropRepository(c.env.DB).delete(id);
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
