import { describe, it, expect } from 'bun:test';
import { getCurrentActionAgeDays, getCurrentActionWarning } from '../src/lib/topicMetrics';
import type { Topic } from '../src/types';

describe('topicMetrics - current Todo action', () => {
  const baseTopic: Topic = {
    id: 'topic-1', title: '测试选题', summary: '', hook: '', storyline: '', why_now: '',
    status: 'scripting', priority: 'medium',
    current_todo: {
      id: 'todo-1', topic_id: 'topic-1', title: '核实争议原片',
      is_current: 1, current_started_at: '2026-08-20T10:00:00.000Z', completed_at: null,
      sort_order: 1, created_at: '2026-08-20T10:00:00.000Z', updated_at: '2026-08-20T10:00:00.000Z',
    },
    score_character: 0, score_conflict: 0, score_contrast: 0, score_material: 0, score_story: 0,
    is_pinned: 0, sort_order: 1, created_at: '2026-08-20T10:00:00.000Z', updated_at: '2026-08-20T10:00:00.000Z',
    published_at: null, deleted_at: null,
  };

  it('calculates age from Todo activation time', () => {
    expect(getCurrentActionAgeDays(baseTopic, new Date('2026-08-25T10:00:00.000Z'))).toBe(5);
  });

  it('reports a stale current action without a due-date concept', () => {
    expect(getCurrentActionWarning(baseTopic, new Date('2026-08-25T10:00:00.000Z'), 5)).toBe('行动已停滞 5 天');
  });

  it('uses the current action placeholder when no Todo is active', () => {
    expect(getCurrentActionWarning({ ...baseTopic, current_todo: null })).toBe('未设置当前行动');
  });
});
