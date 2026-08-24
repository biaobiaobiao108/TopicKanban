export const TOPIC_STATUSES = [
  'inbox',
  'approved',
  'scripting',
  'production',
  'published',
  'icebox',
] as const;

export type TopicStatus = typeof TOPIC_STATUSES[number];

export function isTopicStatus(value: unknown): value is TopicStatus {
  return typeof value === 'string' && TOPIC_STATUSES.includes(value as TopicStatus);
}

export type Priority = 'high' | 'medium' | 'low' | 'none';

export type VerificationStatus = 'confirmed' | 'unverified' | 'rejected';

export type DatePrecision = 'exact' | 'year_month' | 'year' | 'unknown';

export type PlatformType =
  | 'bilibili'
  | 'douyin'
  | 'kuaishou'
  | 'weibo'
  | 'xiaohongshu'
  | 'wechat'
  | 'zhihu'
  | 'youtube'
  | 'news'
  | 'live'
  | 'other';

export interface Topic {
  id: string;
  title: string;
  summary: string;
  hook: string;
  storyline: string;
  why_now: string;
  status: TopicStatus;
  priority: Priority;
  next_action: string;
  next_action_updated_at?: string | null;
  next_action_deferred_until?: string | null;
  score_character: number;
  score_conflict: number;
  score_contrast: number;
  score_material: number;
  score_story: number;
  is_pinned: number; // 0 or 1
  sort_order: number;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  deleted_at?: string | null;
  
  // Relations / joined
  tags?: Tag[];
  people?: Person[];
  sources_count?: number;
  verified_sources_count?: number;
  timeline_count?: number;
  draft_word_count?: number;
}

export interface Source {
  id: string;
  topic_id: string;
  title: string;
  content: string;
  url: string;
  platform: PlatformType;
  author: string;
  published_at: string;
  verification_status: VerificationStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;
  topic_id: string;
  title: string;
  description: string;
  event_date: string;
  date_precision: DatePrecision;
  verification_status: VerificationStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  person_ids?: string[];
  contrast_tag?: string;
}

export interface Person {
  id: string;
  name: string;
  aliases: string;
  avatar_url: string;
  description: string;
  identity: string;
  platform_accounts: string;
  quotes: string;
  notes: string;
  created_at: string;
  updated_at: string;
  related_topics_count?: number;
}

export interface PersonRelationship {
  id: string;
  person_a_id: string;
  person_b_id: string;
  relationship: string;
  description: string;
  created_at: string;
  person_a_name?: string;
  person_b_name?: string;
}

export interface TopicPerson {
  id: string;
  topic_id: string;
  person_id: string;
  role: string;
}

export interface Draft {
  id: string;
  topic_id: string;
  title: string;
  content_json: string;
  content_html: string;
  word_count: number;
  version: number;
  updated_at: string;
}

export interface DraftRecoveryConflict {
  local: Draft;
  remote: Draft | null;
  base_version: number;
}

export interface DraftLoadResult {
  draft: Draft | null;
  conflict: DraftRecoveryConflict | null;
}

export interface TopicWorkspaceData {
  sources: Source[];
  timeline: TimelineEvent[];
  draft: Draft | null;
  citations: DraftCitation[];
}

export interface TopicWorkspaceLoad extends Omit<TopicWorkspaceData, 'draft'> {
  draft: DraftLoadResult;
}

export type CitationReferenceType = 'source' | 'timeline' | 'person' | 'outline';

export interface DraftCitation {
  id: string;
  topic_id: string;
  reference_type: CitationReferenceType;
  reference_id: string;
  reference_title: string;
  reference_snapshot: string;
  quoted_text: string;
  verification_status: VerificationStatus;
  created_at: string;
}

export type CitationInput = Omit<DraftCitation, 'id' | 'topic_id' | 'created_at'>;

export interface Tag {
  id: string;
  name: string;
  color?: string;
}

export interface PublishedVideo {
  id: string;
  topic_id: string | null;
  title: string;
  url: string;
  bvid: string;
  published_at: string;
  views: number;
  likes: number;
  coins: number;
  favorites: number;
  comments: number;
  notes: string;
  updated_at: string;
  topic_title?: string | null;
}

export const APP_THEMES = [
  'nordic_frost',
  'parisian_dawn',
  'midnight_obsidian',
  'kyoto_zen',
  'warm_paper',
  'light',
  'dark',
  'system',
] as const;

export type AppTheme = typeof APP_THEMES[number];
export type EditorFontSize = 'compact' | 'standard' | 'large';
export type EditorLineHeight = 'normal' | 'relaxed' | 'loose';

export const DEFAULT_VOICEOVER_CUES: string[] = [
  '停顿 1s',
  '停顿 2s',
  '重音强调',
  '反讽语气',
  '激昂加速',
  '低沉缓速',
  'BGM 起',
  'BGM 停',
];

export interface AppSettings {
  reading_speed: number; // characters per minute (default 280)
  theme: AppTheme;
  editor_font_size?: EditorFontSize;
  editor_line_height?: EditorLineHeight;
  typewriter_mode_default?: boolean;
  stale_action_days?: number;
  default_share_ttl_days?: number;
  reviewer_branding?: string;
  public_base_url?: string; // Reverse proxy or custom public domain e.g. "https://kanban.example.com"
  voiceover_cues?: string[]; // Custom cue tags for voiceover teleprompter
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  reading_speed: 280,
  theme: 'light',
  editor_font_size: 'standard',
  editor_line_height: 'relaxed',
  typewriter_mode_default: false,
  stale_action_days: 5,
  default_share_ttl_days: 3,
  reviewer_branding: '',
  public_base_url: '',
  voiceover_cues: DEFAULT_VOICEOVER_CUES,
};

export interface BootstrapData {
  topics: Topic[];
  people: Person[];
  relationships: PersonRelationship[];
  published: PublishedVideo[];
  tags: Tag[];
  settings: AppSettings;
}

export interface PaginatedTopics {
  items: Topic[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface BackupData {
  version: string;
  export_at: string;
  topics: Topic[];
  sources: Source[];
  timeline: TimelineEvent[];
  people: Person[];
  relationships: PersonRelationship[];
  drafts: Draft[];
  citations: DraftCitation[];
  tags: Tag[];
  published: PublishedVideo[];
  settings: AppSettings;
}

export interface ShareSnapshot {
  token: string;
  topic_id: string;
  topic_title: string;
  hook?: string;
  summary?: string;
  storyline?: string;
  content_html: string;
  word_count: number;
  reading_speed: number;
  reviewer_branding?: string;
  created_at: string;
  expires_at: string;
}

export interface PresenceState {
  is_locked: boolean;
  active_editor?: {
    client_id: string;
    device_name: string;
    updated_at: string;
  };
}

export interface QuickDropItem {
  id: string;
  content: string;
  url?: string;
  source?: string;
  created_at: string;
}
