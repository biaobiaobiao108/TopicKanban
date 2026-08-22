import { describe, it, expect } from 'vitest';
import { isNextActionDeferred, getNextActionWarning } from '../src/lib/topicMetrics';
import type { Topic } from '../src/types';

describe('topicMetrics - isNextActionDeferred (Beijing Time UTC+8)', () => {
  const baseTopic: Topic = {
    id: 'topic-1',
    title: '测试选题',
    summary: '',
    hook: '',
    storyline: '',
    why_now: '',
    status: 'scripting',
    priority: 'medium',
    next_action: '核实争议原片',
    next_action_updated_at: '2026-08-20T10:00:00.000Z',
    next_action_deferred_until: '2026-08-22',
    score_character: 0,
    score_conflict: 0,
    score_contrast: 0,
    score_material: 0,
    score_story: 0,
    is_pinned: 0,
    sort_order: 1,
    created_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-20T10:00:00.000Z',
    published_at: null,
    deleted_at: null,
  };

  it('should be deferred on the same day in Beijing time', () => {
    // 2026-08-22 15:00:00 Beijing Time is 2026-08-22T07:00:00.000Z
    const nowDuringDay = new Date('2026-08-22T07:00:00.000Z');
    expect(isNextActionDeferred(baseTopic, nowDuringDay)).toBe(true);
    expect(getNextActionWarning(baseTopic, nowDuringDay)).toBe('已延期至 2026-08-22');
  });

  it('should still be deferred at 23:59:59 Beijing time', () => {
    // 2026-08-22 23:59:59.000 Beijing Time is 2026-08-22T15:59:59.000Z
    const endOfDay = new Date('2026-08-22T15:59:59.000Z');
    expect(isNextActionDeferred(baseTopic, endOfDay)).toBe(true);
  });

  it('should expire after 00:00:00 next day in Beijing time', () => {
    // 2026-08-23 00:00:01 Beijing Time is 2026-08-22T16:00:01.000Z
    const nextDay = new Date('2026-08-22T16:00:01.000Z');
    expect(isNextActionDeferred(baseTopic, nextDay)).toBe(false);
  });
});
