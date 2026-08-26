import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { fetchPublicShareSnapshot } from '../../lib/storage';
import { sanitizeReviewHtml } from '../../lib/sanitizeHtml';
import type { ShareSnapshot } from '../../types';
import {
  Clock,
  FileText,
  Copy,
  Check,
  AlertCircle,
  Compass,
} from 'lucide-react';

interface OutlineSection {
  id: string;
  index: number;
  title: string;
  level: 1 | 2 | 3;
  charCount: number;
  percentage: number;
}

const LEVEL_INDENT: Record<1 | 2 | 3, string> = {
  1: 'pl-2',
  2: 'pl-5',
  3: 'pl-8',
};

const LEVEL_TEXT: Record<1 | 2 | 3, string> = {
  1: 'text-xs sm:text-sm font-bold leading-5',
  2: 'text-xs font-semibold leading-5',
  3: 'text-[11px] font-medium leading-4',
};

const OutlineProgress: React.FC<{ percentage: number; active?: boolean }> = ({
  percentage,
  active = false,
}) => (
  <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-stone-200/90">
    <div
      className={`h-full transition-[width,background-color] duration-200 ${
        active ? 'bg-rose-500' : 'bg-stone-400/60'
      }`}
      style={{ width: `${percentage}%` }}
    />
  </div>
);

function parseOutlineAndInjectIds(html: string): {
  items: OutlineSection[];
  processedHtml: string;
  totalCharCount: number;
} {
  if (!html) return { items: [], processedHtml: '', totalCharCount: 0 };
  const div = document.createElement('div');
  div.innerHTML = html;

  const headings = Array.from(div.querySelectorAll<HTMLElement>('h1, h2, h3'));
  const totalCharCount = (div.textContent || '').replace(/\s+/g, '').length;

  if (headings.length === 0) {
    return { items: [], processedHtml: html, totalCharCount };
  }

  // Calculate char count for each heading section
  let currentHeadingIdx = -1;
  const sectionCounts: number[] = new Array(headings.length).fill(0);

  const walker = document.createTreeWalker(div, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      const el = currentNode as HTMLElement;
      const hIdx = headings.indexOf(el);
      if (hIdx !== -1) {
        currentHeadingIdx = hIdx;
      }
    } else if (currentNode.nodeType === Node.TEXT_NODE && currentHeadingIdx >= 0) {
      const text = currentNode.textContent || '';
      sectionCounts[currentHeadingIdx] += text.replace(/\s+/g, '').length;
    }
    currentNode = walker.nextNode();
  }

  const items: OutlineSection[] = headings.map((heading, index) => {
    const level = (Number(heading.tagName[1]) || 1) as 1 | 2 | 3;
    const title = heading.textContent?.trim() || `段落 ${index + 1}`;
    const count = sectionCounts[index] || 0;
    const percentage = totalCharCount > 0 ? Math.round((count / totalCharCount) * 1000) / 10 : 0;
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
      charCount: count,
      percentage,
    };
  });

  return { items, processedHtml: div.innerHTML, totalCharCount };
}

interface PublicReviewViewProps {
  token?: string;
}

