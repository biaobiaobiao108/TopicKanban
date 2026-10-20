import { describe, expect, it } from 'bun:test';
import {
  MAX_BATCH_SIZE,
  MAX_DRAFT_BYTES,
  MAX_LOGIN_REQUEST_BYTES,
  MAX_QUICK_DROP_REQUEST_BYTES,
  parseTopicUpdate,
  validateTextFields,
  validateCommercialDealFields,
  verifyQuickDropCredential,
} from '../src/server/apiShared';
import { draftSaveSchema, externalUrlSchema, parseWithZod } from '../src/server/schemas';
import { Database } from 'bun:sqlite';
import { createApp } from '../src/server/app';

/** Mirrors the route-level helper that the shared schema replaced. */
function parseTopicUpdateError(body: Record<string, unknown>): string | null {
  const result = parseTopicUpdate(body);
  return result.success ? null : result.error;
}

function externalUrlError(value: string): string | null {
  const result = externalUrlSchema('avatar_url').safeParse(value);
  return result.success ? null : result.error.issues[0]?.message ?? 'invalid';
}

describe('API validation boundaries', () => {
  it('serves query and body validation from the same enum declaration', async () => {
    const schemas = await import('../src/server/schemas');
    const shared = await import('../src/server/apiShared');
    // Identity, not just equality: a copy would drift the moment one side is edited.
    expect(shared.COMMERCIAL_DEAL_STATUSES).toBe(schemas.COMMERCIAL_DEAL_STATUSES);
    expect(shared.COMMERCIAL_DEAL_PAYMENT_STATUSES).toBe(schemas.COMMERCIAL_DEAL_PAYMENT_STATUSES);
    expect(shared.COMMERCIAL_DEAL_DELIVERABLE_TYPES).toBe(schemas.COMMERCIAL_DEAL_DELIVERABLE_TYPES);
    expect(shared.COMMERCIAL_DEAL_SOURCES).toBe(schemas.COMMERCIAL_DEAL_SOURCES);
    expect(shared.COMMERCIAL_DEAL_CONTRACT_STATUSES).toBe(schemas.COMMERCIAL_DEAL_CONTRACT_STATUSES);
    expect(shared.PRIORITIES).toBe(schemas.PRIORITIES);
  });

  it('rejects blank and oversized topic titles', () => {
    expect(parseTopicUpdateError({ title: '   ' })).toBe('title is required');
    expect(parseTopicUpdateError({ title: 'x'.repeat(201) })).toBe('title exceeds 200 characters');
  });

  it('accepts values at configured boundaries', () => {
    expect(validateTextFields({ title: 'x'.repeat(200) }, { title: [200, true] })).toBeNull();
    expect(MAX_DRAFT_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_BATCH_SIZE).toBe(200);
    expect(MAX_LOGIN_REQUEST_BYTES).toBe(16 * 1024);
    expect(MAX_QUICK_DROP_REQUEST_BYTES).toBe(64 * 1024);
  });

  it('requires Markdown draft content and bounds its word count', () => {
    const valid = parseWithZod(draftSaveSchema, {
      title: '文案',
      content_markdown: '# 开场',
      content_json: '{"type":"doc"}',
      content_html: '<h1>开场</h1>',
      word_count: 1,
      base_version: 0,
    });
    expect(valid.success).toBe(true);
    expect(parseWithZod(draftSaveSchema, { title: '文案' }).success).toBe(false);
    expect(parseWithZod(draftSaveSchema, { content_markdown: '', word_count: 200_001 }).success).toBe(false);
  });

  it('rejects invalid score and sort values', () => {
    expect(parseTopicUpdateError({ score_story: 3 })).toContain('score_story');
    expect(parseTopicUpdateError({ sort_order: -1 })).toContain('sort_order');
  });

  it('requires a separate configured quick-drop credential', () => {
    expect(verifyQuickDropCredential('drop-secret', 'drop-secret')).toBe('valid');
    expect(verifyQuickDropCredential('workspace-password', 'drop-secret')).toBe('invalid');
    expect(verifyQuickDropCredential('anything', undefined)).toBe('missing_config');
  });

  it('only accepts public HTTP(S) URLs for rendered external media', () => {
    expect(externalUrlError('https://images.example.com/avatar.png')).toBeNull();
    expect(externalUrlError('javascript:alert(1)')).toContain('http(s) URL');
    expect(externalUrlError('http://127.0.0.1/avatar.png')).toContain('http(s) URL');
  });

  it('rejects malformed commercial calendar dates', () => {    expect(validateCommercialDealFields({ delivery_due_date: '202608-02-07' })).toBe('delivery_due_date must be YYYY-MM-DD or null');
    expect(validateCommercialDealFields({ delivery_due_date: '2026-02-30' })).toBe('delivery_due_date must be YYYY-MM-DD or null');
    expect(validateCommercialDealFields({ delivery_due_date: '2026-08-27' })).toBeNull();
  });

  it('requires a nonblank commercial title for creation and keeps it optional for updates', () => {
    expect(validateCommercialDealFields({}, true)).toBe('title is required');
    expect(validateCommercialDealFields({ title: '' }, true)).toBe('title is required');
    expect(validateCommercialDealFields({ title: '   ' }, true)).toBe('title is required');
    expect(validateCommercialDealFields({ title: '有效商单' }, true)).toBeNull();
    expect(validateCommercialDealFields({ brand_name: '新品牌' })).toBeNull();
    expect(validateCommercialDealFields({ title: ' ' })).toBe('title is required');
  });

  it('rejects an empty commercial creation request without persisting a deal', async () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(await Bun.file('database/schema.sql').text());
      const db = sqlite;
      const app = createApp({ DB: db, APP_PASSWORD: 'title-test-password' });
      const login = await app.request('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'title-test-password' }),
      });
      const { token } = await login.json() as { token: string };
      const response = await app.request('/api/deals', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'title is required' });
      expect(sqlite.query('SELECT count(*) AS count FROM commercial_deals').get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it('only accepts the four commercial deal stages and non-negative amounts', () => {
    for (const status of ['communicating', 'producing', 'delivered', 'archived']) {
      expect(validateCommercialDealFields({ status })).toBeNull();
    }
    expect(validateCommercialDealFields({ status: 'reviewing' })).toBe('Invalid commercial deal status');
    expect(validateCommercialDealFields({ amount_cents: -1 })).toBe('amount_cents must be a non-negative safe integer');
  });
});
