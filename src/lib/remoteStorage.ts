import type {
  AppSettings,
  BootstrapData,
  BackupData,
  Draft,
  DraftCitation,
  DraftLoadResult,
  DraftRecoveryConflict,
  CitationInput,
  Person,
  PersonOption,
  PersonRelationship,
  PaginatedPeople,
  PaginatedPublishedVideos,
  PaginatedTags,
  PaginatedTopics,
  PublishedVideo,
  PublishPackageRecord,
  PublishPackageSaveInput,
  Source,
  Tag,
  TimelineEvent,
  Topic,
  TopicStatus,
  TopicWorkspaceData,
  TopicWorkspaceLoad,
  TodayFocusData,
  ShareSnapshot,
  PresenceState,
  QuickDropItem,
} from '../types';
import { authenticatedFetch, getAuthToken } from './auth';
import type { PublishedAnalyticsPayload } from './videoAnalytics';

const PENDING_DRAFTS_KEY = 'topic_kanban_pending_drafts_v3';
const LEGACY_PENDING_DRAFTS_KEY = 'topic_kanban_pending_drafts_v2';
let bootstrapPromise: Promise<BootstrapData> | null = null;
let bootstrapToken: string | null = null;
const draftUploadQueues = new Map<string, Promise<Draft>>();
const knownDraftVersions = new Map<string, number>();
const knownCitationSignatures = new Map<string, string>();

export interface BackupImportResult {
  success: boolean;
  error?: string;
}

export class DraftConflictError extends Error {
  current: Draft | null;

  constructor(current: Draft | null) {
    super('云端文案已被更新');
    this.name = 'DraftConflictError';
    this.current = current;
  }
}

export class PublishPackageConflictError extends Error {
  current: PublishPackageRecord | null;

  constructor(current: PublishPackageRecord | null) {
    super('发布包已被更新');
    this.name = 'PublishPackageConflictError';
    this.current = current;
  }
}

export function isRemoteStorage(): boolean {
  return getAuthToken()?.startsWith('v1.') === true;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(path, init);
  const data = await response.json().catch(() => null) as (T & { error?: string; current?: Draft | PublishPackageRecord | null }) | null;
  if (response.status === 409 && data?.error === 'DRAFT_CONFLICT') {
    throw new DraftConflictError((data.current as Draft | null) || null);
  }
  if (response.status === 409 && data?.error === 'PUBLISH_PACKAGE_CONFLICT') {
    throw new PublishPackageConflictError((data.current as PublishPackageRecord | null) || null);
  }
  if (!response.ok) throw new Error(data?.error || `请求失败 (${response.status})`);
  return data as T;
}

function jsonRequest(method: string, body: unknown, keepalive = false): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive,
  };
}

export function invalidateBootstrap(): void {
  bootstrapPromise = null;
}

