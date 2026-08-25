import type {
  Draft,
  DraftCitation,
  Person,
  PublishChapter,
  PublishCheck,
  PublishPackage,
  PublishSourceCredit,
  Source,
  TimelineEvent,
  Topic,
} from '../types';
import { getCitationHealth } from './citations';
import { countValidCharacters } from './textMetrics';
import { sanitizeExternalHttpUrl } from './urlSafety';

const PLATFORM_LABELS: Record<Source['platform'], string> = {
  bilibili: '哔哩哔哩',
  douyin: '抖音',
  kuaishou: '快手',
  weibo: '微博',
  xiaohongshu: '小红书',
  wechat: '微信公众号',
  zhihu: '知乎',
  youtube: 'YouTube',
  news: '新闻媒体',
  live: '直播',
  other: '其他',
};

interface JsonNode {
  type?: string;
  text?: string;
  attrs?: { level?: number };
  marks?: Array<{ type?: string; attrs?: { citationId?: unknown } }>;
  content?: JsonNode[];
}

interface ScriptSection {
  title: string;
  charCount: number;
}

export interface PublishPackageBuildInput {
  topic: Topic;
  draft: Draft | null;
  sources: Source[];
  timeline: TimelineEvent[];
  citations: DraftCitation[];
  people?: Person[];
  readingSpeed?: number;
  draftConflict?: boolean;
}

export interface PublishPackageEditableFields {
  title: string;
  title_candidates: string[];
  cover_text: string;
  description: string;
  tags: string[];
  chapters: PublishChapter[];
  pinned_comment: string;
  source_credits: PublishSourceCredit[];
}

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

function jsonRoot(contentJson: string): JsonNode | null {
  if (!contentJson) return null;
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as JsonNode : null;
  } catch {
    return null;
  }
}

function extractSectionsFromJson(contentJson: string): ScriptSection[] {
  const root = jsonRoot(contentJson);
  if (!root) return [];

  const sections: ScriptSection[] = [];
  let current: ScriptSection | null = null;
  const visit = (node: JsonNode) => {
    if (node.type === 'heading') {
      const level = Number(node.attrs?.level || 0);
      if (level <= 2 && level >= 1) {
        current = { title: normalizeText(node.content?.map((child) => child.text || '').join('')) || '未命名章节', charCount: 0 };
        sections.push(current);
      }
      return;
    }

    if (current && node.type === 'text' && node.text) {
      current.charCount += countValidCharacters(node.text);
    }
    node.content?.forEach(visit);
  };

  visit(root);
  return sections;
}

function extractSectionsFromHtml(contentHtml: string): ScriptSection[] {
  if (!contentHtml) return [];
  const headingPattern = /<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const matches = Array.from(contentHtml.matchAll(headingPattern));
  return matches.map((match, index) => {
    const headingEnd = (match.index || 0) + match[0].length;
    const nextHeadingStart = matches[index + 1]?.index ?? contentHtml.length;
    const body = contentHtml.slice(headingEnd, nextHeadingStart);
    return {
      title: stripHtml(match[2]).replace(/\s+/g, ' ').trim() || '未命名章节',
      charCount: countValidCharacters(stripHtml(body)),
    };
  });
}

