import { describe, expect, it } from 'bun:test';
import {
  MAX_BATCH_SIZE,
  MAX_DRAFT_BYTES,
  MAX_LOGIN_REQUEST_BYTES,
  MAX_QUICK_DROP_REQUEST_BYTES,
  validateTextFields,
  validateCommercialDealFields,
  validateTopicFields,
  verifyQuickDropCredential,
} from '../src/server/apiShared';

describe('API validation boundaries', () => {
  it('rejects blank and oversized topic titles', () => {
    expect(validateTopicFields({ title: '   ' })).toBe('title is required');
    expect(validateTopicFields({ title: 'x'.repeat(201) })).toBe('title exceeds 200 characters');
  });

  it('accepts values at configured boundaries', () => {
    expect(validateTextFields({ title: 'x'.repeat(200) }, { title: [200, true] })).toBeNull();
    expect(MAX_DRAFT_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_BATCH_SIZE).toBe(200);
    expect(MAX_LOGIN_REQUEST_BYTES).toBe(16 * 1024);
    expect(MAX_QUICK_DROP_REQUEST_BYTES).toBe(64 * 1024);
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

  it('rejects malformed commercial calendar dates', () => {
    expect(validateCommercialDealFields({ delivery_due_date: '202608-02-07' })).toBe('delivery_due_date must be YYYY-MM-DD or null');
    expect(validateCommercialDealFields({ delivery_due_date: '2026-02-30' })).toBe('delivery_due_date must be YYYY-MM-DD or null');
    expect(validateCommercialDealFields({ delivery_due_date: '2026-08-27' })).toBeNull();
  });

  it('only accepts the four commercial deal stages and non-negative amounts', () => {
    for (const status of ['communicating', 'producing', 'delivered', 'archived']) {
      expect(validateCommercialDealFields({ status })).toBeNull();
    }
    expect(validateCommercialDealFields({ status: 'reviewing' })).toBe('Invalid commercial deal status');
    expect(validateCommercialDealFields({ amount_cents: -1 })).toBe('amount_cents must be a non-negative safe integer');
  });
});
