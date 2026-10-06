import type { NativeApp } from '../native';
import { jsonError } from '../apiShared';
import { acquirePresenceLease, releasePresenceLease } from '../presenceLeases';

export function registerPresenceRoutes(app: NativeApp): void {
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
      const lease = acquirePresenceLease(
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
      const result = releasePresenceLease(`lock:${topicId}`, clientId.trim());
      if (result === 'not_owner') return c.json({ error: 'Presence lease belongs to another client' }, 409);
      return c.json({ success: true, released: result === 'released' });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