export function fetchBootstrap(scope: 'full' | 'core' = 'full'): Promise<BootstrapData> {
  const cacheKey = `${getAuthToken() || ''}:${scope}`;
  const token = getAuthToken();
  if (cacheKey !== bootstrapToken) {
    bootstrapToken = cacheKey;
    bootstrapPromise = null;
  }
  if (!bootstrapPromise) {
    bootstrapPromise = apiRequest<BootstrapData>(scope === 'core' ? '/api/bootstrap?scope=core' : '/api/bootstrap').catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

export async function fetchTopics(): Promise<Topic[]> {
  return (await fetchBootstrap()).topics;
}

export interface TopicPageParams {
  scope?: 'active' | 'archived' | 'trash' | 'all';
  page?: number;
  page_size?: number;
  q?: string;
  status?: TopicStatus | string;
  priority?: string;
  tag_id?: string;
  person_id?: string;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export function fetchTopicPage(params: TopicPageParams): Promise<PaginatedTopics> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return apiRequest(`/api/topics?${query.toString()}`);
}

export function fetchTodayFocus(): Promise<TodayFocusData> {
  return apiRequest<TodayFocusData>('/api/today/focus');
}

export async function saveTopic(data: Partial<Topic> & { title?: string }): Promise<Topic> {
  const topic = data.id
    ? await apiRequest<Topic>(`/api/topics/${encodeURIComponent(data.id)}`, jsonRequest('PATCH', data))
    : await apiRequest<Topic>('/api/topics', jsonRequest('POST', data));
  invalidateBootstrap();
  return topic;
}

export async function updateTopicStatus(id: string, status: TopicStatus, sortOrder?: number): Promise<void> {
  await apiRequest(`/api/topics/${encodeURIComponent(id)}`, jsonRequest('PATCH', {
    status,
    ...(typeof sortOrder === 'number' ? { sort_order: sortOrder } : {}),
  }));
  invalidateBootstrap();
}

export async function reorderTopics(
  updates: Array<{ id: string; status: TopicStatus; sort_order: number }>
): Promise<void> {
  await apiRequest('/api/topics/reorder/batch', jsonRequest('PATCH', { updates }));
  invalidateBootstrap();
}

export async function deleteTopic(id: string): Promise<void> {
  await apiRequest(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE' });
  invalidateBootstrap();
}

export function fetchTrashedTopics(): Promise<Topic[]> {
  return apiRequest('/api/topics/trash');
}

export async function restoreTopic(id: string): Promise<Topic> {
  const topic = await apiRequest<Topic>(`/api/topics/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  invalidateBootstrap();
  return topic;
}

export async function permanentlyDeleteTopic(id: string): Promise<void> {
  await apiRequest(`/api/topics/${encodeURIComponent(id)}/permanent`, { method: 'DELETE' });
  invalidateBootstrap();
}

export async function permanentlyDeleteTopicsBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await apiRequest('/api/topics/batch/permanent', jsonRequest('POST', { ids }));
  invalidateBootstrap();
}

export async function emptyTrash(): Promise<void> {
  await apiRequest('/api/topics/trash/empty', jsonRequest('POST', {}));
  invalidateBootstrap();
}

export function fetchSourcesByTopicId(topicId: string): Promise<Source[]> {
  return apiRequest(`/api/topics/${encodeURIComponent(topicId)}/sources`);
}

export async function saveSource(data: Partial<Source> & { topic_id: string; title: string }): Promise<Source> {
  const source = data.id
    ? await apiRequest<Source>(`/api/sources/${encodeURIComponent(data.id)}`, jsonRequest('PATCH', data))
    : await apiRequest<Source>('/api/sources', jsonRequest('POST', data));
  invalidateBootstrap();
  return source;
}

export async function deleteSource(id: string): Promise<void> {
  await apiRequest(`/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
  invalidateBootstrap();
}

export function fetchTimelineByTopicId(topicId: string): Promise<TimelineEvent[]> {
  return apiRequest(`/api/topics/${encodeURIComponent(topicId)}/timeline`);
}

export async function saveTimelineEvent(
  data: Partial<TimelineEvent> & { topic_id: string; title: string }
): Promise<TimelineEvent> {
  const event = data.id
    ? apiRequest<TimelineEvent>(`/api/timeline/${encodeURIComponent(data.id)}`, jsonRequest('PATCH', data))
    : apiRequest<TimelineEvent>('/api/timeline', jsonRequest('POST', data));
  const saved = await event;
  invalidateBootstrap();
  return saved;
}

export async function reorderTimelineEvents(events: TimelineEvent[]): Promise<void> {
  await apiRequest('/api/timeline/reorder/batch', jsonRequest('PATCH', { events }));
}

export async function deleteTimelineEvent(id: string): Promise<void> {
  await apiRequest(`/api/timeline/${encodeURIComponent(id)}`, { method: 'DELETE' });
  invalidateBootstrap();
}

export async function fetchPeople(): Promise<Person[]> {
  return apiRequest<Person[]>('/api/people');
}

export function fetchPeoplePage(page: number, pageSize = 30, query = ''): Promise<PaginatedPeople> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (query.trim()) params.set('q', query.trim());
  return apiRequest<PaginatedPeople>(`/api/people/page?${params.toString()}`);
}

export function fetchPeopleOptions(): Promise<PersonOption[]> {
  return apiRequest<PersonOption[]>('/api/people/options');
}

export async function fetchPersonById(id: string): Promise<Person | null> {
  return (await fetchPeople()).find((person) => person.id === id) || null;
}

export async function savePerson(data: Partial<Person> & { name: string }): Promise<Person> {
  const person = data.id
    ? await apiRequest<Person>(`/api/people/${encodeURIComponent(data.id)}`, jsonRequest('PATCH', data))
    : await apiRequest<Person>('/api/people', jsonRequest('POST', data));
  invalidateBootstrap();
  return person;
}

export async function deletePerson(id: string): Promise<void> {
  await apiRequest(`/api/people/${encodeURIComponent(id)}`, { method: 'DELETE' });
  invalidateBootstrap();
}

export async function fetchRelationships(): Promise<PersonRelationship[]> {
  return apiRequest<PersonRelationship[]>('/api/relationships');
}

export async function saveRelationship(
  data: Partial<PersonRelationship> & {
    person_a_id: string;
    person_b_id: string;
    relationship: string;
  }
): Promise<PersonRelationship> {
  const relationship = data.id
    ? await apiRequest<PersonRelationship>(
      `/api/relationships/${encodeURIComponent(data.id)}`, jsonRequest('PATCH', data)
    )
    : await apiRequest<PersonRelationship>('/api/relationships', jsonRequest('POST', data));
  invalidateBootstrap();
  return relationship;
}

export async function deleteRelationship(id: string): Promise<void> {
  await apiRequest(`/api/relationships/${encodeURIComponent(id)}`, { method: 'DELETE' });
  invalidateBootstrap();
}

interface PendingDraftRecord {
  draft: Draft;
  base_version: number;
  cached_at: string;
}

function readPendingDrafts(): Record<string, PendingDraftRecord> {
  try {
    const current = JSON.parse(localStorage.getItem(PENDING_DRAFTS_KEY) || '{}') as Record<string, PendingDraftRecord>;
    if (Object.keys(current).length > 0) return current;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_PENDING_DRAFTS_KEY) || '{}') as Record<string, Draft>;
    return Object.fromEntries(Object.entries(legacy).map(([topicId, draft]) => [topicId, {
      draft,
      base_version: draft.version || 0,
      cached_at: draft.updated_at,
    }]));
  } catch {
    return {};
  }
}

function writePendingDraft(record: PendingDraftRecord | null, topicId: string): void {
  try {
    const pending = readPendingDrafts();
    if (record) pending[topicId] = record;
    else delete pending[topicId];
    localStorage.setItem(PENDING_DRAFTS_KEY, JSON.stringify(pending));
    localStorage.removeItem(LEGACY_PENDING_DRAFTS_KEY);
  } catch (error) {
    console.error('Draft recovery cache write failed', error);
  }
}

function clearPendingDraftIfCurrent(draft: Draft): void {
  const pending = readPendingDrafts()[draft.topic_id]?.draft;
  if (pending?.updated_at === draft.updated_at && pending.content_json === draft.content_json) {
    writePendingDraft(null, draft.topic_id);
  }
}

async function uploadDraft(draft: Draft, keepalive = false): Promise<Draft> {
  try {
    const saved = await apiRequest<Draft>(
      `/api/topics/${encodeURIComponent(draft.topic_id)}/draft`,
      jsonRequest('PUT', {
        ...draft,
        base_version: knownDraftVersions.get(draft.topic_id) ?? draft.version ?? 0,
      }, keepalive)
    );
    knownDraftVersions.set(draft.topic_id, saved.version);
    clearPendingDraftIfCurrent(draft);
    invalidateBootstrap();
    return saved;
  } catch (error) {
    if (error instanceof DraftConflictError) {
      knownDraftVersions.set(draft.topic_id, error.current?.version || 0);
    }
    throw error;
  }
}

function enqueueDraftUpload(draft: Draft, keepalive = false): Promise<Draft> {
  const previous = draftUploadQueues.get(draft.topic_id);
  const upload = previous
    ? previous.catch(() => undefined).then(() => uploadDraft(draft, keepalive))
    : uploadDraft(draft, keepalive);
  draftUploadQueues.set(draft.topic_id, upload);
  void upload.finally(() => {
    if (draftUploadQueues.get(draft.topic_id) === upload) {
      draftUploadQueues.delete(draft.topic_id);
    }
  }).catch(() => undefined);
  return upload;
}

function mergePendingDraft(topicId: string, serverDraft: Draft | null): DraftLoadResult {
  knownDraftVersions.set(topicId, serverDraft?.version || 0);
  const pending = readPendingDrafts()[topicId];
  if (pending) {
    if (pending.base_version !== (serverDraft?.version || 0)) {
      return {
        draft: serverDraft,
        conflict: { local: pending.draft, remote: serverDraft, base_version: pending.base_version },
      };
    }
    return { draft: pending.draft, conflict: null };
  }
  return { draft: serverDraft, conflict: null };
}

export async function fetchDraftByTopicId(topicId: string): Promise<DraftLoadResult> {
  const serverDraft = await apiRequest<Draft | null>(`/api/topics/${encodeURIComponent(topicId)}/draft`);
  return mergePendingDraft(topicId, serverDraft);
}

export async function fetchTopicWorkspace(topicId: string): Promise<TopicWorkspaceLoad> {
  const data = await apiRequest<TopicWorkspaceData>(`/api/topics/${encodeURIComponent(topicId)}/workspace`);
  knownCitationSignatures.set(topicId, data.citations.map((citation) => citation.id).sort().join(','));
  return { ...data, draft: mergePendingDraft(topicId, data.draft) };
}

export function savePublishPackage(
  topicId: string,
  input: PublishPackageSaveInput
): Promise<PublishPackageRecord> {
  return apiRequest<PublishPackageRecord>(
    `/api/topics/${encodeURIComponent(topicId)}/publish-package`,
    jsonRequest('PUT', input)
  );
}

export async function resolveDraftRecovery(
  topicId: string,
  conflict: DraftRecoveryConflict,
  choice: 'local' | 'remote'
): Promise<Draft | null> {
  if (choice === 'remote') {
    writePendingDraft(null, topicId);
    knownDraftVersions.set(topicId, conflict.remote?.version || 0);
    return conflict.remote;
  }
  const baseVersion = conflict.remote?.version || 0;
  knownDraftVersions.set(topicId, baseVersion);
  writePendingDraft({
    draft: { ...conflict.local, version: baseVersion },
    base_version: baseVersion,
    cached_at: new Date().toISOString(),
  }, topicId);
  return enqueueDraftUpload({ ...conflict.local, version: baseVersion });
}

export function fetchDraftCitations(topicId: string): Promise<DraftCitation[]> {
  return apiRequest<DraftCitation[]>(`/api/topics/${encodeURIComponent(topicId)}/citations`).then((citations) => {
    knownCitationSignatures.set(topicId, citations.map((citation) => citation.id).sort().join(','));
    return citations;
  });
}

export function saveDraftCitation(topicId: string, input: CitationInput): Promise<DraftCitation> {
  return apiRequest(`/api/topics/${encodeURIComponent(topicId)}/citations`, jsonRequest('POST', input));
}

function extractCitationIds(contentJson: string): string[] {
  try {
    const ids = new Set<string>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const node = value as { marks?: Array<{ type?: string; attrs?: { citationId?: unknown } }>; content?: unknown[] };
      node.marks?.forEach((mark) => {
        if (mark.type === 'citation' && typeof mark.attrs?.citationId === 'string') ids.add(mark.attrs.citationId);
      });
      node.content?.forEach(visit);
    };
    visit(JSON.parse(contentJson));
    return [...ids].sort();
  } catch {
    return [];
  }
}