export const PublicReviewView: React.FC<PublicReviewViewProps> = ({ token: propToken }) => {
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
    if (!snapshot?.content_html) return { items: [], processedHtml: '', totalCharCount: 0 };
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
          {
            backgroundColor: 'rgb(255 241 242 / 0.95)',
            boxShadow: 'inset 4px 0 0 rgb(225 29 72 / 0.85)',
          },
          {
            backgroundColor: 'transparent',
            boxShadow: 'inset 4px 0 0 rgb(225 29 72 / 0)',
          },
        ],
        { duration: 1200, easing: 'ease-out' }
      );
    }
  };

  const handleCopyText = async () => {
    if (!snapshot) return;
    try {
      const tempEl = document.createElement('div');
      tempEl.innerHTML = sanitizeReviewHtml(snapshot.content_html);
      const plainText = `${snapshot.topic_title}\n\n${tempEl.textContent || tempEl.innerText || ''}`;
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const minutes = snapshot
    ? (snapshot.word_count / (snapshot.reading_speed || 280)).toFixed(1)
    : '0';

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-stone-100 dark:bg-[#0c0a09] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-stone-900 p-8 rounded-2xl shadow-subtle border border-stone-200 dark:border-stone-800 text-center max-w-sm w-full space-y-4">
          <div className="w-10 h-10 border-3 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">正在从边缘节点加载审稿文案…</p>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-dvh bg-stone-100 dark:bg-[#0c0a09] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-stone-900 p-8 rounded-2xl shadow-subtle border border-stone-200 dark:border-stone-800 text-center max-w-md w-full space-y-4">
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
              className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 underline"
            >
              登录创作者工作台
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#fcfbf9] dark:bg-[#0c0a09] text-stone-900 dark:text-stone-100 flex flex-col antialiased selection:bg-rose-100 dark:selection:bg-rose-950/60 selection:text-rose-900 dark:selection:text-rose-200 transition-colors">
      {/* Top Floating Glass Header */}
      <header className="sticky top-0 z-30 bg-[#fcfbf9]/90 dark:bg-[#0c0a09]/90 backdrop-blur-md border-b border-stone-200/80 dark:border-stone-800/80 px-4 sm:px-8 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center font-serif font-black text-sm shrink-0 shadow-xs">
              审
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 truncate flex items-center gap-2">
                <span>{snapshot.topic_title}</span>
                <span className="text-[10px] font-normal px-2 py-0.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/60 rounded-full shrink-0">
                  外部审稿版
                </span>
              </h1>
              <div className="flex items-center gap-3 text-[11px] text-stone-400 dark:text-stone-500 font-mono flex-wrap">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3 text-stone-400" /> {snapshot.word_count.toLocaleString()} 字
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-rose-500" /> 预估 {minutes} 分钟
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shadow-2xs cursor-pointer"
              title="复制纯文本"
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
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-24 space-y-3 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm p-3.5 rounded-xl border border-stone-200/80 dark:border-stone-800/80 shadow-2xs">
              <div className="text-[11px] font-bold text-stone-400 dark:text-stone-500 tracking-wider flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>文案故事大纲</span>
                </div>
                <span className="font-mono text-[10px] bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded font-bold border border-rose-200/60 dark:border-rose-900/60">
                  {outlineItems.length} 章节
                </span>
              </div>

              <nav className="space-y-0.5 text-xs max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
                {outlineItems.map((item) => {
                  const isActive = activeOutlineId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectHeading(item)}
                      className={`group relative w-full rounded-lg py-2 pr-2 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400/70 ${
                        isActive ? 'bg-rose-50/80 dark:bg-rose-950/60 text-rose-900 dark:text-rose-100 shadow-2xs' : 'hover:bg-stone-50/90 dark:hover:bg-stone-800/80 text-stone-700 dark:text-stone-300'
                      }`}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-rose-500"
                        />
                      )}
                      <div className={LEVEL_INDENT[item.level]}>
                        <div className="flex items-start gap-2">
                          <span
                            className={`min-w-0 flex-1 truncate transition-colors ${
                              isActive
                                ? `${LEVEL_TEXT[item.level]} text-rose-700 dark:text-rose-300 font-bold`
                                : `${LEVEL_TEXT[item.level]} text-stone-700 dark:text-stone-300 group-hover:text-stone-950 dark:group-hover:text-stone-100`
                            }`}
                            title={item.title}
                          >
                            {item.title}
                          </span>
                          <span className="w-10 shrink-0 pt-0.5 text-right">
                            <span
                              className={`block font-mono text-[10px] leading-none tabular-nums ${
                                isActive ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-stone-400 dark:text-stone-500'
                              }`}
                            >
                              {item.percentage}%
                            </span>
                            <OutlineProgress percentage={item.percentage} active={isActive} />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        )}

        {/* Article Body */}
        <article className="flex-1 min-w-0 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/80 dark:border-stone-800/80 p-6 sm:p-10 shadow-subtle space-y-6">
          {/* Header metadata summary */}
          {(snapshot.hook || snapshot.summary || snapshot.storyline) && (
            <div className="p-4 rounded-xl bg-stone-50/80 dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 space-y-2">
              {snapshot.hook && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold uppercase bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded tracking-wide shrink-0 border border-rose-200/60 dark:border-rose-900/60">
                    核心反差 / 钩子
                  </span>
                  <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">{snapshot.hook}</p>
                </div>
              )}
              {snapshot.summary && (
                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">{snapshot.summary}</p>
              )}
            </div>
          )}

          {/* Rendered HTML with scroll-mt and animated headings */}
          <div
            className="prose prose-stone dark:prose-invert max-w-none text-stone-800 dark:text-stone-200 leading-relaxed text-sm sm:text-base space-y-4 [&>h1]:text-xl [&>h1]:font-black [&>h1]:text-stone-900 dark:[&>h1]:text-stone-100 [&>h1]:mt-6 [&>h1]:mb-3 [&>h2]:text-lg [&>h2]:font-bold [&>h2]:text-stone-900 dark:[&>h2]:text-stone-100 [&>h2]:mt-5 [&>h2]:mb-2 [&>h3]:text-base [&>h3]:font-bold [&>h3]:text-stone-800 dark:[&>h3]:text-stone-200 [&>p]:leading-7 [&>blockquote]:border-l-4 [&>blockquote]:border-rose-500 [&>blockquote]:bg-rose-50/30 dark:[&>blockquote]:bg-rose-950/20 [&>blockquote]:py-2 [&>blockquote]:px-4 [&>blockquote]:rounded-r-lg [&>blockquote]:text-stone-700 dark:[&>blockquote]:text-stone-300 [&>blockquote]:italic"
            dangerouslySetInnerHTML={{ __html: processedHtml }}
          />

          {/* Footer note */}
          <footer className="pt-8 mt-8 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-400 dark:text-stone-500">
            <span>选题生产工作台 · 审稿快照</span>
            <span className="font-mono text-[11px]">
              有效期至：{new Date(snapshot.expires_at).toLocaleString()}
            </span>
          </footer>
        </article>
      </main>
    </div>
  );
};
