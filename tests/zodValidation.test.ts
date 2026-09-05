import { describe, expect, it } from 'bun:test';
import {
  topicCreateSchema,
  topicUpdateSchema,
  commercialDealSchema,
  externalUrlSchema,
  parseWithZod,
} from '../src/server/schemas';

describe('Zod validation pipeline', () => {
  it('validates valid topic payload successfully', () => {
    const payload = {
      title: '从零构建视频生产看板',
      status: 'approved',
      priority: 'high',
      is_pinned: 1,
      sort_order: 10,
      score_story: 2,
      score_conflict: 1,
      score_character: 2,
      score_material: 1,
      score_contrast: 0,
      target_publish_date: '2026-09-30',
      deadline: '2026-09-20',
      summary: '完整的视频选题工作流',
      initial_todo: { title: '完成故事大纲' },
    };
    const res = parseWithZod(topicCreateSchema, payload);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.title).toBe('从零构建视频生产看板');
      expect(res.data.status).toBe('approved');
    }
  });

  it('rejects missing or empty title on topic creation', () => {
    expect(parseWithZod(topicCreateSchema, {}).error).toBe('title is required');
    expect(parseWithZod(topicCreateSchema, { title: '   ' }).error).toBe('title is required');
    expect(parseWithZod(topicCreateSchema, { title: 'a'.repeat(201) }).error).toBe('title exceeds 200 characters');
  });

  it('rejects invalid topic status, priority, and pin values', () => {
    expect(parseWithZod(topicCreateSchema, { title: '测试', status: 'unknown_status' }).error).toBe('Invalid topic status');
    expect(parseWithZod(topicCreateSchema, { title: '测试', priority: 'critical' }).error).toBe('Invalid topic priority');
    expect(parseWithZod(topicCreateSchema, { title: '测试', is_pinned: 2 }).error).toBe('is_pinned must be 0 or 1');
  });

  it('rejects invalid scores and sort orders', () => {
    expect(parseWithZod(topicCreateSchema, { title: '测试', score_story: 3 }).error).toBe('score_story must be an integer from 0 to 2');
    expect(parseWithZod(topicCreateSchema, { title: '测试', score_conflict: -1 }).error).toBe('score_conflict must be an integer from 0 to 2');
    expect(parseWithZod(topicCreateSchema, { title: '测试', sort_order: -5 }).error).toBe('sort_order must be a non-negative integer');
  });

  it('validates topicUpdateSchema partial behavior', () => {
    // Allows update without title
    const partialRes = parseWithZod(topicUpdateSchema, { status: 'scripting' });
    expect(partialRes.success).toBe(true);

    // If title is passed, it must not be blank
    const blankTitleRes = parseWithZod(topicUpdateSchema, { title: '  ' });
    expect(blankTitleRes.success).toBe(false);
    expect(blankTitleRes.error).toBe('title is required');
  });

  it('validates commercialDealSchema fields and amounts', () => {
    const validDeal = {
      title: '品牌定制商单',
      source: 'brand_direct',
      deliverable_type: 'custom_video',
      status: 'communicating',
      contract_status: 'drafting',
      payment_status: 'unpaid',
      amount_cents: 1500000,
      delivery_due_date: '2026-10-15',
    };
    expect(parseWithZod(commercialDealSchema(true), validDeal).success).toBe(true);

    // Negative amount
    expect(parseWithZod(commercialDealSchema(false), { amount_cents: -100 }).error).toBe('amount_cents must be a non-negative safe integer');

    // Invalid status and source
    expect(parseWithZod(commercialDealSchema(false), { status: 'pending' }).error).toBe('Invalid commercial deal status');
    expect(parseWithZod(commercialDealSchema(false), { source: 'wechat_shop' }).error).toBe('Invalid commercial deal source');

    // Invalid calendar date
    expect(parseWithZod(commercialDealSchema(false), { delivery_due_date: '2026-02-30' }).error).toBe('delivery_due_date must be YYYY-MM-DD or null');
  });

  it('validates external URL safety correctly', () => {
    const safeUrl = externalUrlSchema('avatar_url');
    expect(safeUrl.safeParse('https://example.com/pic.jpg').success).toBe(true);
    expect(safeUrl.safeParse('http://127.0.0.1/pic.jpg').success).toBe(false);
    expect(safeUrl.safeParse('javascript:void(0)').success).toBe(false);
  });
});