async function syncActiveCitations(topicId: string, contentJson: string): Promise<void> {
  try {
    const activeIds = extractCitationIds(contentJson);
    const signature = activeIds.join(',');
    if (knownCitationSignatures.get(topicId) === signature) return;
    await apiRequest(`/api/topics/${encodeURIComponent(topicId)}/citations/active`, jsonRequest('PUT', {
      active_ids: activeIds,
    }));
    knownCitationSignatures.set(topicId, signature);
  } catch (error) {
    console.warn('同步活跃引用失败 (不影响正文保存):', error);
  }
}

export async function saveDraft(
  topicId: string,
  contentHtml: string,
  contentJson: string,
  wordCount: number,
  title = ''
): Promise<Draft> {
  const draft = cacheDraftLocally(topicId, contentHtml, contentJson, wordCount, title);
  const saved = await enqueueDraftUpload(draft);
  await syncActiveCitations(topicId, contentJson);
  return saved;
}

export function cacheDraftLocally(
  topicId: string,
  contentHtml: string,
  contentJson: string,
  wordCount: number,
  title = ''
): Draft {
  const previous = readPendingDrafts()[topicId];
  const baseVersion = knownDraftVersions.get(topicId) ?? previous?.base_version ?? 0;
  const draft: Draft = {
    id: previous?.draft.id || `pending-${topicId}`,
    topic_id: topicId,
    title,
    content_html: contentHtml,
    content_json: contentJson,
    word_count: wordCount,
    version: baseVersion,
    updated_at: new Date().toISOString(),
  };
  writePendingDraft({ draft, base_version: baseVersion, cached_at: draft.updated_at }, topicId);
  return draft;
}