function formatTimestamp(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sectionsToChapters(sections: ScriptSection[], readingSpeed: number): PublishChapter[] {
  const speed = readingSpeed > 0 ? readingSpeed : 280;
  let elapsedSeconds = 0;
  return sections.map((section, index) => {
    const chapter: PublishChapter = {
      id: `chapter-${index + 1}`,
      title: section.title,
      time: formatTimestamp(elapsedSeconds),
      start_seconds: Math.round(elapsedSeconds),
      source: 'script-heading',
    };
    elapsedSeconds += Math.round((section.charCount / speed) * 60);
    return chapter;
  });
}

function extractChapters(draft: Draft | null, readingSpeed: number): PublishChapter[] {
  if (!draft) return [];
  const jsonSections = extractSectionsFromJson(draft.content_json);
  const sections = jsonSections.length > 0
    ? jsonSections
    : extractSectionsFromHtml(draft.content_html);
  return sectionsToChapters(sections, readingSpeed);
}

function extractAllJsonText(contentJson: string): string {
  const root = jsonRoot(contentJson);
  if (!root) return '';
  const parts: string[] = [];
  const visit = (node: JsonNode) => {
    if (node.text) parts.push(node.text);
    node.content?.forEach(visit);
  };
  visit(root);
  return parts.join('');
}

function getWordCount(draft: Draft | null): number {
  if (!draft) return 0;
  if (draft.word_count > 0) return draft.word_count;
  return countValidCharacters(stripHtml(draft.content_html) || extractAllJsonText(draft.content_json));
}

function getActiveCitations(draft: Draft | null, citations: DraftCitation[]): DraftCitation[] {
  if (!draft?.content_json) return citations;
  const root = jsonRoot(draft.content_json);
  if (!root) return citations;
  const activeIds = new Set<string>();
  const visit = (node: JsonNode) => {
    node.marks?.forEach((mark) => {
      if (mark.type === 'citation' && typeof mark.attrs?.citationId === 'string') {
        activeIds.add(mark.attrs.citationId);
      }
    });
    node.content?.forEach(visit);
  };
  visit(root);
  return citations.filter((citation) => activeIds.has(citation.id));
}

function buildDescription(topic: Topic, people: Person[]): string {
  const parts = [normalizeText(topic.summary)];
  if (normalizeText(topic.why_now)) parts.push(`为什么是现在：${normalizeText(topic.why_now)}`);
  const names = people.map((person) => normalizeText(person.name)).filter(Boolean);
  if (names.length > 0) parts.push(`本期人物：${names.join('、')}`);
  return parts.filter(Boolean).join('\n\n');
}

function buildSourceCredits(sources: Source[]): PublishSourceCredit[] {
  return sources.map((source) => ({
    id: source.id,
    title: normalizeText(source.title) || '未命名资料',
    author: normalizeText(source.author),
    platform: source.platform,
    platform_label: PLATFORM_LABELS[source.platform] || '其他',
    url: sanitizeExternalHttpUrl(source.url),
    verification_status: source.verification_status,
    included: true,
  }));
}

function getLevelCounts(checks: PublishCheck[]): { blockers: number; warnings: number } {
  return {
    blockers: checks.filter((check) => check.level === 'blocker').length,
    warnings: checks.filter((check) => check.level === 'warning').length,
  };
}

export function evaluatePublishChecks(
  input: PublishPackageBuildInput & { editable: PublishPackageEditableFields; estimatedDurationSeconds?: number }
): PublishCheck[] {
  const checks: PublishCheck[] = [];
  const { topic, draft, sources, timeline, citations, editable, draftConflict = false } = input;
  const estimatedDurationSeconds = input.estimatedDurationSeconds ?? Math.round((getWordCount(draft) / (input.readingSpeed || 280)) * 60);

  if (!normalizeText(editable.title)) {
    checks.push({ id: 'title-required', level: 'blocker', label: '标题为空', detail: '请补充一个投稿标题。' });
  }
  if (!draft || getWordCount(draft) <= 0) {
    checks.push({ id: 'draft-required', level: 'blocker', label: '文案正文为空', detail: '发布包需要基于最新文案生成章节和时长。' });
  }
  if (draftConflict) {
    checks.push({ id: 'draft-conflict', level: 'blocker', label: '草稿存在版本冲突', detail: '请先选择要保留的本地或云端版本。' });
  }
  if (!normalizeText(editable.description)) {
    checks.push({ id: 'description-empty', level: 'warning', label: '简介为空', detail: 'B站投稿时仍需要手动补充视频简介。' });
  }
  if (editable.tags.length === 0) {
    checks.push({ id: 'tags-empty', level: 'warning', label: '尚未设置标签', detail: '可以从现有选题标签中选择，或临时添加投稿标签。' });
  }
  if (editable.chapters.length === 0) {
    checks.push({ id: 'chapters-empty', level: 'warning', label: '没有自动章节', detail: '当前文案没有 H1/H2 标题，可以手动添加章节。' });
  }

  const activeCitations = getActiveCitations(draft, citations);
  const citationHealth = getCitationHealth(activeCitations, { topic, sources, timeline });
  const missingCitationCount = citationHealth.states.filter((state) => state.missing).length;
  if (missingCitationCount > 0) {
    checks.push({ id: 'citation-missing', level: 'warning', label: '存在失效引用', detail: `${missingCitationCount} 条正文引用已找不到对应资料。` });
  }
  const unverifiedCitationCount = citationHealth.states.filter((state) => state.unverified).length;
  if (unverifiedCitationCount > 0) {
    checks.push({ id: 'citation-unverified', level: 'warning', label: '存在待核实引用', detail: `${unverifiedCitationCount} 条正文引用的资料尚未确认。` });
  }
  const staleCitationCount = citationHealth.states.filter((state) => state.stale && !state.missing).length;
  if (staleCitationCount > 0) {
    checks.push({ id: 'citation-stale', level: 'warning', label: '引用内容已变化', detail: `${staleCitationCount} 条正文引用与当前资料快照不一致。` });
  }

  const invalidUrlCount = sources.filter((source) => normalizeText(source.url) && !sanitizeExternalHttpUrl(source.url)).length;
  if (invalidUrlCount > 0) {
    checks.push({ id: 'source-url-invalid', level: 'warning', label: '存在不可导出的来源链接', detail: `${invalidUrlCount} 条来源链接不是安全的 HTTP(S) 地址，已从发布包链接中排除。` });
  }
  const pendingTimelineCount = timeline.filter((event) => event.verification_status !== 'confirmed').length;
  if (pendingTimelineCount > 0) {
    checks.push({ id: 'timeline-unverified', level: 'warning', label: '时间线仍有待核实节点', detail: `${pendingTimelineCount} 个时间线节点尚未确认。` });
  }
  const invalidChapterOrder = editable.chapters.some((chapter, index, all) => index > 0 && chapter.start_seconds < all[index - 1].start_seconds);
  if (invalidChapterOrder) {
    checks.push({ id: 'chapter-order', level: 'warning', label: '章节时间顺序不连续', detail: '请检查章节时间，确保后一个章节不早于前一个章节。' });
  }
  if (draft && getWordCount(draft) > 0 && estimatedDurationSeconds <= 0) {
    checks.push({ id: 'duration-unavailable', level: 'warning', label: '无法估算文案时长', detail: '请检查文案字数或语速设置。' });
  }

  const levelCounts = getLevelCounts(checks);
  if (levelCounts.blockers === 0 && levelCounts.warnings === 0) {
    checks.push({ id: 'ready', level: 'info', label: '发布内容已具备', detail: '可以复制或导出发布包，再到 B 站投稿后台完成最后确认。' });
  } else if (estimatedDurationSeconds > 0) {
    checks.push({ id: 'duration', level: 'info', label: '预计解说时长', detail: `约 ${formatDuration(estimatedDurationSeconds)}，仅供录制和剪辑估算。` });
  }

  return checks;
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (minutes === 0) return `${seconds} 秒`;
  return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`;
}

export function buildPublishPackage(input: PublishPackageBuildInput): PublishPackage {
  const readingSpeed = input.readingSpeed && input.readingSpeed > 0 ? input.readingSpeed : 280;
  const title = normalizeText(input.topic.title);
  const wordCount = getWordCount(input.draft);
  const estimatedDurationSeconds = Math.round((wordCount / readingSpeed) * 60);
  const editable: PublishPackageEditableFields = {
    title,
    title_candidates: title ? [title] : [],
    cover_text: normalizeText(input.topic.hook) || title,
    description: buildDescription(input.topic, input.people || input.topic.people || []),
    tags: (input.topic.tags || []).map((tag) => normalizeText(tag.name)).filter(Boolean),
    chapters: extractChapters(input.draft, readingSpeed),
    pinned_comment: '',
    source_credits: buildSourceCredits(input.sources),
  };

  return {
    ...editable,
    checks: evaluatePublishChecks({ ...input, editable, estimatedDurationSeconds }),
    word_count: wordCount,
    estimated_duration_seconds: estimatedDurationSeconds,
    draft_updated_at: input.draft?.updated_at || null,
  };
}

function includedCredits(sourceCredits: PublishSourceCredit[]): PublishSourceCredit[] {
  return sourceCredits.filter((source) => source.included);
}

export function formatPublishPackageText(packageData: PublishPackageEditableFields): string {
  const tags = packageData.tags.join(' ');
  const chapters = packageData.chapters.map((chapter) => `${chapter.time} ${chapter.title}`).join('\n');
  const credits = includedCredits(packageData.source_credits).map((source) => {
    const meta = [source.platform_label, source.author].filter(Boolean).join(' · ');
    return `- ${source.title}${meta ? `（${meta}）` : ''}${source.url ? `\n  ${source.url}` : ''}`;
  }).join('\n');
  const candidates = packageData.title_candidates.filter((title) => title && title !== packageData.title);

  return [
    '标题：',
    packageData.title,
    candidates.length > 0 ? `候选标题：\n${candidates.map((title) => `- ${title}`).join('\n')}` : '',
    '封面短句：',
    packageData.cover_text,
    '视频简介：',
    packageData.description,
    '标签：',
    tags,
    '章节：',
    chapters,
    '置顶评论：',
    packageData.pinned_comment,
    '参考资料：',
    credits,
  ].filter((section) => section !== '').join('\n\n');
}

export function formatPublishPackageMarkdown(packageData: PublishPackageEditableFields): string {
  const tags = packageData.tags.join(' ');
  const chapters = packageData.chapters.map((chapter) => `- **${chapter.time}** ${chapter.title}`).join('\n');
  const credits = includedCredits(packageData.source_credits).map((source) => {
    const meta = [source.platform_label, source.author].filter(Boolean).join(' · ');
    return `- ${source.title}${meta ? `（${meta}）` : ''}${source.url ? ` — ${source.url}` : ''}`;
  }).join('\n');
  const candidates = packageData.title_candidates.filter((title) => title && title !== packageData.title);

  return [
    '# B站发布包',
    '## 标题',
    packageData.title || '（未填写）',
    candidates.length > 0 ? `\n### 候选标题\n${candidates.map((title) => `- ${title}`).join('\n')}` : '',
    '## 封面短句',
    packageData.cover_text || '（未填写）',
    '## 视频简介',
    packageData.description || '（未填写）',
    '## 标签',
    tags || '（未填写）',
    '## 章节',
    chapters || '（暂无章节）',
    '## 置顶评论',
    packageData.pinned_comment || '（未填写）',
    '## 参考资料',
    credits || '（暂无参考资料）',
  ].filter(Boolean).join('\n\n');
}
