import type { NativeApp } from '../native';
import { createShareToken, jsonError, requireDb } from '../apiShared';
import { loadDraft, loadTopic } from '../repositories';
import { resolveServerPublicUrl } from '../../lib/publicUrl';

export function registerSharingRoutes(app: NativeApp): void {
  app.get('/public/share/:token', async (c) => {
    try {
      const data = await c.env.KV.get(`share:${c.req.param('token')}`, 'json');
      if (!data) return c.json({ error: '审稿链接已过期或不存在' }, 404);
      return c.json(data);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/topics/:id/share', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json<{ ttl_seconds?: number }>().catch(() => ({ ttl_seconds: 86400 * 3 }));
      const ttl = Math.min(2592000, Math.max(300, Number(body.ttl_seconds) || 86400 * 3));
      const topic = await loadTopic(requireDb(c), id);
      if (!topic) return c.json({ error: 'Topic not found' }, 404);
      const draft = await loadDraft(requireDb(c), id);
      const settings = await c.env.KV.get<{
        reading_speed?: number;
        reviewer_branding?: string;
        public_base_url?: string;
      }>('app_settings', 'json');
      const readingSpeed = settings?.reading_speed || 280;
      const reviewerBranding = settings?.reviewer_branding || '';
      const publicBaseUrl = settings?.public_base_url || c.env.PUBLIC_BASE_URL;
      const token = createShareToken();
      const createdAt = new Date().toISOString();
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
        created_at: createdAt,
        expires_at: expiresAt,
      };
      await c.env.KV.put(`share:${token}`, JSON.stringify(snapshot), { expirationTtl: ttl });
      await c.env.KV.put(`topic_share:${id}`, token, { expirationTtl: ttl });
      const fullUrl = resolveServerPublicUrl(`/share/${token}`, {
        configuredUrl: publicBaseUrl,
        trustProxyHeaders: c.env.TRUST_PROXY_HEADERS,
        forwardedProto: c.req.header('x-forwarded-proto'),
        forwardedHost: c.req.header('x-forwarded-host'),
        host: c.req.header('host'),
      });
      return c.json({ success: true, token, url: `/share/${token}`, full_url: fullUrl, expires_at: expiresAt, snapshot });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/topics/:id/share/:token', async (c) => {
    try {
      const topicId = c.req.param('id');
      const token = c.req.param('token');
      const snapshot = await c.env.KV.get<{ topic_id?: string }>(`share:${token}`, 'json');
      if (!snapshot) return c.json({ error: 'Share not found' }, 404);
      if (snapshot.topic_id !== topicId) return c.json({ error: 'Share token does not belong to topic' }, 409);
      await c.env.KV.delete(`share:${token}`);
      const currentToken = await c.env.KV.get(`topic_share:${topicId}`, 'text');
      if (currentToken === token) await c.env.KV.delete(`topic_share:${topicId}`);
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/topics/:id/presence', async (c) => {
    try {
      const topicId = c.req.param('id');
      const body = await c.req.json<{ client_id: string; device_name?: string }>();
      const clientId = body.client_id || 'unknown';
      const deviceName = body.device_name || '其他设备';
      const now = new Date().toISOString();
      const currentLock = await c.env.KV.get<{ client_id: string; device_name: string; updated_at: string }>(`lock:${topicId}`, 'json');
      const isLockedByOther = !!currentLock && currentLock.client_id !== clientId;
      if (!isLockedByOther) {
        await c.env.KV.put(`lock:${topicId}`, JSON.stringify({ client_id: clientId, device_name: deviceName, updated_at: now }), { expirationTtl: 30 });
      }
      return c.json({ is_locked: isLockedByOther, active_editor: isLockedByOther ? currentLock : undefined });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/topics/:id/presence', async (c) => {
    try {
      const topicId = c.req.param('id');
      const clientId = c.req.query('client_id');
      const currentLock = await c.env.KV.get<{ client_id: string }>(`lock:${topicId}`, 'json');
      if (!currentLock || !clientId || currentLock.client_id === clientId) await c.env.KV.delete(`lock:${topicId}`);
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
