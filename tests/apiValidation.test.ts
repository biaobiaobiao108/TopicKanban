import { describe, expect, it } from 'vitest';
import {
  MAX_BATCH_SIZE,
  MAX_DRAFT_BYTES,
  validateTextFields,
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
});
