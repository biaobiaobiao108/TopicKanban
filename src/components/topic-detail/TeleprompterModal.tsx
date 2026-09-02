import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  Pause,
  RotateCcw,
  Sun,
  Moon,
  Type,
  Gauge,
  X,
  FlipHorizontal,
  Menu,
  ChevronRight,
  Clock,
  Sparkles,
  CheckCircle2,
  Maximize,
  Minimize,
  Keyboard
} from 'lucide-react';
import { ScriptOutline, OutlineItem, formatOutlineDuration } from '../../lib/outline';

interface TeleprompterModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicTitle: string;
  contentHtml: string;
  outline: ScriptOutline;
  readingSpeed: number; // e.g. 240 / 280 / 340
  totalWordCount: number;
}

interface ParsedBlock {
  id: string;
  type: 'h1' | 'h2' | 'h3' | 'p' | 'quote' | 'list-item';
  text: string;
  charCount: number;
  chapterTitle?: string;
}

const FONT_SIZES = [
  { level: 1, label: '小', sizeClass: 'text-2xl sm:text-3xl leading-relaxed' },
  { level: 2, label: '中', sizeClass: 'text-3xl sm:text-4xl leading-relaxed' },
  { level: 3, label: '大', sizeClass: 'text-4xl sm:text-5xl leading-relaxed' },
  { level: 4, label: '特大', sizeClass: 'text-5xl sm:text-6xl leading-relaxed' },
] as const;

const PREF_SPEED_KEY = 'teleprompter_pref_speed';
const PREF_FONT_KEY = 'teleprompter_pref_font';
const PREF_THEME_KEY = 'teleprompter_pref_theme';
const PREF_MIRROR_KEY = 'teleprompter_pref_mirror';

function getStoredNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  } catch {
    return fallback;
  }
}

function getStoredString<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(key) as T;
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function getStoredBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(key);
    return v === 'true' ? true : v === 'false' ? false : fallback;
  } catch {
    return fallback;
  }
}

