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
      const db = requireDb(c);
      const topic = await loadTopic(db, id);
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
      await c.env.KV.replaceTopicShare(id, token, JSON.stringify(snapshot), ttl);
      if (!await loadTopic(db, id)) {
        await c.env.KV.deleteTopicShares(id);
        return c.json({ error: 'Topic not found' }, 404);
      }
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
      const revoked = await c.env.KV.deleteTopicShares(topicId);
      return c.json({ success: true, revoked });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/topics/:id/presence', async (c) => {
    try {
      const topicId = c.req.param('id');
      const body = await c.req.json<{ client_id?: unknown; device_name?: unknown }>();
      if (typeof body.client_id !== 'string' || !body.client_id.trim() || body.client_id.length > 200) {
        return c.json({ error: 'client_id is required and must be <= 200 characters' }, 400);
      }
      if (body.device_name !== undefined && (typeof body.device_name !== 'string' || body.device_name.length > 100)) {
        return c.json({ error: 'device_name must be <= 100 characters' }, 400);
      }
      const clientId = body.client_id.trim();
      const deviceName = typeof body.device_name === 'string' && body.device_name.trim()
        ? body.device_name.trim()
        : '其他设备';
      const now = new Date().toISOString();
      const lease = await c.env.KV.acquireJsonLease(
        `lock:${topicId}`,
        clientId,
        { client_id: clientId, device_name: deviceName, updated_at: now },
        30,
      );
      return c.json({ is_locked: !lease.acquired, active_editor: lease.acquired ? undefined : lease.current });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/topics/:id/presence', async (c) => {
    try {
      const topicId = c.req.param('id');
      const clientId = c.req.query('client_id');
      if (!clientId?.trim() || clientId.length > 200) {
        return c.json({ error: 'client_id is required and must be <= 200 characters' }, 400);
      }
      const result = await c.env.KV.releaseJsonLease(`lock:${topicId}`, clientId.trim());
      if (result === 'not_owner') return c.json({ error: 'Presence lease belongs to another client' }, 409);
      return c.json({ success: true, released: result === 'released' });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
