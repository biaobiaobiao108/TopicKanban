import React from 'react';
import { Compass, Sparkles, X } from 'lucide-react';
import { formatOutlineDuration, type OutlineItem, type ScriptOutline } from '../../lib/outline';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';

interface ScriptOutlinePanelProps {
  isOpen: boolean;
  outline: ScriptOutline;
  activeItemId: string | null;
  onClose: () => void;
  onSelectHeading: (item: OutlineItem) => void;
  onInjectFourActOutline?: () => void;
}

interface OutlineBranchProps {
  items: OutlineItem[];
  activeItemId: string | null;
  onSelectHeading: (item: OutlineItem) => void;
}

const LEVEL_INDENT: Record<OutlineItem['level'], string> = {
  1: 'pl-2',
  2: 'pl-5',
  3: 'pl-8',
};

const LEVEL_TEXT: Record<OutlineItem['level'], string> = {
  1: 'text-[13px] font-bold leading-5',
  2: 'text-xs font-semibold leading-5',
  3: 'text-[11px] font-medium leading-[1.4]',
};

const OutlineProgress: React.FC<{ percentage: number; active?: boolean }> = ({
  percentage,
  active = false,
}) => (
  <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-[var(--line)]">
    <div
      className={`h-full transition-all duration-300 ${
        active ? 'bg-[var(--accent)] shadow-xs' : 'bg-[var(--ink-muted)] opacity-30'
      }`}
      style={{ width: `${percentage}%` }}
    />
  </div>
);

