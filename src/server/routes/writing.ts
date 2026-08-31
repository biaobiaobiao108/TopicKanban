import type { NativeApp } from '../native';
import type { Draft, DraftCitation, PublishPackagePersistedContent } from '../../types';
import {
  MAX_DRAFT_BYTES,
  VERIFICATION_STATUSES,
  createId,
  isNonNegativeInteger,
  isOneOf,
  jsonError,
  requireDb,
  validateTextFields,
} from '../apiShared';
import {
  deleteCitation,
  insertCitation,
  loadCitations,
  loadDraft,
  loadPublishPackage,
  saveDraft,
  savePublishPackage,
} from '../repositories';
import { loadTopic } from '../repositories';

function validatePublishPackageContent(value: unknown): value is PublishPackagePersistedContent {
  if (!value || typeof value !== 'object') return false;
  const content = value as Partial<PublishPackagePersistedContent>;
  const isStringArray = (items: unknown, maxItems: number, maxLength: number) => Array.isArray(items)
    && items.length <= maxItems
    && items.every((item) => typeof item === 'string' && item.length <= maxLength);
  if (!isStringArray(content.title_candidates, 3, 200)) return false;
  if (typeof content.cover_text !== 'string' || content.cover_text.length > 2_000) return false;
  if (!isStringArray(content.tags, 100, 100)) return false;
  if (typeof content.pinned_comment !== 'string' || content.pinned_comment.length > 20_000) return false;
  if (!isStringArray(content.included_source_ids, 500, 200)) return false;
  if (!Array.isArray(content.chapters) || content.chapters.length > 200) return false;
  return content.chapters.every((chapter) => Boolean(chapter)
    && typeof chapter.id === 'string' && chapter.id.length <= 200
    && typeof chapter.title === 'string' && chapter.title.length <= 200
    && typeof chapter.time === 'string' && chapter.time.length <= 20
    && typeof chapter.start_seconds === 'number' && Number.isFinite(chapter.start_seconds) && chapter.start_seconds >= 0
    && (chapter.source === 'script-heading' || chapter.source === 'manual'));
}
function validatePublishPackagePayload(body: Record<string, unknown>): string | null {
  for (const field of ['title_simplified', 'title_traditional', 'description_simplified', 'description_traditional', 'content_json']) {
    if (typeof body[field] !== 'string') return `${field} must be a string`;
  }
  const textError = validateTextFields(body, {
    title_simplified: [200], title_traditional: [200], description_simplified: [20_000],
    description_traditional: [20_000], content_json: [500_000, true],
  });
  if (textError) return textError;
  if (body.base_version !== undefined
    && (typeof body.base_version !== 'number' || !Number.isInteger(body.base_version) || body.base_version < 0)) {
    return 'base_version must be a non-negative integer';
  }
  if (typeof body.title_traditional_auto !== 'boolean') return 'title_traditional_auto must be a boolean';
  if (typeof body.description_traditional_auto !== 'boolean') return 'description_traditional_auto must be a boolean';
  try {
    const content = JSON.parse(body.content_json as string) as unknown;
    if (!validatePublishPackageContent(content)) return 'Invalid publish package content';
  } catch {
    return 'content_json must be valid JSON';
  }
  return null;
}

export function registerWritingRoutes(app: NativeApp): void {
  app.get('/topics/:id/draft', async (c) => {
    try {
      return c.json(await loadDraft(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.put('/topics/:id/draft', async (c) => {
    try {
      const body = await c.req.json<Partial<Draft> & { base_version?: number }>();
      const draftBytes = new TextEncoder().encode(`${body.content_json || ''}${body.content_html || ''}`).byteLength;
      if (draftBytes > MAX_DRAFT_BYTES) return c.json({ error: 'Draft exceeds 2 MiB' }, 413);
      if (!isNonNegativeInteger(body.word_count ?? 0) || Number(body.word_count || 0) > 200000) {
        return c.json({ error: 'word_count must be an integer from 0 to 200000' }, 400);
      }
      if (body.content_json) {
        try { JSON.parse(body.content_json); } catch { return c.json({ error: 'content_json must be valid JSON' }, 400); }
      }
      const result = await saveDraft(requireDb(c), c.req.param('id'), body);
      if (result.kind === 'conflict') return c.json({ error: 'DRAFT_CONFLICT', current: result.current }, 409);
      return c.json(result.draft);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.put('/topics/:id/publish-package', async (c) => {
    try {
      const topicId = c.req.param('id');
      if (!(await loadTopic(requireDb(c), topicId))) return c.json({ error: 'Topic not found' }, 404);
      const body = await c.req.json<Record<string, unknown>>();
      const validationError = validatePublishPackagePayload(body);
      if (validationError) return c.json({ error: validationError }, 400);
      const result = await savePublishPackage(requireDb(c), topicId, body);
      if (result.kind === 'conflict') return c.json({ error: 'PUBLISH_PACKAGE_CONFLICT', current: result.current }, 409);
      return c.json(result.publishPackage);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/topics/:id/citations', async (c) => {
    try {
      return c.json(await loadCitations(requireDb(c), c.req.param('id')));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/topics/:id/citations', async (c) => {
    try {
      const topicId = c.req.param('id');
      const body = await c.req.json<Partial<DraftCitation>>();
      if (!body.reference_type || !body.reference_id || !body.reference_title) {
        return c.json({ error: 'Citation reference is required' }, 400);
      }
      const textError = validateTextFields(body as Record<string, unknown>, {
        reference_id: [200, true], reference_title: [200, true], reference_snapshot: [20000], quoted_text: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
      if (!isOneOf(body.reference_type, ['source', 'timeline', 'person', 'outline'])) {
        return c.json({ error: 'Invalid citation reference type' }, 400);
      }
      if (body.verification_status !== undefined && !isOneOf(body.verification_status, VERIFICATION_STATUSES)) {
        return c.json({ error: 'Invalid verification status' }, 400);
      }
      const citation: DraftCitation = {
        id: body.id || createId('cite'), topic_id: topicId,
        reference_type: body.reference_type, reference_id: body.reference_id,
        reference_title: body.reference_title, reference_snapshot: body.reference_snapshot || '',
        quoted_text: body.quoted_text || '', verification_status: body.verification_status || 'unverified',
        created_at: body.created_at || new Date().toISOString(),
      };
      await insertCitation(requireDb(c), citation);
      return c.json(citation, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.put('/topics/:id/citations/active', async (c) => {
    try {
      const { active_ids: activeIds } = await c.req.json<{ active_ids?: unknown }>();
      if (!Array.isArray(activeIds) || activeIds.length > 500 || activeIds.some((id) => typeof id !== 'string')) {
        return c.json({ error: 'active_ids must be an array of citation IDs' }, 400);
      }
      return c.json({ success: true, count: activeIds.length });
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/citations/:id', async (c) => {
    try {
      await deleteCitation(requireDb(c), c.req.param('id'));
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