export function saveDraftImmediately(
  topicId: string,
  contentHtml: string,
  contentJson: string,
  wordCount: number,
  title = ''
): Draft {
  const draft = cacheDraftLocally(topicId, contentHtml, contentJson, wordCount, title);
  const draftBytes = new TextEncoder().encode(`${draft.content_json || ''}${draft.content_html || ''}`).byteLength;
  // 浏览器对 fetch({ keepalive: true }) 限制 payload 通常为 64KB (65536 bytes)
  const useKeepalive = draftBytes < 60000;
  void enqueueDraftUpload(draft, useKeepalive).catch(() => undefined);
  return draft;
}

export async function fetchTags(): Promise<Tag[]> {
  return apiRequest<Tag[]>('/api/tags');
}

export function fetchTagsPage(page: number, pageSize = 30, query = ''): Promise<PaginatedTags> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (query.trim()) params.set('q', query.trim());
  return apiRequest<PaginatedTags>(`/api/tags/page?${params.toString()}`);
}

export async function saveTag(data: Omit<Tag, 'id'> & { id?: string }): Promise<Tag> {
  const tag = data.id
    ? await apiRequest<Tag>(`/api/tags/${encodeURIComponent(data.id)}`, jsonRequest('PATCH', data))
    : await apiRequest<Tag>('/api/tags', jsonRequest('POST', data));
  invalidateBootstrap();
  return tag;
}

