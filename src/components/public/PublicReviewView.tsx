import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { fetchPublicShareSnapshot } from '../../lib/storage';
import { sanitizeReviewHtml } from '../../lib/sanitizeHtml';
import { copyTextToClipboard } from '../../lib/clipboard';
import { formatBeijingDateTime } from '../../lib/actionDate';
import type { ShareSnapshot } from '../../types';
import {
  Clock,
  FileText,
  Copy,
  Check,
  AlertCircle,
  Compass,
} from 'lucide-react';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';
import { useToast } from '../ui/Toast';

interface OutlineSection {
  id: string;
  index: number;
  title: string;
  level: 1 | 2 | 3;
}

const LEVEL_INDENT: Record<1 | 2 | 3, string> = {
  1: 'pl-1.5',
  2: 'pl-4',
  3: 'pl-[26px]',
};

const LEVEL_TEXT: Record<1 | 2 | 3, string> = {
  1: 'font-semibold',
  2: 'font-medium',
  3: 'font-normal',
};

function parseOutlineAndInjectIds(html: string): { items: OutlineSection[]; processedHtml: string } {
  if (!html) return { items: [], processedHtml: '' };
  const div = document.createElement('div');
  div.innerHTML = html;

  const headings = Array.from(div.querySelectorAll<HTMLElement>('h1, h2, h3'));

  if (headings.length === 0) {
    return { items: [], processedHtml: html };
  }

  const items: OutlineSection[] = headings.map((heading, index) => {
    const level = (Number(heading.tagName[1]) || 1) as 1 | 2 | 3;
    const title = heading.textContent?.trim() || `段落 ${index + 1}`;
    const id = `review-heading-${index}`;

    // Inject ID and scroll margin to the DOM heading
    heading.setAttribute('id', id);
    heading.setAttribute('data-outline-index', String(index));
    heading.classList.add('scroll-mt-24', 'transition-all', 'duration-300', 'rounded-md');

    return {
      id,
      index,
      title,
      level,
    };
  });

  return { items, processedHtml: div.innerHTML };
}

interface PublicReviewViewProps {
  token?: string;
}

