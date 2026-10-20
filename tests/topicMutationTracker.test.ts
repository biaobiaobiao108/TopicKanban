import { describe, expect, it } from 'bun:test';
import type { Topic } from '../src/types';
import { TopicMutationTracker } from '../src/lib/topicMutationTracker';

const topic = (overrides: Partial<Topic> = {}) => ({
  id: 'topic-a', title: '旧标题', is_pinned: 0, updated_at: '2026-01-01T00:00:00Z', ...overrides,
}) as Topic;

describe('TopicMutationTracker', () => {
  it('keeps a later successful title edit when an earlier pin request fails', () => {
    const tracker = new TopicMutationTracker();
    let current = topic();
    const pin = { is_pinned: 1 as const };
    const pinSequence = tracker.begin(current.id, pin, current);
    current = { ...current, ...pin };
    const edit = { title: '新标题' };
    const editSequence = tracker.begin(current.id, edit, current);
    current = { ...current, ...edit };
    current = { ...current, ...tracker.settle(current.id, edit, editSequence, topic({ ...edit, is_pinned: 0 })) };
    current = { ...current, ...tracker.settle(current.id, pin, pinSequence) };
    expect(current.title).toBe('新标题');
    expect(current.is_pinned).toBe(0);
  });

  it('merges only pin response fields so a pending title remains visible', () => {
    const tracker = new TopicMutationTracker();
    const current = topic();
    const pin = { is_pinned: 1 as const };
    const pinSequence = tracker.begin(current.id, pin, current);
    tracker.begin(current.id, { title: '正在修改' }, current);
    const patch = tracker.settle(current.id, pin, pinSequence, {
      is_pinned: 1, updated_at: '2026-02-01T00:00:00Z',
    });
    expect({ ...current, title: '正在修改', ...patch }).toMatchObject({ title: '正在修改', is_pinned: 1 });
    expect(patch).not.toHaveProperty('title');
  });

  it('an old failure preserves a later resolved pin selection across topics', () => {
    const tracker = new TopicMutationTracker();
    const a = topic({ is_pinned: 1 });
    const b = topic({ id: 'topic-b' });
    const firstA = tracker.begin(a.id, { is_pinned: 0 }, a);
    const firstB = tracker.begin(b.id, { is_pinned: 1 }, b);
    const secondA = tracker.begin(a.id, { is_pinned: 1 }, a);
    const secondB = tracker.begin(b.id, { is_pinned: 0 }, b);
    tracker.settle(a.id, { is_pinned: 1 }, secondA, { is_pinned: 1 });
    tracker.settle(b.id, { is_pinned: 0 }, secondB, { is_pinned: 0 });
    expect(tracker.settle(a.id, { is_pinned: 0 }, firstA)).toEqual({ is_pinned: 1 });
    expect(tracker.settle(b.id, { is_pinned: 1 }, firstB)).toEqual({ is_pinned: 0 });
  });

  it('rolls back to the original cached value when every overlapping pin fails', () => {
    const tracker = new TopicMutationTracker();
    const original = topic({ is_pinned: 1 });
    const first = tracker.begin(original.id, { is_pinned: 0 }, original);
    const second = tracker.begin(original.id, { is_pinned: 1 }, topic({ is_pinned: 0 }));
    expect(tracker.settle(original.id, { is_pinned: 0 }, first)).toEqual({ is_pinned: 1 });
    expect(tracker.settle(original.id, { is_pinned: 1 }, second)).toEqual({ is_pinned: 1 });
  });

  it('includes server-derived fields in ordinary edit results', () => {
    const tracker = new TopicMutationTracker();
    const current = topic({ is_pinned: 1 });
    const edit = { status: 'published' as const };
    const sequence = tracker.begin(current.id, edit, current);
    expect(tracker.settle(current.id, edit, sequence, topic({ ...edit, updated_at: '2026-03-01T00:00:00Z' })))
      .toEqual({ status: 'published', is_pinned: 0, updated_at: '2026-03-01T00:00:00Z' });
  });
});
