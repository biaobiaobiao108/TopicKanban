import { z } from 'zod';
import { isTopicStatus } from '../types';
import { isValidIsoDate } from '../lib/dateInput';
import { isSafeExternalHttpUrl } from '../lib/urlSafety';

export const TOPIC_STATUSES = ['inbox', 'approved', 'scripting', 'production', 'published', 'icebox'] as const;
export const PRIORITIES = ['high', 'medium', 'low', 'none'] as const;

export const COMMERCIAL_DEAL_STATUSES = ['communicating', 'producing', 'delivered', 'archived'] as const;
export const COMMERCIAL_DEAL_PAYMENT_STATUSES = ['unpaid', 'paid'] as const;
export const COMMERCIAL_DEAL_DELIVERABLE_TYPES = ['custom_video', 'dynamic', 'live', 'offline_activity', 'other'] as const;
export const COMMERCIAL_DEAL_SOURCES = ['huahuo', 'brand_direct', 'agency', 'mcn', 'other'] as const;
export const COMMERCIAL_DEAL_CONTRACT_STATUSES = ['not_started', 'drafting', 'signed'] as const;

export const nullableIsoDate = (fieldName: string) =>
  z.union([z.string(), z.null()])
    .optional()
    .refine((val) => val === undefined || val === null || val === '' || isValidIsoDate(val), {
      message: `${fieldName} must be YYYY-MM-DD or null`,
    });

export const scoreField = (fieldName: string) =>
  z.number({
    error: `${fieldName} must be an integer from 0 to 2`,
  })
    .int(`${fieldName} must be an integer from 0 to 2`)
    .min(0, `${fieldName} must be an integer from 0 to 2`)
    .max(2, `${fieldName} must be an integer from 0 to 2`)
    .optional();

export const textField = (fieldName: string, maxLength: number, required = false) => {
  let schema = z.string({
    error: required ? `${fieldName} is required` : `${fieldName} must be a string`,
  });

  if (required) {
    schema = schema.refine((val) => val.trim().length > 0, {
      message: `${fieldName} is required`,
    });
  }

  return schema.max(maxLength, `${fieldName} exceeds ${maxLength} characters`);
};

export const topicCreateSchema = z.object({
  id: z.string().optional(),
  title: textField('title', 200, true),
  status: z.enum(TOPIC_STATUSES, {
    message: 'Invalid topic status',
  }).optional(),
  priority: z.enum(PRIORITIES, {
    message: 'Invalid topic priority',
  }).optional(),
  is_pinned: z.union([z.literal(0), z.literal(1)], {
    message: 'is_pinned must be 0 or 1',
  }).optional(),
  sort_order: z.number({
    error: 'sort_order must be a non-negative integer',
  })
    .int('sort_order must be a non-negative integer')
    .min(0, 'sort_order must be a non-negative integer')
    .optional(),
  score_character: scoreField('score_character'),
  score_conflict: scoreField('score_conflict'),
  score_contrast: scoreField('score_contrast'),
  score_material: scoreField('score_material'),
  score_story: scoreField('score_story'),
  target_publish_date: nullableIsoDate('target_publish_date'),
  deadline: nullableIsoDate('deadline'),
  summary: textField('summary', 2000).optional(),
  hook: textField('hook', 2000).optional(),
  why_now: textField('why_now', 2000).optional(),
  storyline: textField('storyline', 20000).optional(),
  initial_todo: z.object({
    title: textField('title', 200, true),
  }).optional(),
  tags: z.array(z.object({ id: z.string() })).optional(),
  people: z.array(z.object({ id: z.string() })).optional(),
  created_at: z.string().optional(),
});

export const topicUpdateSchema = topicCreateSchema.partial().extend({
  title: textField('title', 200, false).refine((val) => val === undefined || val.trim().length > 0, {
    message: 'title is required',
  }).optional(),
});

export const commercialDealSchema = (requireTitle = false) =>
  z.object({
    title: textField('title', 200, requireTitle).optional(),
    brand_name: textField('brand_name', 200).optional(),
    agency_name: textField('agency_name', 200).optional(),
    contact_name: textField('contact_name', 200).optional(),
    contact_channel: textField('contact_channel', 2000).optional(),
    contract_summary: textField('contract_summary', 20000).optional(),
    brief: textField('brief', 20000).optional(),
    requirements: textField('requirements', 20000).optional(),
    restrictions: textField('restrictions', 20000).optional(),
    next_action: textField('next_action', 2000).optional(),
    source: z.enum(COMMERCIAL_DEAL_SOURCES, {
      message: 'Invalid commercial deal source',
    }).optional(),
    deliverable_type: z.enum(COMMERCIAL_DEAL_DELIVERABLE_TYPES, {
      message: 'Invalid commercial deal deliverable type',
    }).optional(),
    status: z.enum(COMMERCIAL_DEAL_STATUSES, {
      message: 'Invalid commercial deal status',
    }).optional(),
    contract_status: z.enum(COMMERCIAL_DEAL_CONTRACT_STATUSES, {
      message: 'Invalid commercial deal contract status',
    }).optional(),
    payment_status: z.enum(COMMERCIAL_DEAL_PAYMENT_STATUSES, {
      message: 'Invalid commercial deal payment status',
    }).optional(),
    amount_cents: z.number({
      error: 'amount_cents must be a non-negative safe integer',
    })
      .int('amount_cents must be a non-negative safe integer')
      .min(0, 'amount_cents must be a non-negative safe integer')
      .refine((val) => Number.isSafeInteger(val), {
        message: 'amount_cents must be a non-negative safe integer',
      })
      .optional(),
    paid_at: nullableIsoDate('paid_at'),
    delivery_due_date: nullableIsoDate('delivery_due_date'),
    publish_date: nullableIsoDate('publish_date'),
    next_action_due_date: nullableIsoDate('next_action_due_date'),
    published_video_id: z.union([z.string(), z.null()], {
      message: 'published_video_id must be a string or null',
    }).optional(),
  });

export const externalUrlSchema = (fieldName: string) =>
  z.string({
    error: `${fieldName} must be a string`,
  }).refine((val) => isSafeExternalHttpUrl(val), {
    message: `${fieldName} must be an http(s) URL`,
  });

export type ZodValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues: z.ZodIssue[] };

export function parseWithZod<T>(schema: z.ZodType<T>, data: unknown): ZodValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstIssue = result.error.issues[0];
  return {
    success: false,
    error: firstIssue.message,
    issues: result.error.issues,
  };
}