const OutlineBranch: React.FC<OutlineBranchProps> = ({
  items,
  activeItemId,
  onSelectHeading,
}) => (
  <div className="space-y-1">
    {items.map((item) => {
      const isActive = activeItemId === item.id;
      return (
        <React.Fragment key={item.id}>
          <button
            type="button"
            aria-current={isActive ? 'location' : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelectHeading(item)}
            className={`group relative w-full rounded-[var(--radius-sm)] py-2 pr-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer ${
              isActive
                ? 'bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] font-semibold shadow-2xs'
                : 'border border-transparent hover:border-[var(--line)] hover:bg-[var(--surface)] text-stone-700 dark:text-stone-200 hover:text-stone-950 dark:hover:text-white'
            }`}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-1 w-1 rounded-full bg-[var(--accent)]"
              />
            )}
            <div className={LEVEL_INDENT[item.level]}>
              <div className="flex items-start gap-2.5">
                <span
                  className={`min-w-0 flex-1 truncate transition-colors ${
                    isActive
                      ? `${LEVEL_TEXT[item.level]} text-[var(--accent-dark)] font-bold`
                      : `${LEVEL_TEXT[item.level]} ${
                          item.level === 1
                            ? 'text-stone-900 dark:text-stone-100 font-bold'
                            : item.level === 2
                              ? 'text-stone-800 dark:text-stone-200 font-semibold'
                              : 'text-stone-600 dark:text-stone-400 font-medium'
                        } group-hover:text-stone-950 dark:group-hover:text-white`
                  }`}
                >
                  {item.title}
                </span>
                <div className="w-12 shrink-0 pt-0.5 text-right">
                  <span
                    className={`block font-mono text-[10px] leading-none tabular-nums ${
                      isActive ? 'font-bold text-[var(--accent)]' : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {item.percentage}%
                  </span>
                  <span className="block font-mono text-[9px] mt-0.5 leading-none text-stone-400 dark:text-stone-500">
                    {formatOutlineDuration(item.durationSeconds)}
                  </span>
                  <OutlineProgress percentage={item.percentage} active={isActive} />
                </div>
              </div>
            </div>
          </button>

          {item.children.length > 0 && (
            <OutlineBranch
              items={item.children}
              activeItemId={activeItemId}
              onSelectHeading={onSelectHeading}
            />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

export const ScriptOutlinePanel: React.FC<ScriptOutlinePanelProps> = ({
  isOpen,
  outline,
  activeItemId,
  onClose,
  onSelectHeading,
  onInjectFourActOutline,
}) => {
  if (!isOpen) return null;

  const handleSelectHeading = (item: OutlineItem) => {
    onSelectHeading(item);
    if (!window.matchMedia('(min-width: 1280px)').matches) onClose();
  };

  return (
    <aside className="script-outline-panel absolute left-3 sm:left-4 top-3 sm:top-4 bottom-3 sm:bottom-4 z-30 flex w-72 sm:w-80 flex-col rounded-xl bg-[var(--canvas)] border border-[var(--line)] shadow-md animate-in slide-in-from-left duration-200 overflow-hidden">
      {/* Ambient Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 h-11 px-3.5 border-b border-[var(--line)] bg-[var(--canvas)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
            <Compass className="h-3.5 w-3.5 shrink-0" />
          </div>
          <h3 className="shrink-0 text-xs font-bold tracking-wide text-[var(--ink)]">叙事大纲</h3>
          {outline.flatItems.length > 0 && (
            <span className="rounded-full bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.2 font-mono text-[10px] font-semibold text-stone-700 dark:text-stone-300">
              {outline.flatItems.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="truncate font-mono text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
            {formatOutlineDuration(outline.totalDurationSeconds)}
          </span>
          <button
            type="button"
            aria-label="收起文案大纲"
            onClick={onClose}
            className="p-1 text-stone-500 dark:text-stone-400 transition-colors hover:text-[var(--ink)] rounded-[var(--radius-sm)] hover:bg-[var(--surface)] cursor-pointer"
            title="收起文案大纲 (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Navigation List */}
      <FloatingScrollbar className="p-3 space-y-2" wrapperClassName="flex-1 min-h-0">
        {!outline.hasHeadings ? (
          <div className="py-8 px-2 text-center space-y-3">
            <div className="mx-auto w-10 h-10 rounded-xl bg-[var(--surface)] text-[var(--accent)] flex items-center justify-center border border-[var(--line)] shadow-2xs">
              <Compass className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-[var(--ink)]">尚未识别到章节标题</p>
              <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                在正文使用 H1、H2、H3 即可自动生成层级大纲与时长占比。
              </p>
            </div>

            {onInjectFourActOutline && (
              <button
                type="button"
                onClick={onInjectFourActOutline}
                className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--accent)] hover:text-white px-3 py-2 text-xs font-semibold text-stone-800 dark:text-stone-200 active:scale-98 transition-all cursor-pointer shadow-2xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>插入故事结构</span>
              </button>
            )}
          </div>
        ) : (
          <div>
            {outline.leadCharCount > 0 && (
              <div className="py-2 px-2.5 rounded-[var(--radius-sm)] mb-1 bg-[var(--surface)] border border-[var(--line)] shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium leading-5 text-stone-600 dark:text-stone-400">
                    导语 / 开篇
                  </span>
                  <div className="w-12 shrink-0 pt-0.5 text-right">
                    <span className="block font-mono text-[10px] leading-none tabular-nums text-stone-500 dark:text-stone-400">
                      {outline.leadPercentage}%
                    </span>
                    <OutlineProgress percentage={outline.leadPercentage} />
                  </div>
                </div>
              </div>
            )}
            <OutlineBranch
              items={outline.items}
              activeItemId={activeItemId}
              onSelectHeading={handleSelectHeading}
            />

            {onInjectFourActOutline && (
              <div className="pt-3 mt-3 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={onInjectFourActOutline}
                  className="w-full flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--canvas)] text-stone-700 dark:text-stone-300 hover:text-[var(--ink)] px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer shadow-2xs"
                >
                  <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                  <span>追加故事结构</span>
                </button>
              </div>
            )}
          </div>
        )}
      </FloatingScrollbar>
    </aside>
  );
};