export const TeleprompterModal: React.FC<TeleprompterModalProps> = ({
  isOpen,
  onClose,
  topicTitle,
  contentHtml,
  outline,
  readingSpeed = 280,
  totalWordCount = 0,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(() => getStoredNumber(PREF_SPEED_KEY, 1.0, 0.4, 3.0));
  const [fontLevel, setFontLevel] = useState<1 | 2 | 3 | 4>(() => getStoredNumber(PREF_FONT_KEY, 2, 1, 4) as 1 | 2 | 3 | 4);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => getStoredString(PREF_THEME_KEY, 'dark', ['dark', 'light'] as const));
  const [isMirror, setIsMirror] = useState(() => getStoredBool(PREF_MIRROR_KEY, false));
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const positionStorageKey = `teleprompter-position:${topicTitle}`;

  const setSpeedMultiplierWithStorage = useCallback((valOrUpdater: number | ((prev: number) => number)) => {
    setSpeedMultiplier((prev) => {
      const next = typeof valOrUpdater === 'function' ? valOrUpdater(prev) : valOrUpdater;
      try { localStorage.setItem(PREF_SPEED_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const setFontLevelWithStorage = useCallback((level: 1 | 2 | 3 | 4) => {
    setFontLevel(level);
    try { localStorage.setItem(PREF_FONT_KEY, String(level)); } catch {}
  }, []);

  const setThemeWithStorage = useCallback((themeOrUpdater: 'dark' | 'light' | ((prev: 'dark' | 'light') => 'dark' | 'light')) => {
    setTheme((prev) => {
      const next = typeof themeOrUpdater === 'function' ? themeOrUpdater(prev) : themeOrUpdater;
      try { localStorage.setItem(PREF_THEME_KEY, next); } catch {}
      return next;
    });
  }, []);

  const setIsMirrorWithStorage = useCallback((mirrorOrUpdater: boolean | ((prev: boolean) => boolean)) => {
    setIsMirror((prev) => {
      const next = typeof mirrorOrUpdater === 'function' ? mirrorOrUpdater(prev) : mirrorOrUpdater;
      try { localStorage.setItem(PREF_MIRROR_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blockElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const preciseScrollTopRef = useRef<number>(0);
  const lastProgressUpdateRef = useRef<number>(0);

  // Parse HTML into discrete block sections
  const parsedBlocks = useMemo<ParsedBlock[]>(() => {
    if (!contentHtml) return [];
    if (typeof window === 'undefined') return [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(contentHtml, 'text/html');

    // Normalize voiceover cue elements into canonical bracket format e.g. [停顿 1s]
    doc.querySelectorAll('span[data-cue], span.inline-voiceover-cue').forEach((el) => {
      const cue = el.getAttribute('data-cue') || el.textContent?.replace(/^🎙️\s*/, '').replace(/^\[|\]$/g, '').trim() || '';
      if (cue) {
        el.textContent = `[${cue}]`;
      }
    });

    const nodes = Array.from(doc.body.childNodes);
    const blocks: ParsedBlock[] = [];
    let currentChapter = '';

    nodes.forEach((node, index) => {
      const text = node.textContent?.trim() || '';
      if (!text) return;

      const nodeName = node.nodeName.toLowerCase();
      let type: ParsedBlock['type'] = 'p';

      if (nodeName === 'h1') {
        type = 'h1';
        currentChapter = text;
      } else if (nodeName === 'h2') {
        type = 'h2';
        currentChapter = text;
      } else if (nodeName === 'h3') {
        type = 'h3';
      } else if (nodeName === 'blockquote') {
        type = 'quote';
      } else if (nodeName === 'ul' || nodeName === 'ol') {
        type = 'list-item';
      }

      blocks.push({
        id: `block-${index}`,
        type,
        text,
        charCount: text.replace(/\s+/g, '').length,
        chapterTitle: currentChapter || topicTitle,
      });
    });

    return blocks;
  }, [contentHtml, topicTitle]);

  const estimatedTotalSeconds = useMemo(() => {
    const words = totalWordCount || parsedBlocks.reduce((sum, b) => sum + b.charCount, 0);
    return Math.max(10, Math.round((words / (readingSpeed || 280)) * 60));
  }, [totalWordCount, parsedBlocks, readingSpeed]);

  // Fullscreen toggle handler
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => undefined);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Timer tick & Screen Wake Lock during playback
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (isPlaying) {
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Request Screen Wake Lock to prevent sleep during recording
      let isSubscribed = true;
      const requestLock = async () => {
        if ('wakeLock' in navigator && isPlaying) {
          try {
            if (!wakeLockRef.current || wakeLockRef.current.released) {
              const lock = await navigator.wakeLock.request('screen');
              if (isSubscribed) {
                wakeLockRef.current = lock;
                lock.addEventListener('release', () => {
                  if (wakeLockRef.current === lock) wakeLockRef.current = null;
                });
              } else {
                void lock.release();
              }
            }
          } catch {
            // Ignore permission or power save mode errors
          }
        }
      };

      void requestLock();

      const handleVisibility = () => {
        if (document.visibilityState === 'visible' && isSubscribed) {
          void requestLock();
        }
      };

      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        isSubscribed = false;
        document.removeEventListener('visibilitychange', handleVisibility);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (wakeLockRef.current) {
          void wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
      };
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    }
  }, [isPlaying]);

  // Closing unmounts the scroll container, so stop playback before it can retain stale state.
  useEffect(() => {
    if (isOpen) return;

    setIsPlaying(false);
    lastFrameTimeRef.current = null;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (wakeLockRef.current) {
      void wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, [isOpen]);

  // Throttled focus block and progress calculation (no layout shift)
  const updateScrollProgress = useCallback(() => {
    const container = scrollableRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const maxScroll = scrollHeight - clientHeight;
    const progress = maxScroll > 0 ? Math.min(100, Math.max(0, Math.round((scrollTop / maxScroll) * 100))) : 0;
    setScrollProgress(progress);

    // Calculate which block intersects with the reading zone line
    const targetY = scrollTop + clientHeight * 0.38;
    let closestIndex = 0;
    let minDistance = Infinity;

    blockElementsRef.current.forEach((el, idx) => {
      if (!el) return;
      const blockMiddle = el.offsetTop + el.offsetHeight / 2;
      const distance = Math.abs(blockMiddle - targetY);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    setActiveBlockIndex(closestIndex);
  }, []);

  // Sync precise scroll accumulator when user manually scrolls
  const handleManualScroll = useCallback(() => {
    if (scrollableRef.current) {
      preciseScrollTopRef.current = scrollableRef.current.scrollTop;
      try {
        localStorage.setItem(positionStorageKey, String(Math.round(scrollableRef.current.scrollTop)));
      } catch {
        // localStorage may be unavailable in private browsing.
      }
      updateScrollProgress();
    }
  }, [positionStorageKey, updateScrollProgress]);

  useEffect(() => {
    if (!isOpen) return;
    let frame = 0;
    frame = requestAnimationFrame(() => {
      const container = scrollableRef.current;
      if (!container) return;
      try {
        const saved = Number(localStorage.getItem(positionStorageKey) || 0);
        if (Number.isFinite(saved) && saved > 0) {
          container.scrollTop = Math.min(saved, Math.max(0, container.scrollHeight - container.clientHeight));
          preciseScrollTopRef.current = container.scrollTop;
        }
      } catch {
        // localStorage may be unavailable in private browsing.
      }
      updateScrollProgress();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, positionStorageKey, updateScrollProgress]);

  // Auto-scrolling pure physics engine via requestAnimationFrame (constant velocity)
  const stepScroll = useCallback((timestamp: number) => {
    if (!isPlaying) {
      lastFrameTimeRef.current = null;
      return;
    }

    const container = scrollableRef.current;
    if (!container) return;

    if (lastFrameTimeRef.current == null) {
      lastFrameTimeRef.current = timestamp;
      preciseScrollTopRef.current = container.scrollTop;
    }

    const deltaMs = Math.min(100, timestamp - lastFrameTimeRef.current);
    lastFrameTimeRef.current = timestamp;

    const { scrollHeight, clientHeight } = container;
    const maxScroll = scrollHeight - clientHeight;

    if (container.scrollTop >= maxScroll - 2) {
      setIsPlaying(false);
      lastFrameTimeRef.current = null;
      return;
    }

    // Standard constant speed: 48px/s at 280wpm, scaled linearly by speedMultiplier
    const baseSpeed = 48 * ((readingSpeed || 280) / 280);
    const scrollDelta = (baseSpeed * speedMultiplier * deltaMs) / 1000;

    preciseScrollTopRef.current += scrollDelta;
    container.scrollTop = preciseScrollTopRef.current;

    // Throttle UI state updates to every 200ms to avoid re-render frame drops
    if (timestamp - lastProgressUpdateRef.current > 200) {
      lastProgressUpdateRef.current = timestamp;
      updateScrollProgress();
    }

    animationFrameRef.current = requestAnimationFrame(stepScroll);
  }, [isPlaying, readingSpeed, speedMultiplier, updateScrollProgress]);

  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = null;
      if (scrollableRef.current) {
        preciseScrollTopRef.current = scrollableRef.current.scrollTop;
      }
      animationFrameRef.current = requestAnimationFrame(stepScroll);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      updateScrollProgress();
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, stepScroll, updateScrollProgress]);

  // Reset scroll to top
  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setElapsedSeconds(0);
    preciseScrollTopRef.current = 0;
    if (scrollableRef.current) {
      scrollableRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Jump to specific outline heading
  const handleJumpToChapter = (item: OutlineItem) => {
    setIsOutlineOpen(false);
    const targetBlock = parsedBlocks.findIndex(
      (b) => (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') && b.text.includes(item.title)
    );
    if (targetBlock >= 0 && blockElementsRef.current[targetBlock]) {
      const el = blockElementsRef.current[targetBlock];
      if (el && scrollableRef.current) {
        const offset = el.offsetTop - scrollableRef.current.clientHeight * 0.25;
        scrollableRef.current.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
      }
    }
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default on interactive keys
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isOutlineOpen) {
          setIsOutlineOpen(false);
        } else if (showKeyboardHelp) {
          setShowKeyboardHelp(false);
        } else {
          onClose();
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (scrollableRef.current) {
          scrollableRef.current.scrollTop -= 80;
          preciseScrollTopRef.current = scrollableRef.current.scrollTop;
          updateScrollProgress();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (scrollableRef.current) {
          scrollableRef.current.scrollTop += 80;
          preciseScrollTopRef.current = scrollableRef.current.scrollTop;
          updateScrollProgress();
        }
        return;
      }
      if (e.key === '+' || e.key === '=' || e.key === ']') {
        e.preventDefault();
        setSpeedMultiplierWithStorage((prev) => Math.min(3.0, Math.round((prev + 0.2) * 10) / 10));
        return;
      }
      if (e.key === '-' || e.key === '_' || e.key === '[') {
        e.preventDefault();
        setSpeedMultiplierWithStorage((prev) => Math.max(0.4, Math.round((prev - 0.2) * 10) / 10));
        return;
      }
      if (e.key === '1') {
        setFontLevelWithStorage(1);
        return;
      }
      if (e.key === '2') {
        setFontLevelWithStorage(2);
        return;
      }
      if (e.key === '3') {
        setFontLevelWithStorage(3);
        return;
      }
      if (e.key === '4') {
        setFontLevelWithStorage(4);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReset();
        return;
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setThemeWithStorage((prev) => (prev === 'dark' ? 'light' : 'dark'));
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsMirrorWithStorage((prev) => !prev);
        return;
      }
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setIsOutlineOpen((prev) => !prev);
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setShowKeyboardHelp((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isOutlineOpen, showKeyboardHelp, onClose, handleReset, toggleFullscreen, updateScrollProgress]);

  if (!isOpen) return null;

function renderScriptTextWithCues(text: string, isDark: boolean): React.ReactNode {
  if (!text) return null;
  // Match bracketed voiceover cues e.g. [停顿 1s], [重音], [反讽语气], [BGM 起]
  const parts = text.split(/(\[[^\]\n]+\])/g);
  if (parts.length === 1) return text;

  return parts.map((part, index) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      const cueContent = part.slice(1, -1).trim();
      return (
        <span
          key={`cue-${index}`}
          className={`inline-flex items-center gap-1 mx-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold tracking-wide uppercase align-middle select-none transition-all shadow-xs ${
            isDark
              ? 'bg-rose-950/80 text-rose-300 border border-rose-600/60 ring-1 ring-rose-500/20'
              : 'bg-rose-100 text-rose-800 border border-rose-300 ring-1 ring-rose-400/20'
          }`}
        >
          🎙️ {cueContent}
        </span>
      );
    }
    return part;
  });
}

  const activeFont = FONT_SIZES.find((f) => f.level === fontLevel) || FONT_SIZES[1];
  const isDark = theme === 'dark';

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const teleprompterContent = (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="录音提词器"
      tabIndex={-1}
      className={`teleprompter-modal-root fixed inset-0 z-50 flex flex-col select-none transition-colors duration-300 ${
        isDark ? 'dark is-dark bg-[#0c0a09] text-[#f5f5f4]' : 'is-light bg-[#fafaf9] text-stone-900'
      }`}
    >
      {/* 1. Top Control Bar (Solid high-contrast surface in both modes) */}
      <header
        className={`teleprompter-header shrink-0 flex items-center justify-between px-4 sm:px-8 py-3 border-b transition-colors z-20 shadow-xs ${
          isDark
            ? 'bg-[#141210] border-stone-800 text-stone-100'
            : 'bg-[#fafaf9] border-stone-200 text-stone-800'
        }`}
      >
        {/* Left: Title & Chapter status */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              {isPlaying && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPlaying ? 'bg-rose-500' : 'bg-stone-500'}`}></span>
            </span>
            <h2 className={`text-sm sm:text-base font-bold truncate max-w-[200px] sm:max-w-[320px] ${
              isDark ? 'text-stone-100' : 'text-stone-900'
            }`}>
              {topicTitle}
            </h2>
          </div>

          {outline.flatItems.length > 0 && (
            <button
              onClick={() => setIsOutlineOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                isOutlineOpen
                  ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                  : isDark
                  ? 'bg-stone-900 border-stone-700/80 text-stone-200 hover:bg-stone-800 hover:text-white'
                  : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Menu className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">章节大纲</span>
            </button>
          )}
        </div>

        {/* Center: Live Timer & Reading Pace Stats */}
        <div className="hidden md:flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-rose-500" />
            <span className="font-bold text-sm text-rose-500">{formatTimer(elapsedSeconds)}</span>
            <span className={isDark ? 'text-stone-400' : 'text-stone-500'}>/ {formatTimer(estimatedTotalSeconds)}</span>
          </div>

          <div className={`w-px h-3.5 ${isDark ? 'bg-stone-700' : 'bg-stone-300'}`} />

          <div className="flex items-center gap-1.5">
            <span className={isDark ? 'text-stone-300' : 'text-stone-500'}>进度:</span>
            <span className={`font-bold ${isDark ? 'text-stone-100' : 'text-stone-900'}`}>{scrollProgress}%</span>
          </div>

          <div className={`w-px h-3.5 ${isDark ? 'bg-stone-700' : 'bg-stone-300'}`} />

          <div className={isDark ? 'text-stone-300' : 'text-stone-500'}>
            语速: <span className={`font-semibold ${isDark ? 'text-stone-100' : 'text-stone-900'}`}>{readingSpeed} 字/分</span>
          </div>
        </div>

        {/* Right: Actions & Tools */}
        <div className="flex items-center gap-2">
          {/* Speed Multiplier Pill */}
          <div className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-xs font-mono transition-colors ${
            isDark ? 'bg-stone-900 border-stone-700/80 text-stone-200' : 'bg-white border-stone-300 text-stone-700'
          }`}>
            <Gauge className={`w-3.5 h-3.5 ml-0.5 ${isDark ? 'text-stone-300' : 'text-stone-400'}`} />
            <button
              onClick={() => setSpeedMultiplierWithStorage((prev) => Math.max(0.4, Math.round((prev - 0.2) * 10) / 10))}
              className={`px-1 font-bold cursor-pointer ${isDark ? 'hover:text-rose-400 text-stone-200' : 'hover:text-rose-500 text-stone-700'}`}
              title="减速 (快捷键: -)"
            >
              -
            </button>
            <span className="font-bold text-rose-500 px-0.5">{speedMultiplier.toFixed(1)}x</span>
            <button
              onClick={() => setSpeedMultiplierWithStorage((prev) => Math.min(3.0, Math.round((prev + 0.2) * 10) / 10))}
              className={`px-1 font-bold cursor-pointer ${isDark ? 'hover:text-rose-400 text-stone-200' : 'hover:text-rose-500 text-stone-700'}`}
              title="加速 (快捷键: +)"
            >
              +
            </button>
          </div>

          {/* Font Size Preset */}
          <div className={`hidden sm:flex items-center gap-0.5 rounded-lg border p-0.5 text-xs transition-colors ${
            isDark ? 'bg-stone-900 border-stone-700/80' : 'bg-white border-stone-300'
          }`}>
            <Type className={`w-3.5 h-3.5 mx-1 ${isDark ? 'text-stone-300' : 'text-stone-400'}`} />
            {FONT_SIZES.map((f) => (
              <button
                key={f.level}
                onClick={() => setFontLevelWithStorage(f.level)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                  fontLevel === f.level
                    ? 'bg-rose-600 text-white shadow-xs'
                    : isDark
                    ? 'text-stone-300 hover:text-white hover:bg-stone-800'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
                title={`字号 ${f.label} (快捷键: ${f.level})`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Mirror Flip Mode (For Teleprompter Glass) */}
          <button
            onClick={() => setIsMirrorWithStorage((prev) => !prev)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isMirror
                ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                : isDark
                ? 'bg-stone-900 border-stone-700/80 hover:bg-stone-800 text-stone-200 hover:text-white'
                : 'bg-white border-stone-300 hover:bg-stone-100 text-stone-700'
            }`}
            title={isMirror ? '取消镜像翻转' : '开启镜像模式 (外接分光镜提词板专用，快捷键: M)'}
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>

          {/* Theme Switcher */}
          <button
            onClick={() => setThemeWithStorage((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isDark
                ? 'bg-stone-900 border-stone-700/80 hover:bg-stone-800 text-stone-200 hover:text-white'
                : 'bg-white border-stone-300 hover:bg-stone-100 text-stone-700'
            }`}
            title="切换暗黑/浅色主题 (快捷键: T)"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-stone-600" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isDark
                ? 'bg-stone-900 border-stone-700/80 hover:bg-stone-800 text-stone-200 hover:text-white'
                : 'bg-white border-stone-300 hover:bg-stone-100 text-stone-700'
            }`}
            title="切换全屏 (快捷键: F)"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {/* Help Button */}
          <button
            onClick={() => setShowKeyboardHelp((prev) => !prev)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              showKeyboardHelp
                ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                : isDark
                ? 'bg-stone-900 border-stone-700/80 hover:bg-stone-800 text-stone-200 hover:text-white'
                : 'bg-white border-stone-300 hover:bg-stone-100 text-stone-700'
            }`}
            title="快捷键指南 (快捷键: ?)"
          >
            <Keyboard className="w-4 h-4" />
          </button>

          {/* Exit Button */}
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition-colors ml-1 cursor-pointer ${
              isDark
                ? 'bg-stone-900 border-stone-700/80 hover:bg-rose-600 hover:border-rose-600 text-stone-200 hover:text-white'
                : 'bg-stone-100 border-stone-300 hover:bg-rose-600 hover:border-rose-600 text-stone-700 hover:text-white'
            }`}
            title="退出提词模式 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Prompter Scroll Area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Visual Focus Horizon Guide Line (Fixed in middle 38% of screen) */}
        <div
          className={`pointer-events-none absolute left-0 right-0 top-[38%] h-0.5 border-t border-dashed z-10 opacity-40 transition-colors ${
            isDark ? 'border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.4)]' : 'border-rose-400/80'
          }`}
        >
          <div className="absolute right-4 -top-3 text-[10px] font-mono uppercase tracking-widest text-rose-500/80 font-bold">
            视线聚焦线
          </div>
        </div>

        {/* Scrollable Script Container */}
        <div
          ref={scrollableRef}
          onScroll={handleManualScroll}
          className={`w-full h-full overflow-y-auto overscroll-contain px-6 sm:px-16 md:px-24 lg:px-36 py-12 scroll-auto ${
            isMirror ? 'scale-x-[-1]' : ''
          }`}
          style={{ scrollbarWidth: 'none' }}
        >
          {/* Top Padding so first line can align with focus guide */}
          <div className="h-[32vh]" />

          {/* Script Content Blocks */}
          <div className="max-w-4xl mx-auto space-y-8 sm:space-y-12">
            {parsedBlocks.map((block, idx) => {
              const isActive = idx === activeBlockIndex;
              const isHeading = block.type === 'h1' || block.type === 'h2' || block.type === 'h3';

              return (
                <div
                  key={block.id}
                  ref={(el) => {
                    blockElementsRef.current[idx] = el;
                  }}
                  className={`transition-colors duration-150 ${
                    isActive
                      ? isDark
                        ? 'text-white font-bold opacity-100'
                        : 'text-stone-950 font-bold opacity-100'
                      : isDark
                      ? 'text-stone-500 opacity-40 font-normal'
                      : 'text-stone-400 opacity-40 font-normal'
                  }`}
                >
                  {isHeading ? (
                    <div className="pt-6 pb-2 border-b border-rose-500/30">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-rose-500 block mb-1">
                        章节标记
                      </span>
                      <h3
                        className={`font-black tracking-tight ${
                          block.type === 'h1'
                            ? 'text-3xl sm:text-5xl text-rose-500'
                            : isDark
                            ? 'text-2xl sm:text-4xl text-stone-100'
                            : 'text-2xl sm:text-4xl text-stone-800'
                        }`}
                      >
                        {renderScriptTextWithCues(block.text, isDark)}
                      </h3>
                    </div>
                  ) : block.type === 'quote' ? (
                    <blockquote className="border-l-4 border-amber-500 pl-4 sm:pl-6 italic text-amber-200/90">
                      <p className={activeFont.sizeClass}>{renderScriptTextWithCues(block.text, isDark)}</p>
                    </blockquote>
                  ) : (
                    <p className={`${activeFont.sizeClass} tracking-normal`}>
                      {renderScriptTextWithCues(block.text, isDark)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Padding so last line can reach the top */}
          <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-3 text-stone-500">
            <CheckCircle2 className="w-12 h-12 text-rose-500 stroke-[1.5]" />
            <p className="text-lg font-bold">🎉 全篇文案朗读完成！</p>
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-semibold transition-colors inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>重新开始录制</span>
            </button>
          </div>
        </div>

        {/* 3. Floating Chapter Outline Drawer */}
        {isOutlineOpen && (
          <aside
            className={`absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] border-r p-5 overflow-y-auto shadow-2xl z-30 transition-all ${
              isDark ? 'bg-[#141210] border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'
            }`}
          >
            <div className={`flex items-center justify-between pb-4 border-b mb-4 ${isDark ? 'border-stone-800' : 'border-stone-200'}`}>
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Menu className="w-4 h-4 text-rose-500" />
                <span>章节大纲快速跳转</span>
              </h3>
              <button
                onClick={() => setIsOutlineOpen(false)}
                className={`p-1 rounded cursor-pointer ${isDark ? 'text-stone-400 hover:text-stone-100 hover:bg-stone-800' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              {outline.flatItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleJumpToChapter(item)}
                  className={`w-full text-left p-2.5 rounded-lg font-medium transition-colors flex items-center justify-between group cursor-pointer ${
                    isDark ? 'hover:bg-stone-800 text-stone-200 hover:text-white' : 'hover:bg-stone-100 text-stone-700'
                  }`}
                >
                  <div className="truncate pr-2">
                    <span className="text-rose-500 font-bold mr-1.5">H{item.level}</span>
                    <span>{item.title}</span>
                  </div>
                  <span className={`font-mono text-[10px] shrink-0 ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    {formatOutlineDuration(item.durationSeconds)}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* 4. Keyboard Shortcuts Overlay */}
        {showKeyboardHelp && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4">
            <div
              className={`max-w-md w-full rounded-2xl border p-6 shadow-2xl space-y-4 ${
                isDark ? 'bg-[#1c1917] border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'
              }`}
            >
              <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-stone-700' : 'border-stone-200'}`}>
                <h4 className="font-bold flex items-center gap-2 text-base">
                  <Keyboard className="w-5 h-5 text-rose-500" />
                  <span>提词器快捷键指南</span>
                </h4>
                <button onClick={() => setShowKeyboardHelp(false)} className={`p-1 cursor-pointer ${isDark ? 'text-stone-400 hover:text-stone-100' : 'text-stone-500 hover:text-stone-800'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-stone-800/70 border border-stone-700/50' : 'bg-stone-100'}`}>
                  <span className={isDark ? 'text-stone-300' : 'text-stone-600'}>开始 / 暂停</span>
                  <kbd className={`px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-stone-900 text-rose-400 border border-stone-700' : 'bg-white text-rose-600 border border-stone-300'}`}>Space</kbd>
                </div>
                <div className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-stone-800/70 border border-stone-700/50' : 'bg-stone-100'}`}>
                  <span className={isDark ? 'text-stone-300' : 'text-stone-600'}>微调滚动</span>
                  <kbd className={`px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-stone-900 text-rose-400 border border-stone-700' : 'bg-white text-rose-600 border border-stone-300'}`}>↑ / ↓</kbd>
                </div>
                <div className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-stone-800/70 border border-stone-700/50' : 'bg-stone-100'}`}>
                  <span className={isDark ? 'text-stone-300' : 'text-stone-600'}>滚屏加/减速</span>
                  <kbd className={`px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-stone-900 text-rose-400 border border-stone-700' : 'bg-white text-rose-600 border border-stone-300'}`}>+ / -</kbd>
                </div>
                <div className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-stone-800/70 border border-stone-700/50' : 'bg-stone-100'}`}>
                  <span className={isDark ? 'text-stone-300' : 'text-stone-600'}>切换字号</span>
                  <kbd className={`px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-stone-900 text-rose-400 border border-stone-700' : 'bg-white text-rose-600 border border-stone-300'}`}>1 ~ 4</kbd>
                </div>
                <div className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-stone-800/70 border border-stone-700/50' : 'bg-stone-100'}`}>
                  <span className={isDark ? 'text-stone-300' : 'text-stone-600'}>重置回起点</span>
                  <kbd className={`px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-stone-900 text-rose-400 border border-stone-700' : 'bg-white text-rose-600 border border-stone-300'}`}>R</kbd>
                </div>
                <div className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-stone-800/70 border border-stone-700/50' : 'bg-stone-100'}`}>
                  <span className={isDark ? 'text-stone-300' : 'text-stone-600'}>深浅主题</span>
                  <kbd className={`px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-stone-900 text-rose-400 border border-stone-700' : 'bg-white text-rose-600 border border-stone-300'}`}>T</kbd>
                </div>
                <div className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-stone-800/70 border border-stone-700/50' : 'bg-stone-100'}`}>
                  <span className={isDark ? 'text-stone-300' : 'text-stone-600'}>镜像翻转</span>
                  <kbd className={`px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-stone-900 text-rose-400 border border-stone-700' : 'bg-white text-rose-600 border border-stone-300'}`}>M</kbd>
                </div>
                <div className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-stone-800/70 border border-stone-700/50' : 'bg-stone-100'}`}>
                  <span className={isDark ? 'text-stone-300' : 'text-stone-600'}>退出提词器</span>
                  <kbd className={`px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-stone-900 text-rose-400 border border-stone-700' : 'bg-white text-rose-600 border border-stone-300'}`}>Esc</kbd>
                </div>
              </div>

              <div className="text-center pt-2">
                <button
                  onClick={() => setShowKeyboardHelp(false)}
                  className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors"
                >
                  知道了，继续录制
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Bottom Playback Control Dock */}
      <footer
        className={`shrink-0 flex items-center justify-between px-6 sm:px-12 py-3.5 border-t backdrop-blur-md z-20 ${
          isDark
            ? 'bg-[#0c0a09]/95 border-stone-800/80 text-stone-200'
            : 'bg-[#fafaf9]/95 border-stone-200/80 text-stone-900'
        }`}
      >
        {/* Left: Reset */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isDark
                ? 'border-stone-800 bg-stone-900 hover:bg-stone-800 text-stone-300'
                : 'border-stone-300 bg-white hover:bg-stone-100 text-stone-700'
            }`}
            title="重置到文章开头 (快捷键: R)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">重置回起点</span>
          </button>
        </div>

        {/* Center: Main Play / Pause Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying((prev) => !prev)}
            className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white px-8 sm:px-12 py-2.5 sm:py-3 rounded-2xl font-bold text-sm sm:text-base transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-5 h-5 fill-current" />
                <span>暂停滚屏 (Space)</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current ml-0.5" />
                <span>开始录音 (Space)</span>
              </>
            )}
          </button>
        </div>

        {/* Right: Progress bar & Speed Tag */}
        <div className="flex items-center gap-3">
          <div className="w-24 sm:w-36 bg-stone-800 rounded-full h-2 overflow-hidden hidden sm:block">
            <div
              className="bg-rose-500 h-full transition-all duration-200 rounded-full"
              style={{ width: `${scrollProgress}%` }}
            />
          </div>
          <span className="font-mono text-xs font-bold text-rose-500">{scrollProgress}%</span>
        </div>
      </footer>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(teleprompterContent, document.body);
  }

  return teleprompterContent;
};
