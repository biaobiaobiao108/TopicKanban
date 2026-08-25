import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Cloud,
  Download,
  ExternalLink,
  FileText,
  Languages,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  PublishChapter,
  PublishCheck,
  PublishPackage,
  PublishPackageSaveInput,
  Topic,
  TopicWorkspaceLoad,
} from '../../types';
import {
  buildPublishPackage,
  evaluatePublishChecks,
  formatPublishPackageMarkdown,
  formatPublishPackageText,
  mergeSavedPublishPackage,
  toPersistedPublishPackageContent,
  type PublishPackageEditableFields,
} from '../../lib/publishPackage';
import { toTraditionalChinese } from '../../lib/traditionalChinese';
import { PublishPackageConflictError } from '../../lib/storage';
import { useToast } from '../ui/Toast';

interface PublishPackageTabProps {
  topic: Topic;
  workspace: TopicWorkspaceLoad;
  readingSpeed: number;
  onNavigateToScript: () => void;
  onSavePublishPackage: (input: PublishPackageSaveInput) => Promise<{ version: number; updated_at: string }>;
}

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, children, action }) => (
  <section className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-2xs dark:border-stone-800 dark:bg-stone-900 sm:p-5">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

interface CopyButtonProps {
  label: string;
  onCopy: () => void;
  compact?: boolean;
}

const CopyButton: React.FC<CopyButtonProps> = ({ label, onCopy, compact = false }) => (
  <button
    type="button"
    onClick={onCopy}
    className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 ${compact ? 'px-2' : ''}`}
  >
    <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
    <span>{label}</span>
  </button>
);

const statusConfig: Record<PublishCheck['level'], { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  blocker: { icon: AlertCircle, className: 'text-red-700 dark:text-red-300' },
  warning: { icon: CircleAlert, className: 'text-amber-700 dark:text-amber-300' },
  info: { icon: CheckCircle2, className: 'text-emerald-700 dark:text-emerald-300' },
};

const statusLabel: Record<PublishCheck['level'], string> = {
  blocker: '需要处理',
  warning: '提醒',
  info: '通过',
};

function parseTimestamp(value: string): number {
  const parts = value.trim().split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatDownloadName(title: string, extension: string): string {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]/g, '_') || '未命名发布包';
  return `双平台发布包-${safeTitle}.${extension}`;
}

type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error' | 'conflict';

export const PublishPackageTab: React.FC<PublishPackageTabProps> = ({
  topic,
  workspace,
  readingSpeed,
  onNavigateToScript,
  onSavePublishPackage,
}) => {
  const { showToast } = useToast();
  const fallbackRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldsRef = useRef<PublishPackageEditableFields | null>(null);
  const versionRef = useRef(workspace.publish_package?.version || 0);
  const initializedRef = useRef(false);
  const [fallbackText, setFallbackText] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(workspace.publish_package ? 'saved' : 'dirty');
  const [lastSavedAt, setLastSavedAt] = useState(workspace.publish_package?.updated_at || null);

  const draftConflict = Boolean(workspace.draft.conflict);
  const draft = draftConflict ? null : workspace.draft.draft;
  const sources = workspace.sources || [];
  const timeline = workspace.timeline || [];
  const citations = workspace.citations || [];
  const savedPackage = workspace.publish_package || null;

  const generated = useMemo(() => buildPublishPackage({
    topic,
    draft,
    sources,
    timeline,
    citations,
    people: topic.people || [],
    readingSpeed,
    draftConflict,
  }), [citations, draft, draftConflict, readingSpeed, sources, timeline, topic]);

  const [fields, setFields] = useState<PublishPackageEditableFields>(() => mergeSavedPublishPackage(generated, savedPackage));

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const persistFields = useCallback(async (nextFields: PublishPackageEditableFields) => {
    if (draftConflict && !savedPackage) return;
    setSaveStatus('saving');
    try {
      const saved = await onSavePublishPackage({
        title_simplified: nextFields.title_simplified,
        title_traditional: nextFields.title_traditional,
        description_simplified: nextFields.description_simplified,
        description_traditional: nextFields.description_traditional,
        title_traditional_auto: nextFields.title_traditional_auto,
        description_traditional_auto: nextFields.description_traditional_auto,
        content_json: JSON.stringify(toPersistedPublishPackageContent(nextFields)),
        base_version: versionRef.current,
      });
      versionRef.current = saved.version;
      setLastSavedAt(saved.updated_at);
      setIsDirty(false);
      setSaveStatus('saved');
    } catch (error) {
      setSaveStatus(error instanceof PublishPackageConflictError ? 'conflict' : 'error');
      throw error;
    }
  }, [draftConflict, onSavePublishPackage, savedPackage]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!savedPackage && !draftConflict && fieldsRef.current) {
      void persistFields(fieldsRef.current).catch(() => undefined);
    }
  }, [draftConflict, persistFields, savedPackage]);

  const scheduleSave = useCallback((nextFields: PublishPackageEditableFields) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsDirty(true);
    setSaveStatus('dirty');
    saveTimerRef.current = setTimeout(() => {
      void persistFields(nextFields).catch(() => undefined);
    }, 800);
  }, [persistFields]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const updateFields = useCallback((updater: (current: PublishPackageEditableFields) => PublishPackageEditableFields) => {
    const current = fieldsRef.current;
    if (!current) return;
    const next = updater(current);
    fieldsRef.current = next;
    setFields(next);
    scheduleSave(next);
  }, [scheduleSave]);

  const resetFromWorkspace = () => {
    const next = mergeSavedPublishPackage(generated, null);
    setFields(next);
    fieldsRef.current = next;
    scheduleSave(next);
    showToast({ message: '已恢复当前工作区自动生成内容', tone: 'success' });
  };

  const resetField = <K extends keyof PublishPackageEditableFields>(key: K) => {
    const generatedFields = mergeSavedPublishPackage(generated, null);
    updateFields((current) => ({ ...current, [key]: generatedFields[key] }));
  };

  const updateTitleSimplified = (value: string) => {
    updateFields((current) => ({
      ...current,
      title_simplified: value,
      title_traditional: current.title_traditional_auto ? toTraditionalChinese(value) : current.title_traditional,
    }));
  };

  const updateDescriptionSimplified = (value: string) => {
    updateFields((current) => ({
      ...current,
      description_simplified: value,
      description_traditional: current.description_traditional_auto ? toTraditionalChinese(value) : current.description_traditional,
    }));
  };

  const restoreTraditional = (field: 'title' | 'description') => {
    updateFields((current) => field === 'title'
      ? { ...current, title_traditional: toTraditionalChinese(current.title_simplified), title_traditional_auto: true }
      : { ...current, description_traditional: toTraditionalChinese(current.description_simplified), description_traditional_auto: true });
  };

  const checks = useMemo(() => evaluatePublishChecks({
    topic,
    draft,
    sources,
    timeline,
    citations,
    people: topic.people || [],
    readingSpeed,
    draftConflict,
    editable: fields,
    estimatedDurationSeconds: generated.estimated_duration_seconds,
  }), [citations, draft, draftConflict, fields, generated.estimated_duration_seconds, readingSpeed, sources, timeline, topic]);

  const packageData = useMemo<PublishPackage>(() => ({ ...generated, ...fields, checks }), [checks, fields, generated]);
  const blockers = checks.filter((check) => check.level === 'blocker');
  const warnings = checks.filter((check) => check.level === 'warning');
  const packageText = useMemo(() => formatPublishPackageText(fields), [fields]);
  const packageMarkdown = useMemo(() => formatPublishPackageMarkdown(fields), [fields]);

  const copyText = async (label: string, text: string) => {
    setFallbackText(text);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      showToast({ message: `已复制${label}`, tone: 'success' });
    } catch {
      showToast({ message: `无法直接复制${label}，已保留文本供手动选择`, tone: 'info' });
      requestAnimationFrame(() => fallbackRef.current?.focus());
    }
  };

  const download = (content: string, extension: 'md' | 'txt', label: string) => {
    const blob = new Blob([content], { type: extension === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = formatDownloadName(fields.title_simplified, extension);
    anchor.click();
    URL.revokeObjectURL(url);
    showToast({ message: `已导出${label}`, tone: 'success' });
  };

  const addCandidate = () => {
    if (fields.title_candidates.length >= 3) return;
    updateFields((current) => ({ ...current, title_candidates: [...current.title_candidates, ''] }));
  };

  const updateChapter = (index: number, updates: Partial<PublishChapter>) => {
    updateFields((current) => ({
      ...current,
      chapters: current.chapters.map((chapter, chapterIndex) => {
        if (chapterIndex !== index) return chapter;
        const next = { ...chapter, ...updates };
        if (typeof updates.time === 'string') next.start_seconds = parseTimestamp(updates.time);
        return next;
      }),
    }));
  };

  const addChapter = () => {
    updateFields((current) => ({
      ...current,
      chapters: [...current.chapters, {
        id: `chapter-manual-${Date.now()}`,
        title: '',
        time: '00:00',
        start_seconds: 0,
        source: 'manual',
      }],
    }));
  };

  const updateSourceIncluded = (id: string, included: boolean) => {
    updateFields((current) => ({
      ...current,
      source_credits: current.source_credits.map((source) => source.id === id ? { ...source, included } : source),
    }));
  };

  const statusTitle = blockers.length > 0 ? '缺少必要内容' : warnings.length > 0 ? '有提醒' : '可发布';
  const statusDescription = blockers.length > 0
    ? '处理阻塞项后，再复制或导出发布包。'
    : warnings.length > 0
      ? '内容可以继续使用，但建议先看一遍提醒。'
      : '内容已具备，可以分别复制到 Bilibili 和 YouTube 投稿后台。';
  const StatusIcon = blockers.length > 0 ? AlertCircle : warnings.length > 0 ? CircleAlert : CheckCircle2;
  const saveStatusLabel = saveStatus === 'saving'
    ? '正在保存'
    : saveStatus === 'dirty'
      ? '等待保存'
      : saveStatus === 'conflict'
        ? '保存冲突'
        : saveStatus === 'error'
          ? '保存失败'
          : '已保存';
  const SaveStatusIcon = saveStatus === 'saved' ? CheckCircle2 : saveStatus === 'conflict' || saveStatus === 'error' ? AlertCircle : saveStatus === 'saving' ? Cloud : Save;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 py-5 sm:py-7">
      <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-4 dark:border-rose-900/60 dark:bg-rose-950/30 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden="true" /><h1 className="text-base font-bold text-rose-950 dark:text-rose-100">双平台发布包</h1></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-rose-900/75 dark:text-rose-200/80" aria-live="polite">
            <span>{packageData.word_count.toLocaleString()} 字</span><span aria-hidden="true">·</span><span>预计 {Math.floor(packageData.estimated_duration_seconds / 60)} 分 {String(packageData.estimated_duration_seconds % 60).padStart(2, '0')} 秒</span>
            {lastSavedAt && <><span aria-hidden="true">·</span><span>发布包保存于 {new Date(lastSavedAt).toLocaleString()}</span></>}
            <span className="inline-flex items-center gap-1 font-semibold" title={saveStatusLabel}><SaveStatusIcon className="h-3.5 w-3.5" aria-hidden="true" />{saveStatusLabel}</span>
          </div>
        </div>
        {draftConflict && <div className="mt-4 flex flex-col gap-3 rounded-xl border border-red-300 bg-white/80 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-stone-900/80 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between" role="alert"><span>检测到文案冲突，当前发布包不会使用任何一份不明确的旧文案；请先解决冲突。</span><button type="button" onClick={onNavigateToScript} className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-red-700 px-3 text-xs font-bold text-white hover:bg-red-800">去解决冲突</button></div>}
        {saveStatus === 'conflict' && <div className="mt-3 rounded-xl border border-red-300 bg-white/80 px-3 py-2 text-xs font-medium text-red-900 dark:border-red-800 dark:bg-stone-900/80 dark:text-red-200" role="alert">发布包在其他设备上发生更新。请刷新页面后再继续编辑，避免覆盖他人的修改。</div>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]">
        <form className="min-w-0 space-y-5" onSubmit={(event) => event.preventDefault()}>
          <SectionCard title="Bilibili（简体）">
            <fieldset className="space-y-4" lang="zh-CN"><legend className="sr-only">Bilibili 简体发布内容</legend>
              <div><div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor="publish-title-simplified" className="text-xs font-bold text-stone-700 dark:text-stone-300">简体标题</label><CopyButton label="复制标题" compact onCopy={() => void copyText('Bilibili 标题', fields.title_simplified)} /></div><input id="publish-title-simplified" name="title_simplified" value={fields.title_simplified} onChange={(event) => updateTitleSimplified(event.target.value)} maxLength={200} className="min-h-11 w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3 text-base text-stone-900 outline-none transition-colors focus:border-rose-500 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800" /></div>
              <div><div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor="publish-description-simplified" className="text-xs font-bold text-stone-700 dark:text-stone-300">简体简介</label><CopyButton label="复制简介" compact onCopy={() => void copyText('Bilibili 简介', fields.description_simplified)} /></div><textarea id="publish-description-simplified" name="description_simplified" value={fields.description_simplified} onChange={(event) => updateDescriptionSimplified(event.target.value)} rows={7} className="w-full resize-y rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3 py-2.5 text-base leading-6 text-stone-900 outline-none transition-colors focus:border-rose-500 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800" /></div>
              <div><div className="mb-1.5 flex items-center justify-between gap-2"><label className="text-xs font-bold text-stone-700 dark:text-stone-300" htmlFor="publish-title-candidate-0">标题候选（最多 3 条）</label><button type="button" onClick={addCandidate} disabled={fields.title_candidates.length >= 3} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-rose-300 dark:hover:bg-rose-950/40"><Plus className="h-3.5 w-3.5" aria-hidden="true" />添加</button></div><div className="space-y-2">{fields.title_candidates.map((candidate, index) => <div key={`${index}-${candidate}`} className="flex items-center gap-2"><input id={`publish-title-candidate-${index}`} name={`title_candidate_${index + 1}`} value={candidate} onChange={(event) => updateFields((current) => ({ ...current, title_candidates: current.title_candidates.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} className="min-h-10 min-w-0 flex-1 rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3 text-base text-stone-900 outline-none transition-colors focus:border-rose-500 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800" placeholder={`候选标题 ${index + 1}`} /><button type="button" aria-label={`删除标题候选 ${index + 1}`} onClick={() => updateFields((current) => ({ ...current, title_candidates: current.title_candidates.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></div>)}</div></div>
            </fieldset>
          </SectionCard>

          <SectionCard title="YouTube（繁体）">
            <fieldset className="space-y-4" lang="zh-TW"><legend className="sr-only">YouTube 繁体发布内容</legend>
              <div><div className="mb-1.5 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><label htmlFor="publish-title-traditional" className="text-xs font-bold text-stone-700 dark:text-stone-300">繁体标题</label><span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"><Languages className="h-3 w-3" aria-hidden="true" />{fields.title_traditional_auto ? '自动同步' : '手动修改'}</span></div><div className="flex items-center gap-1.5"><button type="button" onClick={() => restoreTraditional('title')} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />恢复同步</button><CopyButton label="复制标题" compact onCopy={() => void copyText('YouTube 标题', fields.title_traditional)} /></div></div><input id="publish-title-traditional" name="title_traditional" value={fields.title_traditional} onChange={(event) => updateFields((current) => ({ ...current, title_traditional: event.target.value, title_traditional_auto: false }))} maxLength={200} className="min-h-11 w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3 text-base text-stone-900 outline-none transition-colors focus:border-rose-500 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800" /></div>
              <div><div className="mb-1.5 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><label htmlFor="publish-description-traditional" className="text-xs font-bold text-stone-700 dark:text-stone-300">繁体简介</label><span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"><Languages className="h-3 w-3" aria-hidden="true" />{fields.description_traditional_auto ? '自动同步' : '手动修改'}</span></div><div className="flex items-center gap-1.5"><button type="button" onClick={() => restoreTraditional('description')} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />恢复同步</button><CopyButton label="复制简介" compact onCopy={() => void copyText('YouTube 简介', fields.description_traditional)} /></div></div><textarea id="publish-description-traditional" name="description_traditional" value={fields.description_traditional} onChange={(event) => updateFields((current) => ({ ...current, description_traditional: event.target.value, description_traditional_auto: false }))} rows={7} className="w-full resize-y rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3 py-2.5 text-base leading-6 text-stone-900 outline-none transition-colors focus:border-rose-500 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800" /></div>
            </fieldset>
          </SectionCard>

          <SectionCard title="公共内容" action={<button type="button" onClick={resetFromWorkspace} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />恢复自动生成</button>}>
            <div className="space-y-5">
              <div><div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor="publish-cover-text" className="text-xs font-bold text-stone-700 dark:text-stone-300">封面短句</label><div className="flex items-center gap-1.5"><button type="button" onClick={() => resetField('cover_text')} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />恢复</button><CopyButton label="复制" compact onCopy={() => void copyText('封面短句', fields.cover_text)} /></div></div><input id="publish-cover-text" name="cover_text" value={fields.cover_text} onChange={(event) => updateFields((current) => ({ ...current, cover_text: event.target.value }))} className="min-h-11 w-full rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3 text-base text-stone-900 outline-none transition-colors focus:border-rose-500 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800" /></div>
              <div><div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-xs font-bold text-stone-700 dark:text-stone-300">标签</span><div className="flex items-center gap-1.5"><button type="button" onClick={() => resetField('tags')} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />恢复</button><CopyButton label="复制" compact onCopy={() => void copyText('标签', fields.tags.join(' '))} /></div></div><div className="flex flex-wrap gap-2">{fields.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-700 dark:text-rose-300">#{tag}<button type="button" aria-label={`删除标签 ${tag}`} onClick={() => updateFields((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))} className="rounded-full p-0.5 hover:bg-rose-500/20">×</button></span>)}</div><label htmlFor="publish-tag-input" className="sr-only">添加标签</label><input id="publish-tag-input" name="tag_input" className="mt-3 min-h-10 w-full rounded-xl border border-dashed border-stone-300 bg-transparent px-3 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-rose-500 dark:border-stone-700 dark:text-stone-100" placeholder="输入标签后按 Enter 添加" onKeyDown={(event) => { if (event.key !== 'Enter') return; event.preventDefault(); const value = event.currentTarget.value.trim().replace(/^#+/, ''); if (value && !fields.tags.includes(value)) { updateFields((current) => ({ ...current, tags: [...current.tags, value] })); event.currentTarget.value = ''; } }} /></div>
              <div><div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-xs font-bold text-stone-700 dark:text-stone-300">视频章节</span><div className="flex items-center gap-1.5"><button type="button" onClick={() => resetField('chapters')} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />恢复</button><CopyButton label="复制" compact onCopy={() => void copyText('章节', fields.chapters.map((chapter) => `${chapter.time} ${chapter.title}`).join('\n'))} /></div></div><fieldset><legend className="sr-only">视频章节列表</legend><div className="space-y-2">{fields.chapters.map((chapter, index) => <div key={chapter.id} className="grid grid-cols-[5.25rem_minmax(0,1fr)_2rem] items-center gap-2"><label htmlFor={`chapter-time-${chapter.id}`} className="sr-only">第 {index + 1} 个章节时间</label><input id={`chapter-time-${chapter.id}`} name={`chapter_time_${index + 1}`} value={chapter.time} onChange={(event) => updateChapter(index, { time: event.target.value })} inputMode="numeric" className="min-h-10 rounded-lg border border-stone-200 bg-stone-500/[0.03] px-2 text-center font-mono text-base text-stone-900 outline-none focus:border-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" /><label htmlFor={`chapter-title-${chapter.id}`} className="sr-only">第 {index + 1} 个章节标题</label><input id={`chapter-title-${chapter.id}`} name={`chapter_title_${index + 1}`} value={chapter.title} onChange={(event) => updateChapter(index, { title: event.target.value })} className="min-h-10 min-w-0 rounded-lg border border-stone-200 bg-stone-500/[0.03] px-3 text-base text-stone-900 outline-none focus:border-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" placeholder="章节标题" /><button type="button" aria-label={`删除章节 ${index + 1}`} onClick={() => updateFields((current) => ({ ...current, chapters: current.chapters.filter((_, chapterIndex) => chapterIndex !== index) }))} className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></div>)}</div></fieldset><button type="button" onClick={addChapter} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 text-xs font-semibold text-stone-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-stone-700 dark:text-stone-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"><Plus className="h-3.5 w-3.5" aria-hidden="true" />手动添加章节</button></div>
              <div><div className="mb-1.5 flex items-center justify-between gap-2"><label htmlFor="publish-pinned-comment" className="text-xs font-bold text-stone-700 dark:text-stone-300">置顶评论</label><div className="flex items-center gap-1.5"><button type="button" onClick={() => resetField('pinned_comment')} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />清空</button><CopyButton label="复制" compact onCopy={() => void copyText('置顶评论', fields.pinned_comment)} /></div></div><textarea id="publish-pinned-comment" name="pinned_comment" value={fields.pinned_comment} onChange={(event) => updateFields((current) => ({ ...current, pinned_comment: event.target.value }))} rows={4} placeholder="例如：你在这件事里还发现了哪些细节？欢迎把原始出处放在评论区。" className="w-full resize-y rounded-xl border border-stone-200/80 bg-stone-500/[0.03] px-3 py-2.5 text-base leading-6 text-stone-900 outline-none placeholder:text-stone-400 focus:border-rose-500 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:bg-stone-800" /></div>
            </div>
          </SectionCard>

          <SectionCard title="参考资料" action={<div className="flex items-center gap-1.5"><button type="button" onClick={() => resetField('source_credits')} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />恢复</button><CopyButton label="复制" compact onCopy={() => void copyText('参考资料', fields.source_credits.filter((source) => source.included).map((source) => `${source.title}${source.url ? `\n${source.url}` : ''}`).join('\n\n'))} /></div>}>
            {fields.source_credits.length === 0 ? <p className="text-sm text-stone-500 dark:text-stone-400">暂无关联资料。</p> : <fieldset className="space-y-2"><legend className="sr-only">选择要放入发布包的参考资料</legend>{fields.source_credits.map((source) => <label key={source.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200/80 p-3 transition-colors hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/60"><input type="checkbox" name={`source_${source.id}`} checked={source.included} onChange={(event) => updateSourceIncluded(source.id, event.target.checked)} className="mt-1 h-4 w-4 accent-rose-600" /><span className="min-w-0 flex-1"><span className="block text-base font-semibold text-stone-800 dark:text-stone-200">{source.title}</span><span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">{[source.platform_label, source.author].filter(Boolean).join(' · ') || '来源信息未填写'}</span>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-rose-700 hover:underline dark:text-rose-300"><span className="truncate">{source.url}</span><ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" /></a> : <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">链接未导出</span>}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${source.verification_status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : source.verification_status === 'rejected' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{source.verification_status === 'confirmed' ? '已核实' : source.verification_status === 'rejected' ? '存疑' : '待考证'}</span></label>)}</fieldset>}
          </SectionCard>
        </form>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <section className={`rounded-2xl border p-4 shadow-2xs sm:p-5 ${blockers.length > 0 ? 'border-red-200 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/30' : warnings.length > 0 ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30' : 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/30'}`}>
            <div className="flex items-start gap-3"><StatusIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">{statusTitle}</h2><p className="mt-1 text-xs leading-5 text-stone-600 dark:text-stone-300">{statusDescription}</p></div></div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-white/70 p-2 dark:bg-stone-900/50"><div className="font-mono text-lg font-bold text-stone-900 dark:text-stone-100">{packageData.word_count.toLocaleString()}</div><div className="text-stone-500 dark:text-stone-400">字数</div></div><div className="rounded-xl bg-white/70 p-2 dark:bg-stone-900/50"><div className="font-mono text-lg font-bold text-stone-900 dark:text-stone-100">{packageData.chapters.length}</div><div className="text-stone-500 dark:text-stone-400">章节</div></div><div className="rounded-xl bg-white/70 p-2 dark:bg-stone-900/50"><div className="font-mono text-lg font-bold text-stone-900 dark:text-stone-100">{packageData.source_credits.filter((source) => source.included).length}</div><div className="text-stone-500 dark:text-stone-400">资料</div></div></div>
            <div className="mt-4 space-y-2" aria-live="polite">{checks.map((check) => { const config = statusConfig[check.level]; const Icon = config.icon; return <div key={check.id} className="flex items-start gap-2 rounded-xl bg-white/65 px-3 py-2.5 dark:bg-stone-900/45"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.className}`} aria-hidden="true" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-stone-800 dark:text-stone-200"><span>{check.label}</span><span className="rounded-full bg-stone-500/10 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 dark:text-stone-400">{statusLabel[check.level]}</span></div><p className="mt-0.5 text-[11px] leading-5 text-stone-600 dark:text-stone-400">{check.detail}</p></div></div>; })}</div>
          </section>
          <SectionCard title="复制与导出"><div className="grid gap-2"><button type="button" disabled={blockers.length > 0} onClick={() => void copyText('完整双平台发布包', packageText)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 text-sm font-bold text-white shadow-2xs transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"><ClipboardCopy className="h-4 w-4" aria-hidden="true" />复制完整发布包</button><div className="grid grid-cols-2 gap-2"><button type="button" disabled={blockers.length > 0} onClick={() => download(packageMarkdown, 'md', 'Markdown')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"><Download className="h-3.5 w-3.5" aria-hidden="true" />Markdown</button><button type="button" disabled={blockers.length > 0} onClick={() => download(packageText, 'txt', '纯文本')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"><Download className="h-3.5 w-3.5" aria-hidden="true" />纯文本</button></div></div><label htmlFor="publish-package-preview" className="mt-4 block text-xs font-bold text-stone-700 dark:text-stone-300">完整发布包预览</label><textarea id="publish-package-preview" name="package_preview" ref={fallbackRef} value={fallbackText || packageText} onChange={(event) => setFallbackText(event.target.value)} rows={16} className="mt-1.5 w-full resize-y rounded-xl border border-stone-200 bg-stone-500/[0.03] px-3 py-2.5 font-mono text-xs leading-5 text-stone-700 outline-none focus:border-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200" />{fallbackText && <button type="button" onClick={() => setFallbackText('')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />恢复自动预览</button>}</SectionCard>
          {isDirty && <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300" role="status">当前发布包修改将在短暂停止输入后自动保存。</div>}
        </aside>
      </div>
    </div>
  );
};
