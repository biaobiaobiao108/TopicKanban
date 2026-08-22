import { z } from 'zod';
import type { BackupData } from '../types';

const id = z.string().trim().min(1, 'ID 不能为空').max(200, 'ID 不能超过 200 字符');
const shortText = z.string().max(200);
const mediumText = z.string().max(2_000);
const longText = z.string().max(20_000);
const timestamp = z.string().max(50);
const optionalTimestamp = timestamp.nullable().optional();
const verificationStatus = z.enum(['confirmed', 'unverified', 'rejected']);

const tagSchema = z.object({
  id,
  name: shortText.trim().min(1, '标签名称不能为空'),
  color: z.string().max(50).optional(),
});

const personSchema = z.object({
  id,
  name: shortText.trim().min(1, '人物名称不能为空'),
  aliases: mediumText,
  avatar_url: z.string().max(2_048),
  description: longText,
  identity: mediumText,
  platform_accounts: mediumText,
  quotes: longText,
  notes: longText,
  created_at: timestamp,
  updated_at: timestamp,
});

const topicSchema = z.object({
  id,
  title: shortText.trim().min(1, '选题标题不能为空'),
  summary: mediumText,
  hook: mediumText,
  storyline: longText,
  why_now: mediumText,
  status: z.enum(['inbox', 'approved', 'scripting', 'production', 'published', 'icebox']),
  priority: z.enum(['high', 'medium', 'low', 'none']),
  next_action: mediumText,
  next_action_updated_at: optionalTimestamp,
  next_action_deferred_until: optionalTimestamp,
  score_character: z.number().int().min(0).max(2),
  score_conflict: z.number().int().min(0).max(2),
  score_contrast: z.number().int().min(0).max(2),
  score_material: z.number().int().min(0).max(2),
  score_story: z.number().int().min(0).max(2),
  is_pinned: z.union([z.literal(0), z.literal(1)]),
  sort_order: z.number().int().nonnegative(),
  created_at: timestamp,
  updated_at: timestamp,
  published_at: optionalTimestamp,
  deleted_at: optionalTimestamp,
  tags: z.array(tagSchema).optional(),
  people: z.array(personSchema).optional(),
}).passthrough();

const sourceSchema = z.object({
  id,
  topic_id: id,
  title: shortText.trim().min(1),
  type: z.enum(['fact', 'clue', 'material']),
  content: longText,
  url: z.string().max(2_048),
  platform: z.enum(['bilibili', 'douyin', 'kuaishou', 'weibo', 'xiaohongshu', 'wechat', 'zhihu', 'youtube', 'news', 'live', 'other']),
  author: shortText,
  published_at: timestamp,
  verification_status: verificationStatus,
  notes: longText,
  created_at: timestamp,
  updated_at: timestamp,
});

const timelineSchema = z.object({
  id,
  topic_id: id,
  title: shortText.trim().min(1),
  description: longText,
  event_date: timestamp,
  date_precision: z.enum(['exact', 'year_month', 'year', 'unknown']),
  verification_status: verificationStatus,
  sort_order: z.number().int().nonnegative(),
  created_at: timestamp,
  updated_at: timestamp,
  person_ids: z.array(id).optional(),
});

const relationshipSchema = z.object({
  id,
  person_a_id: id,
  person_b_id: id,
  relationship: shortText.trim().min(1),
  description: longText,
  created_at: timestamp,
}).passthrough();

const draftSchema = z.object({
  id,
  topic_id: id,
  title: shortText,
  content_json: z.string().max(2 * 1024 * 1024),
  content_html: z.string().max(2 * 1024 * 1024),
  word_count: z.number().int().min(0).max(200_000),
  version: z.number().int().min(1),
  updated_at: timestamp,
}).superRefine((draft, ctx) => {
  const bytes = new TextEncoder().encode(`${draft.content_json}${draft.content_html}`).byteLength;
  if (bytes > 2 * 1024 * 1024) ctx.addIssue({ code: 'custom', message: '草稿正文超过 2 MiB 限制' });
  if (draft.content_json) {
    try {
      JSON.parse(draft.content_json);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['content_json'], message: '草稿 content_json 不是合法 JSON' });
    }
  }
});

const citationSchema = z.object({
  id,
  topic_id: id,
  reference_type: z.enum(['source', 'timeline', 'person', 'outline']),
  reference_id: id,
  reference_title: shortText.trim().min(1),
  reference_snapshot: longText,
  quoted_text: longText,
  verification_status: verificationStatus,
  created_at: timestamp,
});

const publishedSchema = z.object({
  id,
  topic_id: id.nullable(),
  title: shortText.trim().min(1),
  url: z.string().max(2_048),
  bvid: z.string().max(50),
  published_at: timestamp,
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  coins: z.number().int().nonnegative(),
  favorites: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  notes: longText,
  updated_at: timestamp,
}).passthrough();

