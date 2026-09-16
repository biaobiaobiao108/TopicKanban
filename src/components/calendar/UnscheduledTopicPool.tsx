import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Topic, TopicStatus } from '../../types';
import { StatusBadge, PriorityBadge } from '../ui/Badge';
import { Search, GripVertical, CalendarPlus, X, Filter } from 'lucide-react';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

interface UnscheduledTopicPoolProps {
  topics: Topic[];
  isOpen: boolean;
  onClose: () => void;
  onOpenDetail: (topicId: string) => void;
  onScheduleTopic: (topic: Topic) => void;
}

function DraggableTopicCard({
  topic,
  onOpenDetail,
  onScheduleTopic,
}: {
  topic: Topic;
  onOpenDetail: (id: string) => void;
  onScheduleTopic: (topic: Topic) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `unscheduled:${topic.id}`,
    data: { type: 'unscheduled-topic', topic },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 999 : undefined,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="unscheduled-topic-card"
      data-topic-id={topic.id}
      className={`group flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-2xs transition-all hover:border-[var(--accent)]/40 hover:shadow-card ${
        isDragging
          ? 'transition-none will-change-transform ring-2 ring-rose-500 shadow-xl'
          : 'duration-200'
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={topic.status} />
          <PriorityBadge priority={topic.priority} />
        </div>

        {/* Drag Handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`拖拽「${topic.title}」至日历定档；按 Enter 或空格打开定档操作`}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onScheduleTopic(topic);
            }
          }}
          title="按住拖拽至日历定档"
          className="rounded-lg p-1.5 text-[var(--ink-muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500"
        >
          <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onOpenDetail(topic.id)}
        className="w-full text-left text-xs font-bold leading-snug text-[var(--ink)] transition-colors hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-500"
      >
        {topic.title}
      </button>

      {topic.current_todo && (
        <div className="truncate rounded-lg bg-[var(--canvas)] px-2 py-1 text-[11px] text-[var(--ink-muted)]">
          当前行动: {topic.current_todo.title}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[var(--line)] pt-1 text-[10px] text-[var(--ink-muted)]">
        <span>
          {(topic.draft_word_count || 0) > 0 ? <><span className="font-mono tabular-nums">{topic.draft_word_count}</span>字</> : '未动笔'}
        </span>

        <button
          type="button"
          onClick={() => onScheduleTopic(topic)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-500/10 hover:text-rose-700"
        >
          <CalendarPlus className="w-3 h-3" />
          <span>定档</span>
        </button>
      </div>
    </div>
  );
}

export const UnscheduledTopicPool: React.FC<UnscheduledTopicPoolProps> = ({
  topics,
  isOpen,
  onClose,
  onOpenDetail,
  onScheduleTopic,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isMobileDrawer, setIsMobileDrawer] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef('');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobileDrawer(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isOpen || !isMobileDrawer) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const drawer = closeButtonRef.current?.closest('aside');
      if (!drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflowRef.current;
      previousFocusRef.current?.focus();
    };
  }, [isOpen, isMobileDrawer]);

  // Filter unscheduled topics
  const unscheduledTopics = useMemo(() => {
    return topics.filter((topic) => {
      if (topic.deleted_at || topic.status === 'published' || topic.status === 'icebox') return false;
      if (topic.target_publish_date) return false;
      if (statusFilter !== 'all' && topic.status !== statusFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = topic.title.toLowerCase().includes(query);
        const matchesSummary = topic.summary?.toLowerCase().includes(query);
        const matchesAction = topic.current_todo?.title.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSummary && !matchesAction) return false;
      }
      return true;
    });
  }, [topics, statusFilter, search]);

  if (!isOpen) return null;

  return (
    <aside
      role={isMobileDrawer ? 'dialog' : 'complementary'}
      aria-modal={isMobileDrawer ? true : undefined}
      aria-labelledby="unscheduled-topic-pool-title"
      className="absolute inset-y-0 right-0 z-20 flex h-full w-full max-w-80 select-none flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-card backdrop-blur-sm transition-colors sm:relative sm:inset-auto sm:w-80 sm:shrink-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
        <div className="flex items-center gap-2">
          <h2 id="unscheduled-topic-pool-title" className="text-sm font-bold text-[var(--ink)]">待排期选题池</h2>
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
            {unscheduledTopics.length}
          </span>
        </div>

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="关闭待排期选题池"
          className="cursor-pointer rounded-lg p-1.5 text-[var(--ink-muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="space-y-2 border-b border-[var(--line)] p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
          <input
            type="text"
            aria-label="搜索待排期选题"
            autoComplete="off"
            placeholder="搜索待排期选题..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3 pl-8 text-xs text-[var(--ink)] focus:border-rose-500 focus:outline-none"
          />
        </div>

        {/* Stage Pills */}
        <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
          {[
            { id: 'all', label: '全部' },
            { id: 'approved', label: '已立项' },
            { id: 'scripting', label: '写稿中' },
            { id: 'production', label: '制作中' },
            { id: 'inbox', label: '收集箱' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              aria-pressed={statusFilter === item.id}
              className={`px-2 py-1 rounded-lg font-semibold transition-colors cursor-pointer shrink-0 ${
                statusFilter === item.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--canvas)] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topics Stream */}
      <FloatingScrollbar className="space-y-2.5 p-3" wrapperClassName="min-h-0 flex-1">
        <div className="px-1 text-[11px] text-[var(--ink-muted)]">
          💡 提示：按住卡片右侧把手可直接拖拽至左侧日历日期定档
        </div>

        {unscheduledTopics.map((topic) => (
          <DraggableTopicCard
            key={topic.id}
            topic={topic}
            onOpenDetail={onOpenDetail}
            onScheduleTopic={onScheduleTopic}
          />
        ))}

        {unscheduledTopics.length === 0 && (
          <div className="py-12 text-center text-xs text-[var(--ink-muted)]">
            {search || statusFilter !== 'all' ? '无匹配选题' : '所有活跃选题均已定档！'}
          </div>
        )}
      </FloatingScrollbar>
    </aside>
  );
};