export async function deleteTag(id: string): Promise<void> {
  await apiRequest(`/api/tags/${encodeURIComponent(id)}`, { method: 'DELETE' });
  invalidateBootstrap();
}

export async function fetchPublishedVideos(): Promise<PublishedVideo[]> {
  return apiRequest<PublishedVideo[]>('/api/published');
}

export function fetchPublishedVideoPage(page: number, pageSize = 30): Promise<PaginatedPublishedVideos> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return apiRequest<PaginatedPublishedVideos>(`/api/published/page?${params.toString()}`);
}

export function fetchPublishedAnalytics(
  range: 'all' | '90d' | 'year' = 'all',
  page = 1,
  pageSize = 30,
): Promise<PublishedAnalyticsPayload> {
  const params = new URLSearchParams({ range, page: String(page), page_size: String(pageSize) });
  return apiRequest<PublishedAnalyticsPayload>(`/api/published/analytics?${params.toString()}`);
}

export async function savePublishedVideo(
  data: Partial<PublishedVideo> & { title: string; topic_id?: string | null }
): Promise<PublishedVideo> {
  const video = data.id
    ? await apiRequest<PublishedVideo>(`/api/published/${encodeURIComponent(data.id)}`, jsonRequest('PATCH', data))
    : await apiRequest<PublishedVideo>('/api/published', jsonRequest('POST', data));
  invalidateBootstrap();
  return video;
}

