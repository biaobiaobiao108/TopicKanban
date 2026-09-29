import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { TopicReport } from '../../types';
import { TopicReportConflictError } from '../../lib/storage';
import { ScriptStarterKit } from './ScriptStarterKit';
import { ScriptCodeBlock } from './ScriptCodeBlock';
import { CodeBlockDoubleEnter } from './ScriptCodeBlockEnter';
import { createTableExtensions } from './ScriptTableExtensions';
import { ScriptLink } from './ScriptLink';
import { CalloutNode } from './ScriptCalloutNode';
import { ScriptMarkdownMenu } from './ScriptMarkdownMenu';
import { ImeMarkdownSafeExtension } from './ImeMarkdownSafeExtension';
import { TableEdgeControls } from './ScriptTableEdgeControls';
import { pastePlainTextIntoCodeBlock, shouldParseMarkdownPaste } from './scriptMarkdownPaste';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { copyTextToClipboard } from '../../lib/clipboard';
import { countValidCharacters } from '../../lib/textMetrics';
import { formatBeijingDateTime } from '../../lib/actionDate';
import {
  FileText,
  Cloud,
  CheckCircle2,
  Save,
  AlertTriangle,
  Copy,
  Check,
  Trash2,
} from 'lucide-react';

const REPORT_MARKDOWN_EXTENSIONS = [
  ScriptStarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    link: false,
    codeBlock: false,
  }),
  ScriptCodeBlock.configure({ exitOnTripleEnter: false }),
  CodeBlockDoubleEnter,
  ...createTableExtensions(),
  ScriptLink.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: '在此录入或粘贴选题报告……支持完整 Markdown 快捷语法，输入 / 唤出排版菜单。' }),
  CharacterCount,
  Markdown,
  CalloutNode,
  ScriptMarkdownMenu,
  ImeMarkdownSafeExtension,
];

interface TopicReportTabProps {
  topicId: string;
  topicTitle: string;
  report: TopicReport | null;
  onSaveReport: (reportData: {
    content_markdown?: string;
    content_html?: string;
    content_json?: string;
    word_count?: number;
    base_version?: number;
  }) => Promise<TopicReport>;
}

