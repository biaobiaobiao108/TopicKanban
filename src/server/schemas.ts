import { z } from 'zod';
import { isTopicStatus } from '../types';
import { isValidIsoDate } from '../lib/dateInput';
import { isSafeExternalHttpUrl } from '../lib/urlSafety';
import { appSettingsSchema } from '../lib/backupValidation';

export const TOPIC_STATUSES = ['inbox', 'scripting', 'production', 'published', 'icebox'] as const;
export const PRIORITIES = ['high', 'medium', 'low', 'none'] as const;

export const COMMERCIAL_DEAL_STATUSES = ['communicating', 'producing', 'delivered', 'archived'] as const;
export const COMMERCIAL_DEAL_PAYMENT_STATUSES = ['unpaid', 'paid'] as const;
export const COMMERCIAL_DEAL_DELIVERABLE_TYPES = ['custom_video', 'dynamic', 'live', 'offline_activity', 'other'] as const;
export const COMMERCIAL_DEAL_SOURCES = ['huahuo', 'brand_direct', 'agency', 'mcn', 'other'] as const;
export const COMMERCIAL_DEAL_CONTRACT_STATUSES = ['not_started', 'drafting', 'signed'] as const;

export const draftSaveSchema = z.object({
  id: z.string().optional(),
  topic_id: z.string().optional(),
  title: z.string().max(200).optional(),
  content_markdown: z.string({ error: 'content_markdown must be a string' }),
  content_json: z.string().optional(),
  content_html: z.string().optional(),
  word_count: z.number().int().min(0).max(200_000).optional(),
  version: z.number().int().min(0).optional(),
  updated_at: z.string().optional(),
  base_version: z.number().int().min(0).optional(),
});

export const topicReportSaveSchema = z.object({
  id: z.string().optional(),
  topic_id: z.string().optional(),
  title: z.string().max(200).optional(),
  content_markdown: z.string({ error: 'content_markdown must be a string' }),
  content_json: z.string().optional(),
  content_html: z.string().optional(),
  word_count: z.number().int().min(0).max(200_000).optional(),
  version: z.number().int().min(0).optional(),
  updated_at: z.string().optional(),
  base_version: z.number().int().min(0).optional(),
});

export const todoBoardLayoutSchema = z.object({
  todo_ids: z.array(z.string().min(1)),
  in_progress_ids: z.array(z.string().min(1)),
  completed_ids: z.array(z.string().min(1)),
}).strict().superRefine((layout, ctx) => {
  const allIds = [...layout.todo_ids, ...layout.in_progress_ids, ...layout.completed_ids];
  if (new Set(allIds).size !== allIds.length) {
    ctx.addIssue({ code: 'custom', path: [], message: 'A Todo may appear in only one board column' });
  }
});

export const nullableIsoDate = (fieldName: string) =>
  z.union([z.string(), z.null()])
    .optional()
    .transform((value) => value === '' ? null : value)
    .refine((val) => val === undefined || val === null || isValidIsoDate(val), {
      message: `${fieldName} must be YYYY-MM-DD or null`,
    });

export const backupExportRequestSchema = z.object({
  settings: appSettingsSchema,
}).strict();

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

export const topicTodoCreateSchema = z.object({
  title: textField('title', 200, true),
  status: z.enum(['todo', 'in_progress'], {
    message: 'Invalid Todo status',
  }).optional(),
}).strict();

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
}).strict();

export const topicUpdateSchema = topicCreateSchema.partial().extend({
  title: textField('title', 200, false).refine((val) => val === undefined || val.trim().length > 0, {
    message: 'title is required',
  }).optional(),
}).strict();