export async function deletePublishedVideo(id: string): Promise<void> {
  await apiRequest(`/api/published/${encodeURIComponent(id)}`, { method: 'DELETE' });
  invalidateBootstrap();
}

export async function fetchSettings(): Promise<AppSettings> {
  return apiRequest<AppSettings>('/api/settings');
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const saved = await apiRequest<AppSettings>('/api/settings', jsonRequest('PUT', settings));
  invalidateBootstrap();
  return saved;
}

export async function exportBackupData(): Promise<string> {
  const { data } = await apiRequest<{ data: unknown }>('/api/backup');
  return JSON.stringify(data, null, 2);
}

// Convert HTML to clean readable Markdown text for export
export function htmlToCleanMarkdown(html: string): string {
  if (!html) return '';
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

export async function exportScriptsMarkdown(): Promise<string> {
  const { data } = await apiRequest<{ data: BackupData }>('/api/backup');
  const topics = data.topics || [];
  const drafts = data.drafts || [];
  const topicMap = new Map(topics.map((t) => [t.id, t]));
  const readingSpeed = data.settings?.reading_speed || 280;

  const lines: string[] = [];
  lines.push(`# 选题文案全量归档合辑 (Markdown Archive)`);
  lines.push(`> 导出时间：${new Date().toLocaleString()} | 语速基准：${readingSpeed} 字/分钟 | 总选题数：${topics.length}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Filter drafts with meaningful content or topics with drafts
  const draftsWithTopic = drafts.filter((d) => d.content_html || d.content_json);

  if (draftsWithTopic.length === 0) {
    lines.push(`*暂无已撰写的文案草稿记录。*`);
    return lines.join('\n');
  }

  draftsWithTopic.forEach((draft, idx) => {
    const topic = topicMap.get(draft.topic_id);
    const title = draft.title || topic?.title || `未命名文案 ${idx + 1}`;
    const wordCount = draft.word_count || 0;
    const estMinutes = (wordCount / readingSpeed).toFixed(1);
    const mdBody = htmlToCleanMarkdown(draft.content_html);

    lines.push(`## 【第 ${idx + 1} 篇】${title}`);
    if (topic) {
      lines.push(`- **阶段状态**：${topic.status} | **优先级**：${topic.priority || 'none'}`);
      if (topic.hook) lines.push(`- **核心反差 / 钩子**：${topic.hook}`);
      if (topic.summary) lines.push(`- **故事主线脉络**：${topic.summary}`);
    }
    lines.push(`- **文案规模**：约 ${wordCount.toLocaleString()} 字（预估解说时长约 ${estMinutes} 分钟）`);
    lines.push(`- **更新时间**：${draft.updated_at || '未知'}`);
    lines.push(``);
    lines.push(`### 正文内容`);
    lines.push(``);
    lines.push(mdBody || '*(草稿正文为空)*');
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  });

  return lines.join('\n');
}

