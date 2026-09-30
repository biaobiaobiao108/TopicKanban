import { describe, expect, it } from 'bun:test';
import {
  MAX_BATCH_SIZE,
  MAX_DRAFT_BYTES,
  MAX_LOGIN_REQUEST_BYTES,
  MAX_QUICK_DROP_REQUEST_BYTES,
  validateTextFields,
  validateCommercialDealFields,
  validateTopicFields,
  validateExternalUrlField,
  verifyQuickDropCredential,
} from '../src/server/apiShared';
import { draftSaveSchema, parseWithZod } from '../src/server/schemas';
import { Database } from 'bun:sqlite';
import { SqliteDatabase } from '../src/server/sqlite';
import { createApp } from '../src/server/app';
import { AppKV } from '../src/server/appKv';

describe('API validation boundaries', () => {
  it('rejects blank and oversized topic titles', () => {
    expect(validateTopicFields({ title: '   ' })).toBe('title is required');
    expect(validateTopicFields({ title: 'x'.repeat(201) })).toBe('title exceeds 200 characters');
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
    expect(validateTopicFields({ score_story: 3 })).toContain('score_story');
    expect(validateTopicFields({ sort_order: -1 })).toContain('sort_order');
  });

  it('requires a separate configured quick-drop credential', () => {
    expect(verifyQuickDropCredential('drop-secret', 'drop-secret')).toBe('valid');
    expect(verifyQuickDropCredential('workspace-password', 'drop-secret')).toBe('invalid');
    expect(verifyQuickDropCredential('anything', undefined)).toBe('missing_config');
  });

  it('only accepts public HTTP(S) URLs for rendered external media', () => {
    expect(validateExternalUrlField({ avatar_url: 'https://images.example.com/avatar.png' }, 'avatar_url')).toBeNull();
    expect(validateExternalUrlField({ avatar_url: 'javascript:alert(1)' }, 'avatar_url')).toContain('http(s) URL');
    expect(validateExternalUrlField({ avatar_url: 'http://127.0.0.1/avatar.png' }, 'avatar_url')).toContain('http(s) URL');
  });

  it('rejects malformed commercial calendar dates', () => {
    expect(validateCommercialDealFields({ delivery_due_date: '202608-02-07' })).toBe('delivery_due_date must be YYYY-MM-DD or null');
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
      sqlite.exec(await Bun.file('drizzle/0000_schema.sql').text());
      const db = new SqliteDatabase(sqlite);
      const app = createApp({ DB: db, KV: new AppKV(db), APP_PASSWORD: 'title-test-password' });
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
