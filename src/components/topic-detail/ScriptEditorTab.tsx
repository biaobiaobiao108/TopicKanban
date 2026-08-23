import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { CitationInput, Draft, DraftCitation, Topic, TimelineEvent, Source, AppSettings, EditorFontSize, EditorLineHeight, DEFAULT_VOICEOVER_CUES } from '../../types';
import { ScriptReferenceDrawer } from './ScriptReferenceDrawer';
import { ScriptOutlinePanel } from './ScriptOutlinePanel';
import { Modal } from '../ui/Modal';
import {
  Clock,
  CheckCircle2,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  AlignCenter,
  BookOpen,
  PanelLeftOpen,
  AlertTriangle,
  Mic,
  Share2,
  RefreshCw,
  X,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { CitationMark } from './CitationMark';
import { VoiceoverCueNode } from './VoiceoverCueNode';
import { getCitationHealth } from '../../lib/citations';
import { resolvePublicUrl } from '../../lib/publicUrl';
import {
  createShareSnapshot,
  deleteShareSnapshot,
  reportPresenceHeartbeat,
  releasePresenceHeartbeat,
} from '../../lib/storage';
import { countValidCharacters, calculateEstimatedDuration } from '../../lib/textMetrics';
import type { PresenceState, ShareSnapshot } from '../../types';

const TeleprompterModal = React.lazy(() =>
  import('./TeleprompterModal').then((m) => ({ default: m.TeleprompterModal }))
);

function getDeviceIdentifier(): { clientId: string; deviceName: string } {
  let clientId = '';
  try {
    clientId = sessionStorage.getItem('kanban_editor_client_id') || '';
    if (!clientId) {
      clientId = `client_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      sessionStorage.setItem('kanban_editor_client_id', clientId);
    }
  } catch {
    clientId = `client_${Date.now().toString(36)}`;
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let deviceName = '桌面设备';
  if (/iPhone|iPad|iPod/i.test(ua)) deviceName = 'iPhone / iOS';
  else if (/Android/i.test(ua)) deviceName = 'Android 设备';
  else if (/Macintosh|Mac OS X/i.test(ua)) deviceName = 'Mac (Chrome/Safari)';
  else if (/Windows/i.test(ua)) deviceName = 'Windows PC';
  else if (/Linux/i.test(ua)) deviceName = 'Linux 工作站';
  return { clientId, deviceName };
}
import { DraftConflictError } from '../../lib/remoteStorage';
import {
  EMPTY_SCRIPT_OUTLINE,
  extractScriptOutline,
  findActiveOutlineItem,
  type OutlineItem,
} from '../../lib/outline';

export const FONT_SIZE_MAP: Record<EditorFontSize, string> = {
  compact: '14px',
  standard: '16px',
  large: '19px',
};

export const LINE_HEIGHT_MAP: Record<EditorLineHeight, string> = {
  normal: '1.6',
  relaxed: '1.8',
  loose: '2.1',
};

interface ScriptEditorTabProps {
  topicId: string;
  topicTitle: string;
  topic?: Topic;
  timeline?: TimelineEvent[];
  sources?: Source[];
  citations: DraftCitation[];
  initialDraft: Draft | null;
  readingSpeed: number; // default ~280 chars/min
  settings?: AppSettings;
  onSaveDraft: (
    topicId: string,
    contentHtml: string,
    contentJson: string,
    wordCount: number
  ) => Promise<void>;
  onCacheDraftLocally: (contentHtml: string, contentJson: string, wordCount: number) => void;
  onSaveDraftImmediately: (contentHtml: string, contentJson: string, wordCount: number) => void;
  onSaveCitation: (input: CitationInput) => Promise<DraftCitation>;
}

const canKeepBothSidePanelsOpen = () =>
  typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

const isMobileEditor = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

export const ScriptEditorTab: React.FC<ScriptEditorTabProps> = ({
  topicId,
  topicTitle,
  topic,
  timeline = [],
  sources = [],
  citations,
  initialDraft,
  readingSpeed,
  settings,
  onSaveDraft,
  onCacheDraftLocally,
  onSaveDraftImmediately,
  onSaveCitation,
}) => {
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'local' | 'pending' | 'conflict'>('saved');
  const [draftConflict, setDraftConflict] = useState<Draft | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string>(
    initialDraft?.updated_at ? new Date(initialDraft.updated_at).toLocaleTimeString() : '刚刚'
  );
  const [copied, setCopied] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isTypewriterMode, setIsTypewriterMode] = useState(
    settings?.typewriter_mode_default ?? false
  );
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [outline, setOutline] = useState(EMPTY_SCRIPT_OUTLINE);
  const [activeOutlineItemId, setActiveOutlineItemId] = useState<string | null>(null);
  const [isTeleprompterOpen, setIsTeleprompterOpen] = useState(false);
  const [isCueMenuOpen, setIsCueMenuOpen] = useState(false);
  const [lastInsertedCue, setLastInsertedCue] = useState<string | null>(null);
  const lastInsertedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cueMenuContainerRef = useRef<HTMLDivElement | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const typewriterBottomSpacerRef = useRef<HTMLDivElement | null>(null);
  const isTypewriterModeRef = useRef(isTypewriterMode);
  const scrollTargetRef = useRef<number | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const scrollMeasureFrameRef = useRef<number | null>(null);
  const lastScrollFrameTimeRef = useRef<number | null>(null);
  const prefersReducedMotionRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const latestContentRef = useRef<{ html: string; json: string; wordCount: number } | null>(null);
  const immediateSaveRef = useRef(onSaveDraftImmediately);
  const localCacheRef = useRef(onCacheDraftLocally);
  const editVersionRef = useRef(0);
  const outlineHighlightAnimationRef = useRef<Animation | null>(null);
  const outlineRef = useRef(EMPTY_SCRIPT_OUTLINE);
  const effectiveSpeed = readingSpeed || 280;
  const readingSpeedRef = useRef(effectiveSpeed);
  const outlineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Presence & Multi-device lock state
  const [presenceState, setPresenceState] = useState<PresenceState>({ is_locked: false });
  const [dismissLockBanner, setDismissLockBanner] = useState(false);

  // Share state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [currentShare, setCurrentShare] = useState<{ token: string; url: string; expires_at: string } | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Presence Heartbeat Effect
  useEffect(() => {
    const { clientId, deviceName } = getDeviceIdentifier();
    let isMounted = true;

    const pingPresence = async () => {
      try {
        const result = await reportPresenceHeartbeat(topicId, clientId, deviceName);
        if (isMounted) setPresenceState(result);
      } catch {
        // ignore
      }
    };

    void pingPresence();
    const interval = setInterval(pingPresence, 15000);

    const handleRelease = () => {
      void releasePresenceHeartbeat(topicId, clientId);
    };

    window.addEventListener('pagehide', handleRelease);
    window.addEventListener('beforeunload', handleRelease);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('pagehide', handleRelease);
      window.removeEventListener('beforeunload', handleRelease);
      handleRelease();
    };
  }, [topicId]);

  const handleShareReviewClick = async () => {
    if (currentShare) {
      setIsShareModalOpen(true);
      return;
    }
    await doGenerateShareSnapshot();
  };

  const doGenerateShareSnapshot = async () => {
    setIsGeneratingShare(true);
    try {
      const defaultDays = settings?.default_share_ttl_days || 3;
      const ttlSeconds = defaultDays * 86400;
      const result = await createShareSnapshot(topicId, ttlSeconds);
      const fullUrl = resolvePublicUrl(result.url, settings?.public_base_url) || (result as { full_url?: string }).full_url || `${window.location.origin}${result.url}`;
      setCurrentShare({ token: result.token, url: fullUrl, expires_at: result.expires_at });
      setIsShareModalOpen(true);

      try {
        await navigator.clipboard.writeText(fullUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      } catch {
        // clipboard write may need manual copy fallback
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '生成审稿链接失败');
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!currentShare) return;
    try {
      await navigator.clipboard.writeText(currentShare.url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDeleteShare = async () => {
    if (!currentShare) return;
    try {
      await deleteShareSnapshot(topicId, currentShare.token);
      setCurrentShare(null);
      setIsShareModalOpen(false);
    } catch {
      // ignore
    }
  };

  isTypewriterModeRef.current = isTypewriterMode;
  readingSpeedRef.current = effectiveSpeed;

  useEffect(() => {
    immediateSaveRef.current = onSaveDraftImmediately;
  }, [onSaveDraftImmediately]);

  useEffect(() => {
    localCacheRef.current = onCacheDraftLocally;
  }, [onCacheDraftLocally]);

  // Global hotkeys for Zen mode & Teleprompter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + P -> Open Teleprompter
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        e.stopPropagation();
        setIsTeleprompterOpen(true);
        return;
      }
      // Cmd/Ctrl + Shift + F -> Toggle Zen Mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setIsZenMode((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (isCueMenuOpen) {
          e.preventDefault();
          setIsCueMenuOpen(false);
          return;
        }
        if (isOutlineOpen) {
          e.preventDefault();
          setIsOutlineOpen(false);
        } else if (isReferenceOpen) {
          e.preventDefault();
          setIsReferenceOpen(false);
        } else if (isZenMode) {
          e.preventDefault();
          setIsZenMode(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOutlineOpen, isReferenceOpen, isZenMode, isCueMenuOpen]);

  // Initialize Tiptap
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: '在此撰写视频解说文案... 支持标准 Markdown 语法（# 标题，**加粗**，> 引用），可通过右侧抽屉插入事实参考。',
      }),
      CharacterCount,
      CitationMark,
      VoiceoverCueNode,
    ],
    content: initialDraft?.content_html || `<h1>【开场】${topicTitle}</h1><p></p>`,
    editorProps: {
      attributes: {
        class: 'prose prose-stone max-w-none focus:outline-none min-h-[500px] text-stone-900 dark:text-stone-100 font-normal',
      },
      handleScrollToSelection: () => isTypewriterModeRef.current,
    },
    onCreate: ({ editor }) => {
      const nextOutline = extractScriptOutline(editor, readingSpeedRef.current);
      outlineRef.current = nextOutline;
      setOutline(nextOutline);
      setActiveOutlineItemId(
        findActiveOutlineItem(nextOutline, editor.state.selection.from)?.id || null
      );
    },
    onSelectionUpdate: ({ editor }) => {
      setActiveOutlineItemId(
        findActiveOutlineItem(outlineRef.current, editor.state.selection.from)?.id || null
      );
    },
    onUpdate: ({ editor }) => {
      // Debounce outline computation for typing smoothness
      if (outlineDebounceRef.current) clearTimeout(outlineDebounceRef.current);
      outlineDebounceRef.current = setTimeout(() => {
        const nextOutline = extractScriptOutline(editor, readingSpeedRef.current);
        outlineRef.current = nextOutline;
        setOutline(nextOutline);
        setActiveOutlineItemId(
          findActiveOutlineItem(nextOutline, editor.state.selection.from)?.id || null
        );
      }, 250);

      editVersionRef.current += 1;
      const text = editor.getText();
      latestContentRef.current = {
        html: editor.getHTML(),
        json: JSON.stringify(editor.getJSON()),
        wordCount: text.replace(/\s+/g, '').length,
      };
      hasUnsavedChangesRef.current = true;
      setSaveStatus('unsaved');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (localSaveTimeoutRef.current) clearTimeout(localSaveTimeoutRef.current);

      localSaveTimeoutRef.current = setTimeout(() => {
        const latest = latestContentRef.current;
        if (!latest) return;
        localCacheRef.current(latest.html, latest.json, latest.wordCount);
        setSaveStatus('local');
      }, 1500);

      // Cloudflare write: only after the editor has been idle for 20 seconds.
      saveTimeoutRef.current = setTimeout(async () => {
        setSaveStatus('saving');
        const latest = latestContentRef.current;
        const savingVersion = editVersionRef.current;
        if (!latest) return;

        try {
          await onSaveDraft(topicId, latest.html, latest.json, latest.wordCount);
          if (savingVersion === editVersionRef.current) {
            hasUnsavedChangesRef.current = false;
            setSaveStatus('saved');
            setLastSavedTime(new Date().toLocaleTimeString());
          } else {
            setSaveStatus('unsaved');
          }
        } catch (error) {
          console.error(error);
          if (error instanceof DraftConflictError) {
            setSaveStatus('conflict');
            setDraftConflict(error.current);
          } else {
            setSaveStatus('pending');
          }
        }
      }, 45000);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextOutline = extractScriptOutline(editor, effectiveSpeed);
    outlineRef.current = nextOutline;
    setOutline(nextOutline);
    setActiveOutlineItemId(
      findActiveOutlineItem(nextOutline, editor.state.selection.from)?.id || null
    );
  }, [editor, effectiveSpeed]);

  // Calculate stats
  const textContent = editor?.getText() || '';
  const charCount = countValidCharacters(textContent);
  const estimatedDuration = calculateEstimatedDuration(charCount, effectiveSpeed);
  const estMinutes = estimatedDuration.minutes;
  const estSeconds = estimatedDuration.seconds;

  const resolveDraftConflict = async (choice: 'local' | 'remote') => {
    if (!draftConflict || !latestContentRef.current) return;
    if (choice === 'local') {
      try {
        const latest = latestContentRef.current;
        setSaveStatus('saving');
        await onSaveDraft(topicId, latest.html, latest.json, latest.wordCount);
        hasUnsavedChangesRef.current = false;
        setSaveStatus('saved');
        setLastSavedTime(new Date().toLocaleTimeString());
        setDraftConflict(null);
      } catch (error) {
        console.error(error);
        setSaveStatus('pending');
      }
      return;
    }
    editor?.commands.setContent(draftConflict.content_html || '', false);
    latestContentRef.current = {
      html: draftConflict.content_html,
      json: draftConflict.content_json,
      wordCount: draftConflict.word_count,
    };
    hasUnsavedChangesRef.current = false;
    setSaveStatus('saved');
    setLastSavedTime(new Date(draftConflict.updated_at).toLocaleTimeString());
    setDraftConflict(null);
  };

  // Flush pending content synchronously before leaving
  useEffect(() => {
    const flushPendingDraft = () => {
      if (!hasUnsavedChangesRef.current || !latestContentRef.current) return;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (localSaveTimeoutRef.current) {
        clearTimeout(localSaveTimeoutRef.current);
        localSaveTimeoutRef.current = null;
      }
      const latest = latestContentRef.current;
      immediateSaveRef.current(latest.html, latest.json, latest.wordCount);
      hasUnsavedChangesRef.current = false;
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushPendingDraft();
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushPendingDraft);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (localSaveTimeoutRef.current) clearTimeout(localSaveTimeoutRef.current);
      flushPendingDraft();
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushPendingDraft);
    };
  }, []);

  const cancelTypewriterScroll = useCallback(() => {
    if (scrollAnimationFrameRef.current !== null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
    if (scrollMeasureFrameRef.current !== null) {
      cancelAnimationFrame(scrollMeasureFrameRef.current);
      scrollMeasureFrameRef.current = null;
    }
    scrollTargetRef.current = null;
    lastScrollFrameTimeRef.current = null;
  }, []);

  const animateTypewriterScroll = useCallback((timestamp: number) => {
    const container = scrollContainerRef.current;
    const target = scrollTargetRef.current;
    if (!container || target === null || !isTypewriterModeRef.current) {
      scrollAnimationFrameRef.current = null;
      lastScrollFrameTimeRef.current = null;
      return;
    }

    const distance = target - container.scrollTop;
    if (Math.abs(distance) <= 1) {
      container.scrollTop = target;
      scrollAnimationFrameRef.current = null;
      lastScrollFrameTimeRef.current = null;
      return;
    }

    const previousTimestamp = lastScrollFrameTimeRef.current ?? timestamp - 16;
    const elapsed = Math.min(timestamp - previousTimestamp, 32);
    const easing = 1 - Math.exp(-elapsed / 55);
    container.scrollTop += distance * easing;
    lastScrollFrameTimeRef.current = timestamp;
    scrollAnimationFrameRef.current = requestAnimationFrame(animateTypewriterScroll);
  }, []);

  const scheduleTypewriterScroll = useCallback(() => {
    if (!editor || !isTypewriterModeRef.current || scrollMeasureFrameRef.current !== null) return;

    scrollMeasureFrameRef.current = requestAnimationFrame(() => {
      scrollMeasureFrameRef.current = null;
      const container = scrollContainerRef.current;
      if (!container || !isTypewriterModeRef.current) return;

      try {
        const coords = editor.view.coordsAtPos(editor.state.selection.head);
        const containerRect = container.getBoundingClientRect();
        const cursorCenterY = (coords.top + coords.bottom) / 2;
        const targetY = containerRect.top + containerRect.height * 0.6;
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const nextScrollTop = Math.min(
          maxScrollTop,
          Math.max(0, container.scrollTop + cursorCenterY - targetY)
        );

        scrollTargetRef.current = nextScrollTop;
        if (prefersReducedMotionRef.current) {
          container.scrollTop = nextScrollTop;
          return;
        }
        if (scrollAnimationFrameRef.current === null) {
          lastScrollFrameTimeRef.current = null;
          scrollAnimationFrameRef.current = requestAnimationFrame(animateTypewriterScroll);
        }
      } catch {
        // coordsAtPos can briefly be unavailable while ProseMirror applies a transaction.
      }
    });
  }, [animateTypewriterScroll, editor]);

  // Typewriter mode: start at the natural top, then keep the active line at 60% once reached.
  useLayoutEffect(() => {
    if (!editor || !isTypewriterMode) return;

    const container = scrollContainerRef.current;
    const bottomSpacer = typewriterBottomSpacerRef.current;
    if (!container || !bottomSpacer) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => {
      prefersReducedMotionRef.current = motionQuery.matches;
    };
    const updateTypewriterInsets = () => {
      const containerHeight = container.clientHeight;
      bottomSpacer.style.height = `${containerHeight * 0.4}px`;
      scheduleTypewriterScroll();
    };
    const stopFollowingForManualScroll = () => cancelTypewriterScroll();
    const resizeObserver = new ResizeObserver(updateTypewriterInsets);

    updateMotionPreference();
    updateTypewriterInsets();
    resizeObserver.observe(container);
    editor.on('transaction', scheduleTypewriterScroll);
    editor.on('focus', scheduleTypewriterScroll);
    container.addEventListener('wheel', stopFollowingForManualScroll, { passive: true });
    container.addEventListener('touchstart', stopFollowingForManualScroll, { passive: true });
    container.addEventListener('pointerdown', stopFollowingForManualScroll, { passive: true });
    motionQuery.addEventListener('change', updateMotionPreference);

    scheduleTypewriterScroll();

    return () => {
      resizeObserver.disconnect();
      editor.off('transaction', scheduleTypewriterScroll);
      editor.off('focus', scheduleTypewriterScroll);
      container.removeEventListener('wheel', stopFollowingForManualScroll);
      container.removeEventListener('touchstart', stopFollowingForManualScroll);
      container.removeEventListener('pointerdown', stopFollowingForManualScroll);
      motionQuery.removeEventListener('change', updateMotionPreference);
      cancelTypewriterScroll();
    };
  }, [cancelTypewriterScroll, editor, isTypewriterMode, scheduleTypewriterScroll]);

  // Insert content from Reference Drawer
  const handleInsertFromDrawer = async (input: CitationInput) => {
    if (!editor) return;
    const citation = await onSaveCitation(input);
    editor.chain().focus().insertContent({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: input.quoted_text,
        marks: [{ type: 'citation', attrs: { citationId: citation.id, referenceTitle: citation.reference_title } }],
      }],
    }).run();
  };

  const currentHtml = editor?.getHTML() || initialDraft?.content_html || '';
  const activeCitations = citations.filter((citation) => currentHtml.includes(`data-citation-id=\"${citation.id}\"`));
  const citationHealth = topic ? getCitationHealth(activeCitations, { topic, sources, timeline }) : null;

  const toggleOutlinePanel = () => {
    if (!isOutlineOpen && !canKeepBothSidePanelsOpen()) setIsReferenceOpen(false);
    setIsOutlineOpen((current) => !current);
  };

  const openReferencePanel = () => {
    if (!canKeepBothSidePanelsOpen()) setIsOutlineOpen(false);
    setIsReferenceOpen(true);
  };

  const toggleReferencePanel = () => {
    if (!isReferenceOpen && !canKeepBothSidePanelsOpen()) setIsOutlineOpen(false);
    setIsReferenceOpen((current) => !current);
  };

  const handleSelectOutlineItem = (item: OutlineItem) => {
    if (!editor) return;

    try {
      editor.chain().focus().setTextSelection(item.textPos).run();
      setActiveOutlineItemId(item.id);

      requestAnimationFrame(() => {
        const headingElement = editor.view.dom.querySelectorAll<HTMLElement>('h1, h2, h3')[item.index];
        if (!headingElement) return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        headingElement.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        outlineHighlightAnimationRef.current?.cancel();
        if (reduceMotion) return;
        outlineHighlightAnimationRef.current = headingElement.animate(
          [
            {
              backgroundColor: 'rgb(255 241 242 / 0.95)',
              boxShadow: 'inset 3px 0 0 rgb(225 29 72 / 0.75)',
            },
            {
              backgroundColor: 'transparent',
              boxShadow: 'inset 3px 0 0 rgb(225 29 72 / 0)',
            },
          ],
          { duration: 1200, easing: 'ease-out' }
        );
      });

      if (isMobileEditor()) setIsOutlineOpen(false);
    } catch {
      // The document may have changed between rendering the outline and clicking an item.
    }
  };

  useEffect(() => () => {
    outlineHighlightAnimationRef.current?.cancel();
    if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
  }, []);

  const copyFullScript = () => {
    if (!editor) return;
    const text = editor.getText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
    copyFeedbackTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleInsertVoiceoverCue = (cue: string) => {
    if (!editor) return;
    const cleanCue = cue.replace(/^\[+|\]+$/g, '').trim();
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'voiceoverCue',
        attrs: { cue: cleanCue },
      })
      .insertContent(' ')
      .run();
    setLastInsertedCue(cleanCue);
    if (lastInsertedTimeoutRef.current) clearTimeout(lastInsertedTimeoutRef.current);
    lastInsertedTimeoutRef.current = setTimeout(() => setLastInsertedCue(null), 1500);
  };

  if (!editor) return null;

  return (
    <div
      className={
        isZenMode
          ? 'fixed inset-0 z-50 bg-[#fafaf9] dark:bg-[#0c0a09] flex flex-col transition-all duration-300 ease-in-out'
          : 'w-full h-full flex flex-col'
      }
    >
      <Modal
        isOpen={Boolean(draftConflict)}
        onClose={() => undefined}
        title="云端文案已有更新"
        subtitle="请选择要保留的版本，避免覆盖其他设备的编辑。"
        maxWidth="md"
      >
        {draftConflict && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="font-semibold text-rose-900">当前本地文案</div>
                <div className="mt-2 text-xs text-stone-600">{latestContentRef.current?.wordCount || 0} 字 · 尚未同步</div>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="font-semibold text-stone-900">云端最新版本</div>
                <div className="mt-2 text-xs text-stone-600">{draftConflict.word_count} 字 · {new Date(draftConflict.updated_at).toLocaleString()}</div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => void resolveDraftConflict('remote')} className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">使用云端版本</button>
              <button type="button" onClick={() => void resolveDraftConflict('local')} className="min-h-11 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">保留本地文案</button>
            </div>
          </div>
        )}
      </Modal>
      {/* Top Floating / Fixed Toolbar (Hidden in Zen Mode) */}
      {!isZenMode && (
        <div className="script-editor-toolbar bg-white/95 dark:bg-stone-900/95 backdrop-blur-xs border-b border-stone-200 dark:border-stone-800 px-3 sm:px-6 py-2 flex items-center justify-between flex-wrap gap-2 shrink-0 z-30 shadow-2xs transition-colors">
          {/* Left: Outline, Reference Drawer, and Status Indicator */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Outline Toggle */}
            <button
              type="button"
              onClick={toggleOutlinePanel}
              aria-label="展开/收起文案大纲与章节定位"
              aria-pressed={isOutlineOpen}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                isOutlineOpen
                  ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 shadow-2xs'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700/80 shadow-2xs'
              }`}
              title="展开/收起文案大纲与章节定位 (Esc 收起)"
            >
              <PanelLeftOpen className="h-3.5 w-3.5 text-rose-500" />
              <span className="hidden sm:inline">大纲</span>
              {outline.flatItems.length > 0 && (
                <span className="rounded-full bg-rose-100 dark:bg-rose-900/60 px-1.5 text-[10px] font-bold text-rose-800 dark:text-rose-200 font-mono">
                  {outline.flatItems.length}
                </span>
              )}
            </button>

            {/* Side Reference Toggle */}
            {topic && (
              <button
                type="button"
                onClick={toggleReferencePanel}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  isReferenceOpen
                    ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 shadow-2xs'
                    : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700/80 shadow-2xs'
                }`}
                title="展开/收起边写边看事实参考抽屉"
              >
                <BookOpen className="w-3.5 h-3.5 text-rose-500" />
                <span className="hidden sm:inline">事实参考</span>
                {citationHealth && citationHealth.unverifiedCount > 0 && (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-1.5 text-[10px] text-amber-800 dark:text-amber-300 font-mono font-bold">
                    {citationHealth.unverifiedCount}
                  </span>
                )}
              </button>
            )}

            {/* Auto save indicator */}
            <div className="flex items-center text-[10px] font-medium transition-all ml-1.5 select-none shrink-0">
              {saveStatus === 'saving' && (
                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400" title="正在同步至云端...">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="hidden sm:inline text-stone-500 dark:text-stone-400">同步中</span>
                </div>
              )}
              {saveStatus === 'saved' && (
                <div
                  className="flex items-center gap-1 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                  title={`云端已同步${lastSavedTime ? ` · ${lastSavedTime}` : ''}`}
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-600/80 dark:text-emerald-400/80" />
                  <span className="hidden sm:inline">已同步</span>
                </div>
              )}
              {(saveStatus === 'local' || saveStatus === 'unsaved' || saveStatus === 'pending') && (
                <div
                  className="flex items-center gap-1 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                  title="本地草稿已实时安全暂存防丢"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                  <span className="hidden sm:inline">已暂存</span>
                </div>
              )}
              {saveStatus === 'conflict' && (
                <span className="flex items-center gap-1 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-2 py-0.5 rounded-md font-bold">
                  <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
                  <span>版本冲突</span>
                </span>
              )}
            </div>
          </div>

          {/* Right: Metrics, Voiceover Cues, Utilities & Primary Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Word count & Estimated duration pill */}
            <div className="flex items-center gap-1.5 bg-stone-100/90 dark:bg-stone-800/80 border border-stone-200/80 dark:border-stone-700 px-2.5 py-1 rounded-lg text-xs">
              <span className="font-mono text-stone-800 dark:text-stone-200 font-bold px-0.5">
                {charCount.toLocaleString()} <span className="font-normal text-stone-500 dark:text-stone-400 text-[11px]">字</span>
              </span>
              <span className="text-stone-300 dark:text-stone-600">·</span>
              <span
                className="flex items-center gap-1 text-rose-700 dark:text-rose-400 font-semibold font-mono text-[11px]"
                title={`预估时长（按偏好设置 ${effectiveSpeed} 字/分钟计算）`}
              >
                <Clock className="w-3 h-3 text-rose-500 shrink-0" />
                <span>{estMinutes}分{estSeconds}秒</span>
              </span>
            </div>

            {/* Voiceover Cue Dropdown (Sticky continuous insertion) */}
            <div ref={cueMenuContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setIsCueMenuOpen((prev) => !prev)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  isCueMenuOpen
                    ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-2xs'
                    : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700/80 shadow-2xs'
                }`}
                title="插入演播配音气口标记（展开后常驻，可连续打标）"
              >
                <Mic className="w-3.5 h-3.5 text-rose-500" />
                <span className="hidden sm:inline">气口</span>
              </button>

              {isCueMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-stone-850 rounded-xl border border-stone-200 dark:border-stone-700 p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 font-sans">
                  <div className="flex items-center justify-between text-[10px] font-bold text-stone-400 dark:text-stone-500 px-1 py-0.5 uppercase tracking-wider border-b border-stone-100 dark:border-stone-800 pb-1.5 mb-1.5">
                    <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                      <Mic className="w-3 h-3" />
                      <span>气口库 · 连续打标</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {lastInsertedCue && (
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold animate-in fade-in">
                          已插入 [{lastInsertedCue}] ✓
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsCueMenuOpen(false)}
                        className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-0.5 rounded cursor-pointer transition-colors"
                        title="关闭选单 (Esc)"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-0.5 max-h-56 overflow-y-auto pr-0.5">
                    {(settings?.voiceover_cues?.length ? settings.voiceover_cues : DEFAULT_VOICEOVER_CUES).map((cue) => {
                      const isJustInserted = lastInsertedCue === cue.replace(/^\[+|\]+$/g, '').trim();
                      return (
                        <button
                          key={cue}
                          type="button"
                          onClick={() => handleInsertVoiceoverCue(cue)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between group transition-colors cursor-pointer ${
                            isJustInserted
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                              : 'text-stone-700 dark:text-stone-200 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-mono font-semibold">🎙️ {cue}</span>
                          </div>
                          <span className="text-[10px] text-stone-400 group-hover:text-rose-500 opacity-0 group-hover:opacity-100 font-mono">
                            {isJustInserted ? '已加' : '插入'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Typewriter Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsTypewriterMode((current) => !current)}
              className={`p-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isTypewriterMode
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 shadow-2xs'
                  : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700/80 shadow-2xs'
              }`}
              title={isTypewriterMode ? '关闭打字机模式' : '开启打字机模式（当前编辑行保持居中）'}
            >
              <AlignCenter className="w-3.5 h-3.5 text-rose-500" />
            </button>

            {/* Public Review Share Button */}
            <button
              type="button"
              onClick={handleShareReviewClick}
              disabled={isGeneratingShare}
              className="flex items-center gap-1.5 text-xs font-semibold bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 px-2.5 py-1 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
              title="一键生成免登录外部审稿快照并自动复制链接"
            >
              <Share2 className={`w-3.5 h-3.5 text-rose-500 ${isGeneratingShare ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isGeneratingShare ? '生成中…' : '分享'}</span>
            </button>

            {/* Copy Full Script */}
            <button
              type="button"
              onClick={copyFullScript}
              className="p-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 shadow-2xs transition-colors cursor-pointer"
              title="复制文案全文"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Immersive Writing Mode (Zen Mode) Toggle */}
            <button
              type="button"
              onClick={() => setIsZenMode(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700/80 shadow-2xs transition-all cursor-pointer"
              title="开启沉浸写作模式 (Cmd/Ctrl + Shift + F)"
            >
              <Maximize2 className="w-3.5 h-3.5 text-rose-500" />
              <span className="hidden sm:inline">沉浸写作</span>
            </button>

            {/* Teleprompter Fullscreen Button */}
            <button
              type="button"
              onClick={() => setIsTeleprompterOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 active:scale-95 text-white shadow-2xs transition-all cursor-pointer"
              title="开启全屏沉浸录音提词器 (Cmd/Ctrl + Shift + P)"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>录音提词</span>
            </button>
          </div>
        </div>
      )}

      {/* Multi-device Presence Lock Conflict Alert Banner (Hidden in Zen Mode) */}
      {!isZenMode && presenceState.is_locked && !dismissLockBanner && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 sm:px-6 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate">
              ⚠️ 检测到本文案当前正在【{presenceState.active_editor?.device_name || '其他设备'}】上编辑中（活跃于刚刚），请留意多端同步，避免互相覆盖。
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissLockBanner(true)}
            className="text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 p-1 rounded-lg shrink-0 cursor-pointer"
            title="关闭提示"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!isZenMode && citationHealth && (citationHealth.staleCount > 0 || citationHealth.unverifiedCount > 0) && (
        <button
          type="button"
          onClick={openReferencePanel}
          className="flex shrink-0 items-center gap-2 border-b border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/50 px-3 py-2 text-left text-xs font-semibold text-amber-900 dark:text-amber-200 sm:px-6 cursor-pointer"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            引用检查：{citationHealth.unverifiedCount} 处引用尚未核实
            {citationHealth.staleCount > 0 ? `，${citationHealth.staleCount} 处原资料已变更` : ''}
          </span>
          <span className="ml-auto text-[11px] text-amber-700 dark:text-amber-400">查看资料 →</span>
        </button>
      )}

      {/* Floating Zen Controls */}
      {isZenMode && (
        <>
          {/* Top-Left: Floating Outline Drawer Toggle (Hidden when outline drawer is open) */}
          {!isOutlineOpen && (
            <div className="fixed left-5 sm:left-8 top-5 sm:top-7 z-40 animate-in fade-in zoom-in-95 duration-200">
              <button
                type="button"
                onClick={toggleOutlinePanel}
                aria-label="展开/收起文案大纲"
                className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold backdrop-blur-md shadow-lg transition-all cursor-pointer hover:scale-[1.03] active:scale-[0.98] bg-white/90 dark:bg-stone-900/90 border-stone-200/90 dark:border-stone-700/80 text-stone-700 dark:text-stone-200 hover:bg-white dark:hover:bg-stone-850"
                title="大纲章节快速定位"
              >
                <PanelLeftOpen className="h-3.5 w-3.5 text-rose-500" />
                <span>大纲</span>
                {outline.flatItems.length > 0 && (
                  <span className="rounded-full px-1.5 text-[10px] font-bold font-mono bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
                    {outline.flatItems.length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Top-Right: Floating Reference Drawer Toggle & Exit Button (Adapts position when reference drawer is open) */}
          <div className={`fixed right-5 sm:right-8 top-5 sm:top-7 z-40 flex items-center gap-2 transition-all duration-200 ${isReferenceOpen ? 'mr-80 sm:mr-96' : ''}`}>
            {!isReferenceOpen && topic && (
              <button
                type="button"
                onClick={toggleReferencePanel}
                aria-label="展开/收起事实参考"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border backdrop-blur-md shadow-lg transition-all cursor-pointer hover:scale-[1.03] active:scale-[0.98] bg-white/90 dark:bg-stone-900/90 border-stone-200/90 dark:border-stone-700/80 text-stone-700 dark:text-stone-200 hover:bg-white dark:hover:bg-stone-850"
                title="展开/收起边写边看事实参考抽屉"
              >
                <BookOpen className="w-3.5 h-3.5 text-rose-500" />
                <span className="hidden sm:inline">事实参考</span>
                {citationHealth && citationHealth.unverifiedCount > 0 && (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-1.5 text-[10px] text-amber-800 dark:text-amber-300 font-mono font-bold">
                    {citationHealth.unverifiedCount}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsZenMode(false)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border bg-stone-900/90 dark:bg-stone-800/90 hover:bg-stone-900 dark:hover:bg-stone-700 text-white border-stone-700/80 backdrop-blur-md shadow-lg transition-all cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
              title="退出沉浸写作模式 (Esc)"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">退出沉浸</span>
              <kbd className="text-[10px] font-mono bg-white/20 px-1 py-0.2 rounded text-white/90 ml-0.5">Esc</kbd>
            </button>
          </div>

          {/* Bottom-Right: Floating Stats Capsule (Theme Adaptive & Responsive) */}
          <div className={`fixed right-5 sm:right-8 bottom-5 sm:bottom-7 z-40 flex items-center gap-2.5 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border border-stone-200/90 dark:border-stone-700/80 text-stone-800 dark:text-stone-100 px-4 py-2 rounded-full text-xs font-mono shadow-xl transition-all duration-200 select-none ${isReferenceOpen ? 'mr-80 sm:mr-96' : ''}`}>
            <span className="font-bold text-stone-900 dark:text-stone-100 font-mono">
              {charCount.toLocaleString()} <span className="font-normal text-stone-400 dark:text-stone-500 text-[11px]">字</span>
            </span>
            <span className="text-stone-300 dark:text-stone-700">·</span>
            <span
              className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold font-mono text-[11px]"
              title={`预估时长（按 ${effectiveSpeed} 字/分钟计算）`}
            >
              <Clock className="w-3 h-3 text-rose-500 shrink-0" />
              <span>{estMinutes}分{estSeconds}秒</span>
            </span>
            <span className="text-stone-300 dark:text-stone-700">·</span>
            <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400 font-medium">
              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title="正在同步至云端...">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="hidden sm:inline">同步中</span>
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold" title="云端已同步">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="hidden sm:inline">已同步</span>
                </span>
              )}
              {(saveStatus === 'local' || saveStatus === 'unsaved' || saveStatus === 'pending') && (
                <span className="flex items-center gap-1 text-stone-600 dark:text-stone-400" title="本地已安全暂存">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                  <span className="hidden sm:inline">已暂存</span>
                </span>
              )}
              {saveStatus === 'conflict' && (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold" title="版本冲突">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  <span className="hidden sm:inline">冲突</span>
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Writing Canvas & Side Drawer Split Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <ScriptOutlinePanel
          isOpen={isOutlineOpen}
          outline={outline}
          activeItemId={activeOutlineItemId}
          onClose={() => setIsOutlineOpen(false)}
          onSelectHeading={handleSelectOutlineItem}
        />

        {/* Main Writing Canvas */}
        <div
          ref={scrollContainerRef}
          style={{
            ['--script-editor-font-size' as string]: FONT_SIZE_MAP[settings?.editor_font_size || 'standard'],
            ['--script-editor-line-height' as string]: LINE_HEIGHT_MAP[settings?.editor_line_height || 'relaxed'],
          }}
          className="script-editor-canvas-container flex-1 overflow-y-auto bg-white dark:bg-stone-900 flex justify-center cursor-text transition-colors"
        >
          <div
            className={`w-full max-w-4xl px-6 sm:px-12 md:px-16 transition-all ${
              isTypewriterMode
                ? 'pt-8 sm:pt-12'
                : 'pt-8 pb-36 sm:pt-12 sm:pb-48'
            }`}
          >
            <EditorContent
              editor={editor}
              className="min-h-[500px]"
            />
            {isTypewriterMode && <div ref={typewriterBottomSpacerRef} aria-hidden="true" />}
          </div>
        </div>

        {/* Side Reference Drawer */}
        {topic && (
          <ScriptReferenceDrawer
            isOpen={isReferenceOpen}
            onClose={() => setIsReferenceOpen(false)}
            topic={topic}
            timeline={timeline}
            sources={sources}
            staleReferenceIds={citationHealth?.states
              .filter((state) => state.stale)
              .map((state) => state.citation.reference_id) || []}
            onInsertContent={handleInsertFromDrawer}
          />
        )}
      </div>

      {/* Full-Screen Immersive Teleprompter */}
      {isTeleprompterOpen && (
        <React.Suspense fallback={null}>
          <TeleprompterModal
            isOpen={isTeleprompterOpen}
            onClose={() => setIsTeleprompterOpen(false)}
            topicTitle={topicTitle}
            contentHtml={editor?.getHTML() || initialDraft?.content_html || ''}
            outline={outline}
            readingSpeed={effectiveSpeed}
            totalWordCount={charCount}
          />
        </React.Suspense>
      )}

      {/* Share Review Snapshot Modal */}
      {isShareModalOpen && currentShare && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsShareModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 sm:p-6 max-w-md w-full shadow-modal space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/60">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                    <span>外部审稿链接已就绪</span>
                    {shareCopied && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-200/80 dark:border-emerald-900/60">
                        已自动复制
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-stone-400 dark:text-stone-500">
                    免登录只读快照 · 有效期 {settings?.default_share_ttl_days || 3} 天 (KV 物理自动销毁)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700/80 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-500 dark:text-stone-400">有效截止时间：</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                    {new Date(currentShare.expires_at).toLocaleString([], {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={currentShare.url}
                    className="flex-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-stone-800 dark:text-stone-200 select-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyShareLink}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    {shareCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{shareCopied ? '已复制' : '复制'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100 dark:border-stone-800 text-[11px]">
                <div className="flex items-center gap-3">
                  <a
                    href={currentShare.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
                  >
                    <span>在新标签页预览</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    type="button"
                    onClick={doGenerateShareSnapshot}
                    disabled={isGeneratingShare}
                    className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isGeneratingShare ? 'animate-spin' : ''}`} />
                    <span>同步最新草稿</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDeleteShare}
                  className="font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
                >
                  撤回并销毁
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