export const commercialDealSchema = (requireTitle = false) =>
  z.object({
    title: requireTitle ? textField('title', 200, true) : textField('title', 200, true).optional(),
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

export const VERIFICATION_STATUSES = ['confirmed', 'unverified', 'rejected'] as const;
export const DATE_PRECISIONS = ['exact', 'year_month', 'year', 'unknown'] as const;
export const PLATFORM_TYPES = ['bilibili', 'douyin', 'kuaishou', 'weibo', 'xiaohongshu', 'wechat', 'zhihu', 'youtube', 'news', 'live', 'other'] as const;

export function isValidSourceEventDate(value: string): boolean {
  if (!value) return true;
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : null;
  const day = match[3] ? Number(match[3]) : null;
  if (year < 1) return false;
  if (month !== null && (month < 1 || month > 12)) return false;
  const monthEnd = new Date(0);
  if (month !== null) monthEnd.setUTCFullYear(year, month, 0);
  if (day !== null && (month === null || day < 1 || day > monthEnd.getUTCDate())) return false;
  return true;
}

export const topicTodoUpdateSchema = z.object({
  title: textField('title', 200, false).refine((val) => val === undefined || val.trim().length > 0, {
    message: 'title is required',
  }).optional(),
}).strict();

export const personCreateSchema = z.object({
  id: z.string().optional(),
  name: textField('name', 200, true),
  aliases: textField('aliases', 2000).optional(),
  avatar_url: externalUrlSchema('avatar_url').optional().or(z.literal('')),
  description: textField('description', 20000).optional(),
  identity: textField('identity', 2000).optional(),
  platform_accounts: textField('platform_accounts', 2000).optional(),
  quotes: textField('quotes', 20000).optional(),
  notes: textField('notes', 20000).optional(),
  created_at: z.string().optional(),
}).strict();

export const personUpdateSchema = z.object({
  name: textField('name', 200, false).refine((val) => val === undefined || val.trim().length > 0, {
    message: 'name is required',
  }).optional(),
  aliases: textField('aliases', 2000).optional(),
  avatar_url: externalUrlSchema('avatar_url').optional().or(z.literal('')),
  description: textField('description', 20000).optional(),
  identity: textField('identity', 2000).optional(),
  platform_accounts: textField('platform_accounts', 2000).optional(),
  quotes: textField('quotes', 20000).optional(),
  notes: textField('notes', 20000).optional(),
}).strict();

export const personRelationshipCreateSchema = z.object({
  id: z.string().optional(),
  person_a_id: z.string({
    error: () => 'Both people and relationship are required',
  }).min(1, 'Both people and relationship are required'),
  person_b_id: z.string({
    error: () => 'Both people and relationship are required',
  }).min(1, 'Both people and relationship are required'),
  relationship: z.string({
    error: () => 'Both people and relationship are required',
  }).refine((val) => val.trim().length > 0, {
    message: 'Both people and relationship are required',
  }).and(z.string().max(200, 'relationship exceeds 200 characters')),
  description: textField('description', 20000).optional(),
}).strict().refine((data) => data.person_a_id !== data.person_b_id, {
  message: 'A person cannot relate to itself',
});

export const personRelationshipUpdateSchema = z.object({
  person_a_id: z.string().min(1).optional(),
  person_b_id: z.string().min(1).optional(),
  relationship: textField('relationship', 200, false).refine((val) => val === undefined || val.trim().length > 0, {
    message: 'relationship is required',
  }).optional(),
  description: textField('description', 20000).optional(),
}).strict();

export const sourceCreateSchema = z.object({
  id: z.string().optional(),
  topic_id: z.string({ error: 'topic_id and title are required' }).min(1, 'topic_id and title are required'),
  title: textField('title', 200, true),
  content: textField('content', 20000).optional(),
  url: externalUrlSchema('url').optional().or(z.literal('')),
  author: textField('author', 200).optional(),
  published_at: textField('published_at', 50).optional(),
  verification_status: z.enum(VERIFICATION_STATUSES, {
    message: 'Invalid verification status',
  }).optional(),
  notes: textField('notes', 20000).optional(),
  event_date: z.union([z.string(), z.null()]).optional().transform((val) => val === '' ? null : val).refine((val) => val === undefined || val === null || isValidSourceEventDate(val), {
    message: 'event_date must be a valid YYYY, YYYY-MM, or YYYY-MM-DD date',
  }),
  date_precision: z.enum(DATE_PRECISIONS, {
    message: 'Invalid source date_precision',
  }).optional(),
  platform: z.enum(PLATFORM_TYPES, {
    message: 'Invalid source platform',
  }).optional(),
  sort_order: z.number().int('sort_order must be a non-negative integer').min(0, 'sort_order must be a non-negative integer').optional(),
  created_at: z.string().optional(),
}).strict();

export const sourceUpdateSchema = z.object({
  title: textField('title', 200, false).refine((val) => val === undefined || val.trim().length > 0, {
    message: 'title is required',
  }).optional(),
  content: textField('content', 20000).optional(),
  url: externalUrlSchema('url').optional().or(z.literal('')),
  author: textField('author', 200).optional(),
  published_at: textField('published_at', 50).optional(),
  verification_status: z.enum(VERIFICATION_STATUSES, {
    message: 'Invalid verification status',
  }).optional(),
  notes: textField('notes', 20000).optional(),
  event_date: z.union([z.string(), z.null()]).optional().transform((val) => val === '' ? null : val).refine((val) => val === undefined || val === null || isValidSourceEventDate(val), {
    message: 'event_date must be a valid YYYY, YYYY-MM, or YYYY-MM-DD date',
  }),
  date_precision: z.enum(DATE_PRECISIONS, {
    message: 'Invalid source date_precision',
  }).optional(),
  platform: z.enum(PLATFORM_TYPES, {
    message: 'Invalid source platform',
  }).optional(),
  sort_order: z.number().int('sort_order must be a non-negative integer').min(0, 'sort_order must be a non-negative integer').optional(),
}).strict();

export const publishedVideoCreateSchema = z.object({
  id: z.string().optional(),
  topic_id: z.union([z.string(), z.null()], {
    message: 'topic_id must be a string or null',
  }).optional(),
  title: textField('title', 200, true),
  url: externalUrlSchema('url').optional().or(z.literal('')),
  bvid: textField('bvid', 20).refine((val) => !val || /^BV[a-zA-Z0-9]{10}$/i.test(val), {
    message: 'Invalid BVID',
  }).optional(),
  published_at: textField('published_at', 50).optional(),
  notes: textField('notes', 20000).optional(),
  views: z.number().int().min(0).refine((val) => Number.isSafeInteger(val), { message: 'views must be a non-negative safe integer' }).optional(),
  likes: z.number().int().min(0).refine((val) => Number.isSafeInteger(val), { message: 'likes must be a non-negative safe integer' }).optional(),
  coins: z.number().int().min(0).refine((val) => Number.isSafeInteger(val), { message: 'coins must be a non-negative safe integer' }).optional(),
  favorites: z.number().int().min(0).refine((val) => Number.isSafeInteger(val), { message: 'favorites must be a non-negative safe integer' }).optional(),
  comments: z.number().int().min(0).refine((val) => Number.isSafeInteger(val), { message: 'comments must be a non-negative safe integer' }).optional(),
}).strict();

export const publishedVideoUpdateSchema = publishedVideoCreateSchema.partial().extend({
  title: textField('title', 200, false).refine((val) => val === undefined || val.trim().length > 0, {
    message: 'title is required',
  }).optional(),
}).strict();

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