const settingsSchema = z.object({
  reading_speed: z.number().positive().max(1_000),
  theme: z.enum(['light', 'dark', 'warm_paper', 'system']),
  editor_font_size: z.enum(['compact', 'standard', 'large']).optional(),
  editor_line_height: z.enum(['normal', 'relaxed', 'loose']).optional(),
  typewriter_mode_default: z.boolean().optional(),
  stale_action_days: z.number().positive().max(30).optional(),
  default_share_ttl_days: z.number().positive().max(365).optional(),
  reviewer_branding: z.string().max(100).optional(),
});

const backupSchema = z.object({
  version: z.literal('2.0'),
  export_at: timestamp,
  topics: z.array(topicSchema),
  sources: z.array(sourceSchema),
  timeline: z.array(timelineSchema),
  people: z.array(personSchema),
  relationships: z.array(relationshipSchema),
  drafts: z.array(draftSchema),
  citations: z.array(citationSchema),
  tags: z.array(tagSchema),
  published: z.array(publishedSchema),
  settings: settingsSchema,
}).superRefine((data, ctx) => {
  const addIssue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', path, message });
  const requireUniqueIds = (items: Array<{ id: string }>, key: string) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) addIssue([key, index, 'id'], `重复 ID：${item.id}`);
      seen.add(item.id);
    });
  };

  const collections: Array<[string, Array<{ id: string }>]> = [
    ['topics', data.topics], ['sources', data.sources], ['timeline', data.timeline],
    ['people', data.people], ['relationships', data.relationships], ['drafts', data.drafts],
    ['citations', data.citations], ['tags', data.tags], ['published', data.published],
  ];
  collections.forEach(([key, items]) => requireUniqueIds(items, key));

  const topicIds = new Set(data.topics.map((item) => item.id));
  const personIds = new Set(data.people.map((item) => item.id));
  const tagIds = new Set(data.tags.map((item) => item.id));
  const requireTopic = (topicId: string, path: Array<string | number>) => {
    if (!topicIds.has(topicId)) addIssue(path, `引用了不存在的选题：${topicId}`);
  };

  data.sources.forEach((item, index) => requireTopic(item.topic_id, ['sources', index, 'topic_id']));
  data.timeline.forEach((item, index) => {
    requireTopic(item.topic_id, ['timeline', index, 'topic_id']);
    item.person_ids?.forEach((personId, personIndex) => {
      if (!personIds.has(personId)) addIssue(['timeline', index, 'person_ids', personIndex], `引用了不存在的人物：${personId}`);
    });
  });
  data.drafts.forEach((item, index) => requireTopic(item.topic_id, ['drafts', index, 'topic_id']));
  data.citations.forEach((item, index) => requireTopic(item.topic_id, ['citations', index, 'topic_id']));
  data.published.forEach((item, index) => {
    if (item.topic_id) requireTopic(item.topic_id, ['published', index, 'topic_id']);
  });
  data.relationships.forEach((item, index) => {
    if (item.person_a_id === item.person_b_id) addIssue(['relationships', index], '人物不能与自己建立关系');
    if (!personIds.has(item.person_a_id)) addIssue(['relationships', index, 'person_a_id'], `引用了不存在的人物：${item.person_a_id}`);
    if (!personIds.has(item.person_b_id)) addIssue(['relationships', index, 'person_b_id'], `引用了不存在的人物：${item.person_b_id}`);
  });
  data.topics.forEach((topic, topicIndex) => {
    topic.tags?.forEach((tag, tagIndex) => {
      if (!tagIds.has(tag.id)) addIssue(['topics', topicIndex, 'tags', tagIndex, 'id'], `引用了不存在的标签：${tag.id}`);
    });
    topic.people?.forEach((person, personIndex) => {
      if (!personIds.has(person.id)) addIssue(['topics', topicIndex, 'people', personIndex, 'id'], `引用了不存在的人物：${person.id}`);
    });
  });

  const draftTopicIds = new Set<string>();
  data.drafts.forEach((draft, index) => {
    if (draftTopicIds.has(draft.topic_id)) addIssue(['drafts', index, 'topic_id'], `选题存在多份草稿：${draft.topic_id}`);
    draftTopicIds.add(draft.topic_id);
  });
  const tagNames = new Set<string>();
  data.tags.forEach((tag, index) => {
    const normalized = tag.name.trim().toLocaleLowerCase();
    if (tagNames.has(normalized)) addIssue(['tags', index, 'name'], `标签名称重复：${tag.name}`);
    tagNames.add(normalized);
  });
});

export type BackupValidationResult =
  | { success: true; data: BackupData }
  | { success: false; error: string };

export function validateBackupData(value: unknown): BackupValidationResult {
  const result = backupSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data as BackupData };
  const message = result.error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'backup';
    return `${path}: ${issue.message}`;
  }).join('；');
  return { success: false, error: message || '备份格式不正确' };
}

export function isBackupData(value: unknown): value is BackupData {
  return validateBackupData(value).success;
}