export const TopicReportTab: React.FC<TopicReportTabProps> = ({
  topicId,
  topicTitle,
  report,
  onSaveReport,
}) => {
  const { showToast } = useToast();
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'conflict' | 'error'>('saved');
  const [conflictReport, setConflictReport] = useState<TopicReport | null>(null);
  const [hasConflictSnapshot, setHasConflictSnapshot] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>(
    report?.updated_at ? formatBeijingDateTime(report.updated_at, 'zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
  );
  const [copied, setCopied] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmOverwriteOpen, setIsConfirmOverwriteOpen] = useState(false);
  const [isConfirmUseRemoteOpen, setIsConfirmUseRemoteOpen] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const editRevisionRef = useRef(0);
  const isSavingRef = useRef(false);
  const conflictPendingRef = useRef(false);
  const activeSaveDoneRef = useRef<Promise<void> | null>(null);
  const schedulePersistenceRef = useRef<() => void>(() => {});
  const latestContentRef = useRef<{ markdown: string; html: string; json: string; wordCount: number } | null>(null);
  const currentBaseVersionRef = useRef<number>(report?.version ?? 0);
  const markdownEditorRef = useRef<TiptapEditor | null>(null);
  const isMountedRef = useRef(true);
  const onSaveReportRef = useRef(onSaveReport);

  useEffect(() => {
    onSaveReportRef.current = onSaveReport;
  }, [onSaveReport]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (report?.version !== undefined && !hasUnsavedChangesRef.current) {
      currentBaseVersionRef.current = report.version;
    }
  }, [report?.version]);

  const persistReport = useCallback(async () => {
    const latest = latestContentRef.current;
    if (!latest || !hasUnsavedChangesRef.current || isSavingRef.current || conflictPendingRef.current) return;

    const savedRevision = editRevisionRef.current;
    const baseVersion = currentBaseVersionRef.current;
    isSavingRef.current = true;
    let finishSave!: () => void;
    const saveDone = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    activeSaveDoneRef.current = saveDone;

    if (isMountedRef.current) setSaveStatus('saving');
    try {
      const updated = await onSaveReportRef.current({
        content_markdown: latest.markdown,
        content_html: latest.html,
        content_json: latest.json,
        word_count: latest.wordCount,
        base_version: baseVersion,
      });
      currentBaseVersionRef.current = updated.version;
      const noNewEdits = editRevisionRef.current === savedRevision;
      if (noNewEdits) hasUnsavedChangesRef.current = false;
      if (isMountedRef.current) {
        if (noNewEdits) {
          setSaveStatus('saved');
          setLastSavedTime(formatBeijingDateTime(new Date(), 'zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } else {
          // The request saved an older editor snapshot. Keep newer input dirty and save it
          // against the version returned by this successful request.
          setSaveStatus('unsaved');
          schedulePersistenceRef.current();
        }
      }
    } catch (err: unknown) {
      console.error('Failed to save topic report:', err);
      const isConflict = err instanceof TopicReportConflictError
        || (err instanceof Error && (err.name === 'TopicReportConflictError' || err.message.includes('409') || err.message.includes('REPORT_CONFLICT') || err.message.includes('版本冲突')));
      if (isConflict) {
        conflictPendingRef.current = true;
        const remoteReport = err instanceof TopicReportConflictError ? err.current : null;
        if (isMountedRef.current) {
          setConflictReport(remoteReport);
          setHasConflictSnapshot(err instanceof TopicReportConflictError);
          setSaveStatus('conflict');
          showToast({ message: '选题报告发生版本冲突，本机内容已保留，请比较后选择要采用的版本', tone: 'error' });
        }
      } else {
        if (isMountedRef.current) {
          setSaveStatus('error');
          showToast({ message: '保存选题报告失败', tone: 'error' });
        }
      }
    } finally {
      isSavingRef.current = false;
      if (activeSaveDoneRef.current === saveDone) {
        activeSaveDoneRef.current = null;
        finishSave();
      }
    }
  }, [showToast]);

  const schedulePersistence = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void persistReport();
    }, 1500);
  }, [persistReport]);
  schedulePersistenceRef.current = schedulePersistence;

  const editor = useEditor({
    extensions: REPORT_MARKDOWN_EXTENSIONS,
    content: report?.content_markdown || '',
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'script-editor-font-stack prose prose-stone max-w-none focus:outline-none min-h-[500px] text-stone-900 dark:text-stone-100 font-normal',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain') || '';
        if (pastePlainTextIntoCodeBlock(view, text)) {
          event.preventDefault();
          return true;
        }
        const html = event.clipboardData?.getData('text/html') || '';
        if (!shouldParseMarkdownPaste(text, Boolean(html))) return false;
        const markdownParser = markdownEditorRef.current?.markdown;
        if (!markdownParser) return false;
        try {
          const parsedDocument = view.state.schema.nodeFromJSON(markdownParser.parse(text));
          const slice = parsedDocument.slice(0, parsedDocument.content.size);
          view.dispatch(view.state.tr.replaceSelection(slice).setMeta('uiEvent', 'paste'));
          event.preventDefault();
          return true;
        } catch {
          return false;
        }
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const text = updatedEditor.getText();
      const markdown = (updatedEditor as TiptapEditor & { getMarkdown: () => string }).getMarkdown();
      const html = updatedEditor.getHTML();
      const json = JSON.stringify(updatedEditor.getJSON());
      const wordCount = text.replace(/\s+/g, '').length;

      latestContentRef.current = { markdown, html, json, wordCount };
      editRevisionRef.current += 1;
      hasUnsavedChangesRef.current = true;
      if (conflictPendingRef.current) {
        setSaveStatus('conflict');
      } else {
        setSaveStatus('unsaved');
        schedulePersistence();
      }
    },
  });
  markdownEditorRef.current = editor;

  const handleKeepLocalAndOverwrite = () => {
    if (!hasConflictSnapshot || !conflictPendingRef.current) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    currentBaseVersionRef.current = conflictReport?.version ?? 0;
    conflictPendingRef.current = false;
    setConflictReport(null);
    setHasConflictSnapshot(false);
    setSaveStatus('unsaved');
    void persistReport();
    setIsConfirmOverwriteOpen(false);
  };

  const handleUseRemoteVersion = () => {
    if (!editor || !hasConflictSnapshot || !conflictPendingRef.current) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const remote = conflictReport;
    const markdown = remote?.content_markdown || '';
    editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
    latestContentRef.current = remote
      ? {
          markdown: remote.content_markdown || '',
          html: remote.content_html || '',
          json: remote.content_json || '',
          wordCount: remote.word_count || 0,
        }
      : {
          markdown: '',
          html: editor.getHTML(),
          json: JSON.stringify(editor.getJSON()),
          wordCount: 0,
        };
    editRevisionRef.current += 1;
    hasUnsavedChangesRef.current = false;
    currentBaseVersionRef.current = remote?.version ?? 0;
    conflictPendingRef.current = false;
    setConflictReport(null);
    setHasConflictSnapshot(false);
    setSaveStatus('saved');
    setLastSavedTime(remote?.updated_at
      ? formatBeijingDateTime(remote.updated_at, 'zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '');
    setIsConfirmUseRemoteOpen(false);
    showToast({ message: '已采用云端选题报告版本', tone: 'info' });
  };

  // Synchronize editor content if report updates from outside and no unsaved changes
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (report && !hasUnsavedChangesRef.current) {
      const currentMd = (editor as TiptapEditor & { getMarkdown: () => string }).getMarkdown();
      if (currentMd !== (report.content_markdown || '')) {
        editor.commands.setContent(report.content_markdown || '', { contentType: 'markdown', emitUpdate: false });
        currentBaseVersionRef.current = report.version;
        if (report.updated_at) {
          setLastSavedTime(formatBeijingDateTime(report.updated_at, 'zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      }
    }
  }, [editor, report]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const flushLatestAfterActiveSave = async () => {
        const activeSave = activeSaveDoneRef.current;
        if (activeSave) await activeSave;
        if (conflictPendingRef.current || !hasUnsavedChangesRef.current || !latestContentRef.current) return;
        const latest = latestContentRef.current;
        try {
          await onSaveReportRef.current({
            content_markdown: latest.markdown,
            content_html: latest.html,
            content_json: latest.json,
            word_count: latest.wordCount,
            base_version: currentBaseVersionRef.current,
          });
        } catch (err) {
          console.error('Failed to flush report on unmount:', err);
        }
      };
      void flushLatestAfterActiveSave();
    };
  }, []);

  const textContent = editor?.getText() || '';
  const charCount = countValidCharacters(textContent);

  const handleCopyReport = async () => {
    if (!editor) return;
    const markdown = (editor as TiptapEditor & { getMarkdown: () => string }).getMarkdown();
    const ok = await copyTextToClipboard(markdown);
    if (ok) {
      setCopied(true);
      showToast({ message: '已复制选题报告全文', tone: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } else {
      showToast({ message: '复制失败，请检查剪贴板权限', tone: 'error' });
    }
  };

  const handleClearContent = () => {
    if (!editor) return;
    editor.commands.setContent('');
    const text = '';
    const markdown = '';
    const html = '';
    const json = JSON.stringify(editor.getJSON());
    const wordCount = 0;
    latestContentRef.current = { markdown, html, json, wordCount };
    editRevisionRef.current += 1;
    hasUnsavedChangesRef.current = true;
    if (conflictPendingRef.current) {
      setSaveStatus('conflict');
    } else {
      setSaveStatus('unsaved');
      schedulePersistence();
    }
    setIsConfirmClearOpen(false);
    showToast({ message: '已清空报告内容', tone: 'info' });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)] transition-colors">
      {/* Top Floating / Fixed Toolbar */}
      <div className="relative z-30 flex h-12 w-full shrink-0 items-center justify-between border-b border-[var(--line)]/60 bg-[var(--surface)]/80 backdrop-blur-md px-3 sm:px-6 transition-colors">
        {/* Left: Module Badge & Auto-save status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-dark)] dark:text-[var(--accent)]">
            <FileText className="h-4 w-4 text-[var(--accent)]" />
            <span className="hidden sm:inline">选题报告</span>
          </div>

          <div className="h-3.5 w-px bg-stone-300 dark:bg-stone-700 mx-1 hidden sm:block" />

          {/* Auto-save pill */}
          <div className="flex items-center gap-1.5 rounded-full bg-stone-500/[0.04] px-2.5 py-0.5 text-[11px] text-[var(--ink-muted)] select-none dark:bg-stone-400/[0.06]">
            {saveStatus === 'saving' && (
              <>
                <Cloud className="h-3 w-3 animate-pulse text-[var(--accent)]" aria-hidden="true" />
                <span className="hidden sm:inline">同步中…</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-600/90 dark:text-emerald-400/90" aria-hidden="true" />
                <span className="hidden sm:inline">已同步{lastSavedTime ? ` · ${lastSavedTime}` : ''}</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <Save className="h-3 w-3 text-stone-500 dark:text-stone-400" aria-hidden="true" />
                <span className="hidden sm:inline">未保存</span>
              </>
            )}
            {saveStatus === 'conflict' && (
              <>
                <AlertTriangle className="h-3 w-3 text-red-600 dark:text-red-400" aria-hidden="true" />
                <span className="text-red-600 dark:text-red-400 font-semibold">需处理版本冲突</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span className="text-amber-600 dark:text-amber-400 font-semibold">保存失败</span>
                <button
                  type="button"
                  onClick={() => void persistReport()}
                  className="ml-1 text-[var(--accent)] hover:underline cursor-pointer"
                >
                  重试
                </button>
              </>
            )}
          </div>
        </div>

        {/* Center: Word count */}
        <div className="flex items-center gap-1.5 rounded-full bg-stone-500/[0.04] px-3 py-1 text-xs text-[var(--ink-muted)] select-none border border-[var(--line)]/40 dark:bg-stone-400/[0.06]">
          <span className="font-semibold text-[var(--ink)] tabular-nums">{charCount.toLocaleString()}</span>
          <span className="text-[11px]">字</span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyReport}
            aria-label="复制报告全文"
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-stone-500/[0.06] transition-all cursor-pointer"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{copied ? '已复制' : '复制全文'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsConfirmClearOpen(true)}
            aria-label="清空报告"
            className="grid h-7 w-7 place-items-center rounded-full text-xs text-stone-400 hover:text-red-600 hover:bg-red-500/10 transition-all cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {saveStatus === 'conflict' && (
        <div className="shrink-0 border-b border-[var(--h1-color)]/20 bg-[var(--h1-color)]/[0.04] px-4 py-3 sm:px-6" role="alert">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">本机与云端报告都已保留</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                下方编辑器保留本机内容。{hasConflictSnapshot
                  ? `云端版本${conflictReport ? `为 v${conflictReport.version}` : '目前没有报告'}。检查两个版本后，明确选择保留哪一份；选择本机版本会覆盖云端全文。`
                  : '本次响应没有提供云端快照，自动保存已暂停。请先复制本机内容，再重新加载云端版本并手动合并。'}
              </p>
            </div>

            {hasConflictSnapshot && (
              <div className="flex flex-col gap-2">
                <details className="rounded-xl bg-[var(--surface)]/70 px-3 py-2 text-xs">
                  <summary className="cursor-pointer font-medium text-[var(--ink)]">
                    查看云端版本（{(conflictReport?.content_markdown || '').length.toLocaleString()} 字符）
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-[var(--ink-muted)]">
                    {conflictReport?.content_markdown || '云端目前没有报告。'}
                  </pre>
                </details>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfirmOverwriteOpen(true)}
                    className="min-h-8 rounded-full bg-[var(--h1-color)]/10 px-3 text-xs font-medium text-[var(--h1-color)] transition-colors hover:bg-[var(--h1-color)]/15 cursor-pointer"
                  >
                    保留本机并覆盖云端
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmUseRemoteOpen(true)}
                    className="min-h-8 rounded-full bg-[var(--surface)] px-3 text-xs font-medium text-[var(--ink)] transition-colors hover:bg-[var(--accent)]/10 cursor-pointer"
                  >
                    采用云端版本
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor Body */}
      <FloatingScrollbar className="script-editor-canvas-container flex-1 bg-[var(--canvas)] flex justify-center cursor-text transition-colors">
        <div className="min-w-0 w-full max-w-4xl px-6 sm:px-12 md:px-16 pt-8 pb-36">
          <div className="mb-4 border-b border-[var(--line)] pb-3">
            <h1 className="font-sans text-xl sm:text-2xl font-bold text-[var(--ink)] tracking-tight">
              {topicTitle} · 选题报告
            </h1>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              用于整理前期资料、事件脉络与核心事实。写文案时可在文案创作中分屏对照参考。
            </p>
          </div>

          <EditorContent
            editor={editor}
            className="min-h-[500px]"
          />
          {editor && <TableEdgeControls editor={editor} deferredLoading={false} />}
        </div>
      </FloatingScrollbar>

      <ConfirmDialog
        isOpen={isConfirmClearOpen}
        onClose={() => setIsConfirmClearOpen(false)}
        onConfirm={handleClearContent}
        title="清空选题报告"
        description="确定要清空当前的选题报告内容吗？已清空的内容将在下一次保存时同步。"
        confirmText="确认清空"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={isConfirmOverwriteOpen}
        onClose={() => setIsConfirmOverwriteOpen(false)}
        onConfirm={handleKeepLocalAndOverwrite}
        title="用本机报告覆盖云端版本"
        description="将以当前云端版本号保存本机全文，云端报告会被本机内容替换。你已确认保留本机版本吗？"
        confirmText="覆盖云端并保存"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={isConfirmUseRemoteOpen}
        onClose={() => setIsConfirmUseRemoteOpen(false)}
        onConfirm={handleUseRemoteVersion}
        title="采用云端报告版本"
        description="本机未保存的报告内容将从编辑器中替换为云端版本。请确认已经检查并希望采用云端内容。"
        confirmText="采用云端版本"
        tone="warning"
      />
    </div>
  );
};
