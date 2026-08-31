import type { NativeApp } from '../native';
import type { CommercialDeal, CommercialDealActivity } from '../../types';
import {
  COMMERCIAL_DEAL_STATUSES,
  COMMERCIAL_DEAL_PAYMENT_STATUSES,
  createId,
  isOneOf,
  jsonError,
  requireDb,
  validateCommercialDealFields,
} from '../apiShared';
import {
  findCommercialDeal,
  insertCommercialDeal,
  insertCommercialDealActivity,
  linkPublishedVideoToDeal,
  loadCommercialDeal,
  loadCommercialDealFocus,
  loadCommercialDealPage,
  loadCommercialDealsByTopicId,
  publishedVideoExists,
  replaceCommercialDealTopics,
  updateCommercialDeal,
  deleteCommercialDeal,
} from '../repositories';

export function registerDealRoutes(app: NativeApp): void {
  app.get('/deals/page', async (c) => {
    try {
      const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.req.query('page_size') || '24', 10) || 24));
      const scope = c.req.query('scope') || 'active';
      if (!isOneOf(scope, ['active', 'closed', 'all'])) return c.json({ error: 'Invalid commercial deal scope' }, 400);
      const status = c.req.query('status');
      const statuses = status?.split(',').map((value) => value.trim()).filter(Boolean) || [];
      if (statuses.some((value) => !isOneOf(value, COMMERCIAL_DEAL_STATUSES))) return c.json({ error: 'Invalid commercial deal status' }, 400);
      const paymentStatus = c.req.query('payment_status');
      if (paymentStatus && !isOneOf(paymentStatus, COMMERCIAL_DEAL_PAYMENT_STATUSES)) return c.json({ error: 'Invalid commercial deal payment status' }, 400);
      return c.json(await loadCommercialDealPage(requireDb(c), {
        page, pageSize, scope: scope as 'active' | 'closed' | 'all',
        query: c.req.query('q')?.slice(0, 200), status, paymentStatus,
      }));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/deals/focus', async (c) => {
    try {
      return c.json(await loadCommercialDealFocus(requireDb(c)));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/topics/:id/deals', async (c) => {
    try {
      return c.json(await loadCommercialDealsByTopicId(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/deals/:id', async (c) => {
    try {
      const deal = await loadCommercialDeal(requireDb(c), c.req.param('id'));
      return deal ? c.json(deal) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/deals', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const validationError = validateCommercialDealFields(body, true);
      if (validationError) return c.json({ error: validationError }, 400);
      const now = new Date().toISOString();
      const id = createId('deal');
      const deal: CommercialDeal = {
        id, title: String(body.title).trim(),
        brand_name: typeof body.brand_name === 'string' ? body.brand_name.trim() : '',
        agency_name: typeof body.agency_name === 'string' ? body.agency_name.trim() : '',
        contact_name: typeof body.contact_name === 'string' ? body.contact_name.trim() : '',
        contact_channel: typeof body.contact_channel === 'string' ? body.contact_channel.trim() : '',
        source: (body.source || 'other') as CommercialDeal['source'],
        deliverable_type: (body.deliverable_type || 'custom_video') as CommercialDeal['deliverable_type'],
        status: (body.status || 'communicating') as CommercialDeal['status'],
        contract_status: (body.contract_status || 'not_started') as CommercialDeal['contract_status'],
        contract_summary: typeof body.contract_summary === 'string' ? body.contract_summary : '',
        brief: typeof body.brief === 'string' ? body.brief : '',
        requirements: typeof body.requirements === 'string' ? body.requirements : '',
        restrictions: typeof body.restrictions === 'string' ? body.restrictions : '',
        amount_cents: typeof body.amount_cents === 'number' ? body.amount_cents : 0,
        payment_status: (body.payment_status || 'unpaid') as CommercialDeal['payment_status'],
        paid_at: typeof body.paid_at === 'string' ? body.paid_at : null,
        delivery_due_date: typeof body.delivery_due_date === 'string' ? body.delivery_due_date : null,
        publish_date: typeof body.publish_date === 'string' ? body.publish_date : null,
        next_action: typeof body.next_action === 'string' ? body.next_action : '',
        next_action_due_date: typeof body.next_action_due_date === 'string' ? body.next_action_due_date : null,
        published_video_id: typeof body.published_video_id === 'string' ? body.published_video_id : null,
        created_at: now, updated_at: now,
      };
      if (deal.published_video_id && !(await publishedVideoExists(requireDb(c), deal.published_video_id))) {
        return c.json({ error: 'Published video not found' }, 400);
      }
      await insertCommercialDeal(requireDb(c), deal);
      return c.json(await loadCommercialDeal(requireDb(c), id), 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/deals/:id', async (c) => {
    try {
      const db = requireDb(c);
      const id = c.req.param('id');
      const body = await c.req.json<Record<string, unknown>>();
      const validationError = validateCommercialDealFields(body);
      if (validationError) return c.json({ error: validationError }, 400);
      const existing = await findCommercialDeal(db, id);
      if (!existing) return c.json({ error: 'Not found' }, 404);
      if (typeof body.published_video_id === 'string' && !(await publishedVideoExists(db, body.published_video_id))) {
        return c.json({ error: 'Published video not found' }, 400);
      }
      return c.json(await updateCommercialDeal(db, id, body));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/deals/:id', async (c) => {
    try {
      const deleted = await deleteCommercialDeal(requireDb(c), c.req.param('id'));
      return deleted ? c.body(null, 204) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.put('/deals/:id/topics', async (c) => {
    try {
      const dealId = c.req.param('id');
      const body = await c.req.json<{ primary_topic_id?: string | null; related_topic_ids?: string[] }>();
      const primaryTopicId = body.primary_topic_id === undefined ? null : body.primary_topic_id;
      const relatedTopicIds = body.related_topic_ids || [];
      if (primaryTopicId !== null && typeof primaryTopicId !== 'string') return c.json({ error: 'primary_topic_id must be a string or null' }, 400);
      if (!Array.isArray(relatedTopicIds) || relatedTopicIds.length > 100 || relatedTopicIds.some((topicId) => typeof topicId !== 'string' || !topicId.trim())) {
        return c.json({ error: 'related_topic_ids must be an array of topic ids' }, 400);
      }
      const result = await replaceCommercialDealTopics(requireDb(c), dealId, primaryTopicId, relatedTopicIds);
      if (result === 'deal_not_found') return c.json({ error: 'Not found' }, 404);
      if (result === 'topic_not_found') return c.json({ error: 'One or more topics not found' }, 400);
      return c.json(result);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/deals/:id/activities', async (c) => {
    try {
      const dealId = c.req.param('id');
      const body = await c.req.json<{ content?: string; kind?: string }>();
      if (!body.content?.trim() || body.content.length > 20_000) return c.json({ error: 'Activity content is required and must be <= 20000 characters' }, 400);
      if (body.kind && !isOneOf(body.kind, ['note', 'payment'])) return c.json({ error: 'Invalid activity kind' }, 400);
      const activity: CommercialDealActivity = {
        id: createId('deal-activity'), deal_id: dealId,
        kind: (body.kind || 'note') as CommercialDealActivity['kind'],
        content: body.content.trim(), created_at: new Date().toISOString(),
      };
      if (!(await findCommercialDeal(requireDb(c), dealId))) return c.json({ error: 'Not found' }, 404);
      await insertCommercialDealActivity(requireDb(c), activity);
      return c.json(activity, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/deals/:id/link-published', async (c) => {
    try {
      const body = await c.req.json<{ published_video_id?: string | null }>();
      const publishedVideoId = body.published_video_id ?? null;
      if (publishedVideoId !== null && typeof publishedVideoId !== 'string') return c.json({ error: 'published_video_id must be a string or null' }, 400);
      const result = await linkPublishedVideoToDeal(requireDb(c), c.req.param('id'), publishedVideoId);
      if (result === 'deal_not_found') return c.json({ error: 'Not found' }, 404);
      if (result === 'video_not_found') return c.json({ error: 'Published video not found' }, 400);
      return c.json(result);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });
}
