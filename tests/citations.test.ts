import { describe, expect, it } from 'bun:test';
import type { DraftCitation, Topic } from '../src/types';
import { getCitationHealth } from '../src/lib/citations';

const topic: Topic = {
  id: 'topic-1',
  title: '测试选题',
  summary: '',
  hook: '开场钩子',
  storyline: '当前主线',
  why_now: '',
  status: 'scripting',
  priority: 'none',
  score_character: 0,
  score_conflict: 0,
  score_contrast: 0,
  score_material: 0,
  score_story: 0,
  is_pinned: 0,
  sort_order: 0,
  created_at: '',
  updated_at: '',
};

const citation = (overrides: Partial<DraftCitation>): DraftCitation => ({
  id: 'citation-1',
  topic_id: topic.id,
  reference_type: 'report',
  reference_id: 'report-1',
  reference_title: '选题报告',
  reference_snapshot: '被引用的原文',
  quoted_text: '被引用的原文',
  verification_status: 'confirmed',
  created_at: '',
  ...overrides,
});

describe('citation health', () => {
  it('keeps report quotes from being compared with the topic storyline', () => {
    const health = getCitationHealth([citation({})], { topic, sources: [], timeline: [] });

    expect(health.states[0]).toMatchObject({ missing: false, stale: false, unverified: false });
  });

  it('resolves outline citations by their explicit hook or storyline id', () => {
    const hook = citation({
      reference_type: 'outline',
      reference_id: 'hook',
      reference_snapshot: topic.hook || '',
    });
    const unknownOutline = citation({ reference_type: 'outline', reference_id: 'unknown' });
    const health = getCitationHealth([hook, unknownOutline], { topic, sources: [], timeline: [] });

    expect(health.states[0]).toMatchObject({ missing: false, stale: false });
    expect(health.states[1]).toMatchObject({ missing: true, stale: true });
  });
});