export function exportSingleTopicMarkdown(
  topic: Topic,
  workspaceData: {
    sources?: Source[];
    timeline?: TimelineEvent[];
    draft?: Draft | null;
  },
  readingSpeed = 280
): string {
  const lines: string[] = [];
  const now = new Date().toLocaleString();
  const draft = workspaceData.draft;
  const wordCount = draft?.word_count || topic.draft_word_count || 0;
  const estMinutes = (wordCount / readingSpeed).toFixed(1);

  lines.push(`# 🎬 【选题档案】${topic.title}`);
  lines.push(`> 导出时间：${now} | 阶段状态：${topic.status} | 优先级：${topic.priority || 'none'} | 语速基准：${readingSpeed} 字/分`);
  lines.push(``);

  // 1. 核心定位与反差设定
  lines.push(`## 一、核心定位与故事脉络`);
  if (topic.hook) lines.push(`- **核心反差 / 钩子 (Hook)**：${topic.hook}`);
  if (topic.summary) lines.push(`- **故事主线脉络 (Summary)**：${topic.summary}`);
  if (topic.why_now) lines.push(`- **为什么是现在 (Why Now)**：${topic.why_now}`);
  if (topic.next_action) lines.push(`- **当前核心行动 (Next Action)**：${topic.next_action}`);
  if (topic.tags && topic.tags.length > 0) {
    lines.push(`- **创作赛道 / 标签**：${topic.tags.map((t) => `#${t.name}`).join(' ')}`);
  }
  if (topic.people && topic.people.length > 0) {
    lines.push(`- **核心关联人物**：${topic.people.map((p) => p.name).join('、')}`);
  }
  lines.push(``);

  // 2. 5 维故事评估
  const totalScore =
    (topic.score_character || 0) +
    (topic.score_conflict || 0) +
    (topic.score_contrast || 0) +
    (topic.score_material || 0) +
    (topic.score_story || 0);
  lines.push(`## 二、5 维故事评估 (总分：${totalScore}/10)`);
  lines.push(`| 评估维度 | 得分 (0-2) | 衡量标准 |`);
  lines.push(`| :--- | :--- | :--- |`);
  lines.push(`| 人物张力 | ${topic.score_character || 0} / 2 | 性格鲜明度、行为动机与极端特质 |`);
  lines.push(`| 戏剧冲突 | ${topic.score_conflict || 0} / 2 | 利益对抗、观念撕裂与多方博弈 |`);
  lines.push(`| 荒诞反差 | ${topic.score_contrast || 0} / 2 | 预期违背、荒诞现实与黑色幽默 |`);
  lines.push(`| 素材完整度 | ${topic.score_material || 0} / 2 | 视频录屏、录音证据与一手图文链条 |`);
  lines.push(`| 主线成立度 | ${topic.score_story || 0} / 2 | 起承转合、因果闭环与叙事立意 |`);
  lines.push(``);

  // 3. 故事时间线
  const timeline = workspaceData.timeline || [];
  if (timeline.length > 0) {
    lines.push(`## 三、故事时间线 (${timeline.length} 个关键节点)`);
    timeline.forEach((event, index) => {
      const dateStr = event.event_date ? `【${event.event_date}】` : '';
      const statusIcon = event.verification_status === 'confirmed' ? '✅' : event.verification_status === 'rejected' ? '❌' : '⏳';
      lines.push(`${index + 1}. ${statusIcon} **${dateStr}${event.title}**`);
      if (event.description) {
        lines.push(`   > ${event.description}`);
      }
    });
    lines.push(``);
  }

  // 4. 资料与素材证据链
  const sources = workspaceData.sources || [];
  if (sources.length > 0) {
    lines.push(`## 四、资料证据链 (${sources.length} 条资料)`);
    sources.forEach((src, index) => {
      const statusStr = src.verification_status === 'confirmed' ? '已核实' : src.verification_status === 'rejected' ? '存疑/被推翻' : '待考证';
      lines.push(`### ${index + 1}. ${src.title} (${statusStr})`);
      if (src.platform || src.author) {
        lines.push(`- **来源平台/作者**：${src.platform} ${src.author ? `@${src.author}` : ''}`);
      }
      if (src.url) {
        lines.push(`- **原始链接**：${src.url}`);
      }
      if (src.content) {
        lines.push(`- **摘录内容**：\n> ${src.content}`);
      }
      if (src.notes) {
        lines.push(`- **考证笔记**：${src.notes}`);
      }
      lines.push(``);
    });
  }

  // 5. 解说文案正文
  lines.push(`## 五、解说文案草稿正文`);
  lines.push(`- **文案字数**：约 ${wordCount.toLocaleString()} 字（预估解说时长约 ${estMinutes} 分钟）`);
  lines.push(`- **最后更新时间**：${draft?.updated_at || topic.updated_at || '未知'}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  if (draft?.content_html) {
    lines.push(htmlToCleanMarkdown(draft.content_html));
  } else {
    lines.push(`*(暂无撰写的文案正文)*`);
  }
  lines.push(``);

  return lines.join('\n');
}

export async function importBackupData(jsonString: string): Promise<BackupImportResult> {
  try {
    const data = JSON.parse(jsonString) as unknown;
    await apiRequest('/api/backup', jsonRequest('PUT', { data }));
    invalidateBootstrap();
    return { success: true };
  } catch (error) {
    console.error('Remote import failed', error);
    return { success: false, error: error instanceof Error ? error.message : '导入失败' };
  }
}

/* =========================================================================
   KV Feature 1: Public Review Share (审稿分享)
   ========================================================================= */

export async function createShareSnapshot(
  topicId: string,
  ttlSeconds = 86400
): Promise<{ token: string; url: string; expires_at: string; snapshot: ShareSnapshot }> {
  return apiRequest(`/api/topics/${encodeURIComponent(topicId)}/share`, jsonRequest('POST', {
    ttl_seconds: ttlSeconds,
  }));
}

export async function fetchPublicShareSnapshot(token: string): Promise<ShareSnapshot> {
  const response = await fetch(`/api/public/share/${encodeURIComponent(token)}`);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errData.error || '审稿链接已过期或不存在');
  }
  return response.json();
}

export async function deleteShareSnapshot(topicId: string, token: string): Promise<void> {
  await apiRequest(`/api/topics/${encodeURIComponent(topicId)}/share/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
}

/* =========================================================================
   KV Feature 2: Soft Presence & Edit Lock (在线心跳)
   ========================================================================= */

export async function reportPresenceHeartbeat(
  topicId: string,
  clientId: string,
  deviceName?: string
): Promise<PresenceState> {
  return apiRequest(`/api/topics/${encodeURIComponent(topicId)}/presence`, jsonRequest('POST', {
    client_id: clientId,
    device_name: deviceName,
  }));
}

export async function releasePresenceHeartbeat(
  topicId: string,
  clientId: string
): Promise<void> {
  await apiRequest(`/api/topics/${encodeURIComponent(topicId)}/presence?client_id=${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
  }).catch(() => {});
}

/* =========================================================================
   KV Feature 3: Quick Drop (灵感快投箱)
   ========================================================================= */

export async function fetchQuickDrops(): Promise<QuickDropItem[]> {
  const data = await apiRequest<{ items: QuickDropItem[] }>('/api/inbox/quick-drops');
  return data.items || [];
}

export async function deleteQuickDrop(id: string): Promise<void> {
  await apiRequest(`/api/inbox/quick-drops/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function submitQuickDrop(
  content: string,
  url?: string,
  source?: string
): Promise<{ success: boolean; item: QuickDropItem }> {
  return apiRequest('/api/inbox/quick-drop', jsonRequest('POST', {
    content,
    url,
    source,
  }));
}