export const PublicReviewView: React.FC<PublicReviewViewProps> = ({ token: propToken }) => {
  const { showToast } = useToast();
  const { token: routeToken } = useParams<{ token: string }>();
  const location = useLocation();
  const token = propToken || routeToken || location.pathname.replace(/^\/share\/?/, '') || '';

  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const highlightAnimationRef = useRef<Animation | null>(null);
  const isUserClickingRef = useRef(false);
  const userClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) {
      setError('无效的审稿链接');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    fetchPublicShareSnapshot(token)
      .then((data) => {
        if (isMounted) {
          setSnapshot(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : '审稿链接已失效或不存在');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Parse outline and inject IDs into the HTML
  const { items: outlineItems, processedHtml } = useMemo(() => {
    if (!snapshot?.content_html) return { items: [], processedHtml: '' };
    return parseOutlineAndInjectIds(sanitizeReviewHtml(snapshot.content_html));
  }, [snapshot?.content_html]);

  // ScrollSpy: auto highlight outline item as reader scrolls
  useEffect(() => {
    if (outlineItems.length === 0) return;

    // Set first item active initially
    if (!activeOutlineId && outlineItems[0]) {
      setActiveOutlineId(outlineItems[0].id);
    }

    const handleScroll = () => {
      if (isUserClickingRef.current) return;

      const headings = outlineItems
        .map((item) => document.getElementById(item.id))
        .filter((el): el is HTMLElement => el !== null);

      if (headings.length === 0) return;

      const scrollPosition = window.scrollY + 140; // 140px offset for top header
      let currentActiveId = headings[0].id;

      for (const heading of headings) {
        if (heading.offsetTop <= scrollPosition) {
          currentActiveId = heading.id;
        } else {
          break;
        }
      }

      setActiveOutlineId(currentActiveId);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [outlineItems]);

  const handleSelectHeading = (item: OutlineSection) => {
    setActiveOutlineId(item.id);
    isUserClickingRef.current = true;
    if (userClickTimeoutRef.current) clearTimeout(userClickTimeoutRef.current);
    userClickTimeoutRef.current = setTimeout(() => {
      isUserClickingRef.current = false;
    }, 800);

    const el = document.getElementById(item.id);
    if (!el) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

    highlightAnimationRef.current?.cancel();
    if (!reduceMotion) {
      highlightAnimationRef.current = el.animate(
        [
          { backgroundColor: 'rgb(255 241 242 / 0.95)' },
          { backgroundColor: 'transparent' },
        ],
        { duration: 1200, easing: 'ease-out' }
      );
    }
  };

  const handleCopyText = async () => {
    if (!snapshot) return;
    const tempEl = document.createElement('div');
    tempEl.innerHTML = sanitizeReviewHtml(snapshot.content_html);
    const plainText = `${snapshot.topic_title}\n\n${tempEl.textContent || tempEl.innerText || ''}`;
    const copied = await copyTextToClipboard(plainText);
    if (!copied) {
      showToast({ message: '无法复制审稿文案，请检查浏览器剪贴板权限后重试', tone: 'info' });
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const minutes = snapshot
    ? (snapshot.word_count / (snapshot.reading_speed || 280)).toFixed(1)
    : '0';

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-[var(--canvas)] flex items-center justify-center p-4">
        <div className="bg-[var(--surface)] p-8 rounded-2xl shadow-subtle border border-[var(--line)] text-center max-w-sm w-full space-y-4">
          <div className="w-10 h-10 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">正在从边缘节点加载审稿文案…</p>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-dvh bg-[var(--canvas)] flex items-center justify-center p-4">
        <div className="bg-[var(--surface)] p-8 rounded-2xl shadow-subtle border border-[var(--line)] text-center max-w-md w-full space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">审稿链接不可用</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            {error || '该文案快照可能已过期销毁，或创作者已主动关闭分享。'}
          </p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:text-[var(--accent-dark)] underline"
            >
              登录创作者工作台
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)] flex flex-col antialiased transition-colors">
      {/* Top Floating Glass Header */}
      <header className="sticky top-0 z-30 bg-[var(--canvas)]/90 backdrop-blur-md border-b border-[var(--line)] px-4 sm:px-8 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center font-serif font-black text-sm shrink-0 shadow-2xs">
              审
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 truncate flex items-center gap-2">
                <span>{snapshot.topic_title}</span>
                <span className="text-[10px] font-normal px-2 py-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-full shrink-0">
                  外部审稿版
                </span>
              </h1>
              <div className="flex items-center gap-3 text-[11px] text-stone-400 dark:text-stone-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3 text-stone-400" /> <span className="font-mono tabular-nums">{snapshot.word_count.toLocaleString()}</span> 字
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-stone-500 dark:text-stone-400" /> 预估 <span className="font-mono tabular-nums">{minutes}</span> 分钟
                </span>
                {snapshot.reviewer_branding && (
                  <span className="text-stone-500 dark:text-stone-400 font-sans font-medium text-[11px] border-l border-stone-200 dark:border-stone-700 pl-2">
                    {snapshot.reviewer_branding}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyText}
              aria-label={copied ? '已复制审稿文案' : '复制审稿文案纯文本'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shadow-2xs cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-300">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                  <span>复制正文</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-8 flex gap-8">
        {/* Left Outline Navigation (Desktop) */}
        {outlineItems.length > 0 && (
          <aside className="hidden lg:block w-[216px] shrink-0">
            <div className="sticky top-24 max-h-[calc(100dvh-7rem)] space-y-2">
              <div className="flex items-center justify-between px-1 py-2 text-xs font-semibold text-[var(--ink-muted)]">
                <div className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>文案故事大纲</span>
                </div>
                <span className="text-[10px] font-medium tabular-nums">
                  <span className="font-mono tabular-nums">{outlineItems.length}</span> 章节
                </span>
              </div>

              <nav aria-label="审稿大纲" className="max-h-[calc(100dvh-10rem)]">
                <FloatingScrollbar className="space-y-0.5 pr-1" wrapperClassName="max-h-[calc(100dvh-10rem)] flex-none">
                  {outlineItems.map((item) => {
                    const isActive = activeOutlineId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectHeading(item)}
                        aria-label={`跳转到章节：${item.title}`}
                        className={`group relative flex h-8 min-h-8 w-full items-center rounded-[9px] border border-transparent py-[5px] pr-1.5 text-left text-[0.8rem] leading-[1.45] text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)] focus-visible:bg-[var(--accent-soft)]/60 ${isActive ? 'text-[var(--ink)]' : ''}`}
                      >
                        <div className={LEVEL_INDENT[item.level]}>
                          <div className="flex min-w-0 items-center">
                            <span
                              className={`min-w-0 flex-1 truncate transition-colors ${
                                isActive
                                  ? `${LEVEL_TEXT[item.level]} text-[var(--ink)]`
                                  : LEVEL_TEXT[item.level]
                              }`}
                            >
                              {item.title}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </FloatingScrollbar>
              </nav>
            </div>
          </aside>
        )}

        {/* Article Body */}
        <article className="flex-1 min-w-0 py-2 sm:py-4 space-y-6">
          {/* Header metadata summary */}
          {(snapshot.hook || snapshot.summary || snapshot.storyline) && (
            <div className="border-l-2 border-[var(--accent)]/50 bg-[var(--surface)]/55 px-4 py-3 rounded-r-xl space-y-2">
              {snapshot.hook && (
                <div className="flex items-start gap-2">
                  <span className="text-sm sm:text-base font-semibold text-[var(--ink)] shrink-0">
                    核心反差 / 钩子
                  </span>
                  <p className="text-sm sm:text-base font-semibold text-[var(--ink)]">{snapshot.hook}</p>
                </div>
              )}
              {snapshot.summary && (
                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">{snapshot.summary}</p>
              )}
            </div>
          )}

          {/* Rendered HTML with scroll-mt and animated headings */}
          <div
            className="script-prose prose prose-stone dark:prose-invert max-w-none text-[var(--ink)] text-sm sm:text-base leading-relaxed space-y-4"
            dangerouslySetInnerHTML={{ __html: processedHtml }}
          />

          {/* Footer note */}
          <footer className="pt-8 mt-8 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-400 dark:text-stone-500">
            <span>喵爪看板 · 审稿快照</span>
            <span className="text-[11px]">
              有效期至：<time dateTime={snapshot.expires_at} className="font-mono tabular-nums">{formatBeijingDateTime(snapshot.expires_at)}</time>
            </span>
          </footer>
        </article>
      </main>
    </div>
  );
};
